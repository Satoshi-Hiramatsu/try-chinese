import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SttDebugResult, SttDebugRun } from '../types'
import {
  createPendingSttResult,
  getSttDebugRunBlockReason,
  runSttDebugSequence,
  STT_DEBUG_MAX_AUDIO_SECONDS,
  type SttDebugRunBlockReason,
} from '../services/sttDebug'
import { DEBUG_DEFAULT_ITERATIONS, DEBUG_MAX_ITERATIONS } from '../services/debugRunner'
import { loadSttCatalog, type SttCatalogModel } from '../services/sttCatalog'
import { loadRecentSttDebugRuns, saveSttDebugRun } from '../services/sttDebugStorage'
import { blobToBase64, isRecordingSupported, startRecording, type RecorderController, type RecordingResult } from '../services/recorder'

const BLOCK_MESSAGES: Record<SttDebugRunBlockReason, string> = {
  'no-audio': 'まず音声を録音してください。',
  'no-model': '比較するモデルを1件以上選択してください。',
  'bad-iterations': `反復回数は1〜${DEBUG_MAX_ITERATIONS}回で指定してください。`,
  'too-long': `録音は${STT_DEBUG_MAX_AUDIO_SECONDS}秒以内にしてください。`,
}

/** 言語指定の選択肢。既定は自動判定で、手動トグルを廃止できるかの確認に使う。 */
const LANGUAGE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: '自動判定' },
  { value: 'zh', label: '中国語 (zh)' },
  { value: 'ja', label: '日本語 (ja)' },
]

function createRunId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'stt-' + Date.now()
}

/** 文字誤り率の目安。0.1未満なら実用、0.3以上は使いものにならない。 */
function cerQuality(rate: number): 'good' | 'fair' | 'poor' {
  if (rate < 0.1) return 'good'
  if (rate < 0.3) return 'fair'
  return 'poor'
}

function formatCer(rate?: number): string {
  return rate === undefined ? '—' : `${(rate * 100).toFixed(1)}%`
}

function formatCost(cost?: number): string {
  return cost === undefined ? '—' : `$${cost.toFixed(6)}`
}

export function SttDebugPane() {
  const [catalog, setCatalog] = useState<SttCatalogModel[]>([])
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [referenceText, setReferenceText] = useState('')
  const [language, setLanguage] = useState('')
  const [iterations, setIterations] = useState(DEBUG_DEFAULT_ITERATIONS)
  const [recording, setRecording] = useState(false)
  const [level, setLevel] = useState(0)
  const [audio, setAudio] = useState<RecordingResult>()
  const [audioUrl, setAudioUrl] = useState<string>()
  const [results, setResults] = useState<SttDebugResult[]>([])
  const [history, setHistory] = useState<SttDebugRun[]>([])
  const [message, setMessage] = useState('')
  const recorderRef = useRef<RecorderController>(undefined)
  const controllers = useRef(new Map<string, AbortController>())

  const isRunning = results.some((item) => item.status === 'running' || item.status === 'pending')
  const selectedModels = useMemo(() => catalog.filter((model) => selectedIds.has(model.id)), [catalog, selectedIds])
  const blockReason = getSttDebugRunBlockReason({
    hasAudio: audio !== undefined,
    selectedCount: selectedModels.length,
    iterations,
    audioDurationMs: audio?.durationMs,
  })

  useEffect(() => {
    setCatalogState('loading')
    loadSttCatalog()
      .then((loaded) => {
        setCatalog(loaded.models)
        setCatalogState('ready')
        // 調査済みのモデルだけを初期選択にして、いきなり20件叩かないようにする。
        setSelectedIds(new Set(loaded.models.filter((model) => model.featured).map((model) => model.id)))
        if (loaded.stale) setMessage('モデル一覧を取得できなかったため、既知の一覧を表示しています。')
      })
      .catch(() => setCatalogState('error'))
  }, [])

  useEffect(() => {
    void loadRecentSttDebugRuns(5).then(setHistory).catch(() => undefined)
  }, [])

  // 録音のたびに作る一時URLは、差し替え時と離脱時に必ず解放する。
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
      controllers.current.forEach((controller) => controller.abort())
    }
  }, [])

  const startCapture = useCallback(async () => {
    if (!isRecordingSupported()) {
      setMessage('このブラウザは録音に対応していません。')
      return
    }
    try {
      setMessage('')
      recorderRef.current = await startRecording({ onLevel: setLevel })
      setRecording(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'マイクを開始できませんでした。')
    }
  }, [])

  const stopCapture = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder) return
    recorderRef.current = undefined
    const result = await recorder.stop()
    setRecording(false)
    setLevel(0)
    setAudio(result)
    setAudioUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return URL.createObjectURL(result.blob)
    })
    setResults([])
  }, [])

  const toggleModel = (modelId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

  const stopAll = () => {
    controllers.current.forEach((controller) => controller.abort())
    controllers.current.clear()
  }

  const runAll = async () => {
    if (!audio || blockReason) return
    stopAll()
    setMessage('')

    const audioBase64 = await blobToBase64(audio.blob)
    const targets = selectedModels.map((model) => model.id)
    setResults(targets.map((modelId) => createPendingSttResult(modelId)))

    const updateResult = (next: SttDebugResult) => {
      setResults((previous) => previous.map((item) => (item.modelId === next.modelId ? next : item)))
    }

    // 同じ音声を同時に投げる。モデル間の速度差をそのまま比べたいので並列で回す。
    const finished = await Promise.all(
      targets.map(async (modelId) => {
        const controller = new AbortController()
        controllers.current.set(modelId, controller)
        try {
          return await runSttDebugSequence(createPendingSttResult(modelId), {
            modelId,
            audioBase64,
            format: audio.format,
            language: language || undefined,
            iterations,
            referenceText,
            signal: controller.signal,
            onProgress: updateResult,
          })
        } finally {
          controllers.current.delete(modelId)
        }
      })
    )

    setResults(finished)

    const run: SttDebugRun = {
      id: createRunId(),
      createdAt: new Date().toISOString(),
      referenceText,
      language: language || undefined,
      audioDurationMs: audio.durationMs,
      iterations,
      modelIds: targets,
      results: finished,
    }
    try {
      await saveSttDebugRun(run)
      setHistory(await loadRecentSttDebugRuns(5))
    } catch {
      setMessage('結果は表示できましたが、履歴の保存に失敗しました。')
    }
  }

  const sortedResults = useMemo(() => {
    // 誤り率が測れているものを上に、次に速い順。比較の目的に沿った並びにする。
    return [...results].sort((left, right) => {
      const leftCer = left.metrics.characterErrorRate
      const rightCer = right.metrics.characterErrorRate
      if (leftCer !== undefined && rightCer !== undefined && leftCer !== rightCer) return leftCer - rightCer
      if (leftCer !== undefined && rightCer === undefined) return -1
      if (leftCer === undefined && rightCer !== undefined) return 1
      return (left.metrics.averageRequestToCompleteMs ?? Infinity) - (right.metrics.averageRequestToCompleteMs ?? Infinity)
    })
  }, [results])

  return (
    <>
      <h2 className={'stt-debug-section-title'}>1. 音声を録る</h2>
      <section className={'stt-debug-capture'}>
        <div className={'stt-debug-capture-main'}>
          <div className={'stt-debug-record'}>
            <button
              type={'button'}
              data-recording={recording}
              onClick={() => void (recording ? stopCapture() : startCapture())}
              disabled={isRunning}
            >
              {recording ? '録音を止める' : '録音する'}
            </button>
            <div className={'stt-debug-meter'} aria-hidden={'true'}>
              <span style={{ width: `${Math.min(100, Math.round(level * 320))}%` }} />
            </div>
            {audio ? <span style={{ color: '#78716c', fontSize: '.72rem' }}>{(audio.durationMs / 1000).toFixed(1)}秒 / {audio.format}</span> : null}
          </div>
          {audioUrl ? <audio className={'stt-debug-audio'} controls src={audioUrl} /> : null}
          <div>
            <label htmlFor={'stt-reference'}>正解テキスト（文字誤り率の基準。空欄なら誤り率は出ません）</label>
            <textarea
              id={'stt-reference'}
              value={referenceText}
              onChange={(event) => setReferenceText(event.target.value)}
              placeholder={'録音した内容をそのまま書く。例: 我喜欢看中国电影'}
            />
          </div>
        </div>
        <div className={'stt-debug-capture-side'}>
          <div className={'stt-debug-options'}>
            <label>
              言語
              <select id={'stt-language'} value={language} onChange={(event) => setLanguage(event.target.value)}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              反復
              <select id={'stt-iterations'} value={iterations} onChange={(event) => setIterations(Number(event.target.value))}>
                {Array.from({ length: DEBUG_MAX_ITERATIONS }, (_item, index) => index + 1).map((count) => (
                  <option key={count} value={count}>{count}回</option>
                ))}
              </select>
            </label>
          </div>
          <div className={'stt-debug-summary'}>
            <b>対象 {selectedModels.length} モデル</b>
            <span>リクエスト {selectedModels.length * iterations} 件</span>
            <button type={'button'} onClick={() => void runAll()} disabled={isRunning || blockReason !== undefined}>
              選択モデルで文字起こし
            </button>
            <button type={'button'} className={'stt-debug-stop'} onClick={stopAll} disabled={!isRunning}>
              全停止
            </button>
            {blockReason ? <small className={'stt-debug-hint'}>{BLOCK_MESSAGES[blockReason]}</small> : null}
          </div>
          {message ? <p className={'stt-debug-message'}>{message}</p> : null}
        </div>
      </section>

      <h2 className={'stt-debug-section-title'}>2. 比較するモデル</h2>
      <div className={'stt-debug-models-toolbar'}>
        <button type={'button'} onClick={() => setSelectedIds(new Set(catalog.map((model) => model.id)))}>すべて選択</button>
        <button type={'button'} onClick={() => setSelectedIds(new Set(catalog.filter((model) => model.featured).map((model) => model.id)))}>調査済みのみ</button>
        <button type={'button'} onClick={() => setSelectedIds(new Set())}>すべて解除</button>
        <span>選択中 {selectedModels.length} 件 / 全 {catalog.length} 件</span>
      </div>
      {catalogState === 'loading' ? <p className={'dev-console-placeholder'}>モデル一覧を取得しています…</p> : null}
      {catalogState === 'error' ? <p className={'dev-console-placeholder'}>モデル一覧を取得できませんでした。APIキーを確認してください。</p> : null}
      <div className={'stt-debug-models'}>
        {catalog.map((model) => (
          <label key={model.id} className={'stt-debug-model'} data-selected={selectedIds.has(model.id)}>
            <input type={'checkbox'} checked={selectedIds.has(model.id)} onChange={() => toggleModel(model.id)} />
            <span>
              <strong>{model.displayName}</strong>
              <small>{model.id}</small>
              <small>{model.note}</small>
              <em>{model.recommendedUse}</em>
            </span>
          </label>
        ))}
      </div>

      <h2 className={'stt-debug-section-title'}>3. 結果</h2>
      {results.length === 0 ? (
        <p className={'dev-console-placeholder'}>
          録音してモデルを選び、実行すると結果が並びます。誤り率の低い順、次に速い順に表示します。
        </p>
      ) : (
        <div className={'stt-debug-results'}>
          {sortedResults.map((result) => (
            <article key={result.modelId} className={'stt-debug-result'} data-status={result.status}>
              <div className={'stt-debug-result-head'}>
                <strong>{catalog.find((model) => model.id === result.modelId)?.displayName || result.modelId}</strong>
                <span>{result.modelId}</span>
              </div>
              <p className={'stt-debug-text'}>{result.status === 'running' ? '実行中…' : result.text}</p>
              <div className={'stt-debug-metrics'}>
                <span className={'stt-debug-cer'} data-quality={result.metrics.characterErrorRate === undefined ? undefined : cerQuality(result.metrics.characterErrorRate)}>
                  誤り率 <b>{formatCer(result.metrics.characterErrorRate)}</b>
                </span>
                <span>平均 <b>{result.metrics.averageRequestToCompleteMs ?? '—'}</b>ms</span>
                <span>初回 <b>{result.metrics.requestToCompleteMs ?? '—'}</b>ms</span>
                <span>2回目以降 <b>{result.metrics.warmAverageRequestToFirstChunkMs ?? '—'}</b>ms</span>
                <span>判定言語 <b>{result.detectedLanguage || '—'}</b></span>
                <span>実費 <b>{formatCost(result.metrics.costUsd)}</b></span>
                <span>成功 <b>{result.metrics.successCount ?? 0}/{result.metrics.attemptCount ?? 0}</b></span>
              </div>
              {result.errorMessage ? <p className={'stt-debug-error'}>{result.errorMessage}</p> : null}
            </article>
          ))}
        </div>
      )}

      {history.length > 0 ? (
        <>
          <h2 className={'stt-debug-section-title'}>4. 履歴</h2>
          <div className={'stt-debug-results'}>
            {history.map((run) => (
              <article key={run.id} className={'stt-debug-result'}>
                <div className={'stt-debug-result-head'}>
                  <strong>{run.referenceText || '(正解テキストなし)'}</strong>
                  <span>{new Date(run.createdAt).toLocaleString()}</span>
                </div>
                <div className={'stt-debug-metrics'}>
                  <span>{run.modelIds.length}モデル</span>
                  <span>{run.iterations ?? 1}回</span>
                  <span>{run.audioDurationMs ? (run.audioDurationMs / 1000).toFixed(1) + '秒' : '—'}</span>
                  <span>言語 {run.language || '自動'}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
