import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TtsDebugLanguage, TtsDebugResult, TtsDebugRun } from '../types'
import {
  countTextUnits,
  createPendingTtsResult,
  getTtsDebugRunBlockReason,
  runTtsDebugSequence,
  TTS_DEBUG_DEFAULT_ITERATIONS,
  TTS_DEBUG_MAX_CHARACTERS,
  TTS_DEBUG_MAX_ITERATIONS,
  type TtsDebugRunBlockReason,
} from '../services/ttsDebug'
import { estimateCatalogCostUsd, loadTtsCatalog, type TtsCatalog, type TtsCatalogModel } from '../services/ttsCatalog'
import { loadRecentTtsDebugRuns, saveTtsDebugRun } from '../services/ttsDebugStorage'
import { TtsDebugResultCard } from './TtsDebugResultCard'
import '../styles/ttsDebug.css'

interface Props { isOpen: boolean; onClose: () => void }

const INITIAL_TEXTS: Record<TtsDebugLanguage, string> = {
  zh: '你好，今天过得怎么样？学习中文很有意思，对吧？',
  ja: 'こんにちは。今日はどうだった？中国語の勉強は楽しいよね。',
  mixed: '你好。今日は元気？中国語の発音を一緒に練習しよう。',
}

const BLOCK_MESSAGES: Record<TtsDebugRunBlockReason, string> = {
  'empty-text': 'テストテキストを入力してください。',
  'too-long': TTS_DEBUG_MAX_CHARACTERS + '文字以内にしてください。',
  'no-model': '検証するモデルを1件以上選択してください。',
  'bad-iterations': '連続生成の回数は1〜' + TTS_DEBUG_MAX_ITERATIONS + '回で指定してください。',
}

function createRunId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'tts-' + Date.now()
}

export function TtsDebugModal({ isOpen, onClose }: Props) {
  const [language, setLanguage] = useState<TtsDebugLanguage>('zh')
  const [text, setText] = useState(INITIAL_TEXTS.zh)
  const [speed, setSpeed] = useState(1)
  const [iterations, setIterations] = useState(TTS_DEBUG_DEFAULT_ITERATIONS)
  const [ignoreCache, setIgnoreCache] = useState(true)
  const [catalog, setCatalog] = useState<TtsCatalogModel[]>([])
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  /** モデルIDごとに選んだ話者。未設定ならカタログ由来の既定話者を使う。 */
  const [voiceIds, setVoiceIds] = useState<Record<string, string>>({})
  const [results, setResults] = useState<TtsDebugResult[]>([])
  const [runId, setRunId] = useState<string>()
  const [runCreatedAt, setRunCreatedAt] = useState<string>()
  const [history, setHistory] = useState<TtsDebugRun[]>([])
  const [message, setMessage] = useState('')
  const controllers = useRef(new Map<string, AbortController>())
  /** 取得中／取得済みのモデル一覧。重複取得を避けるため保持する。 */
  const catalogRequest = useRef<Promise<TtsCatalog>>(undefined)
  /** モデルIDごとの再生用URL。結果配列の参照が古くても確実に解放できるようrefで持つ。 */
  const audioUrls = useRef(new Map<string, string[]>())

  const characterCount = Array.from(text).length
  const isRunning = results.some((item) => item.status === 'running' || item.status === 'pending')
  const completedCount = results.filter((item) => item.status === 'success' || item.status === 'error' || item.status === 'cancelled').length
  const catalogById = useMemo(() => new Map(catalog.map((model) => [model.id, model])), [catalog])
  const selectedModels = useMemo(() => catalog.filter((model) => selectedIds.has(model.id)), [catalog, selectedIds])
  /** 連続生成は回数分だけ課金されるため、推定費用にも回数を掛ける。 */
  const estimatedCost = useMemo(
    () => selectedModels.reduce((sum, model) => sum + (estimateCatalogCostUsd(model, text) || 0) * iterations, 0),
    [iterations, selectedModels, text]
  )
  const hasUnknownCost = selectedModels.some((model) => estimateCatalogCostUsd(model, text) === undefined)
  const runBlockReason = getTtsDebugRunBlockReason({ text, selectedCount: selectedModels.length, iterations })
  const voiceOf = useCallback(
    (modelId: string) => voiceIds[modelId] || catalogById.get(modelId)?.defaultVoice,
    [catalogById, voiceIds]
  )

  const releaseAudio = useCallback((modelId: string) => {
    const urls = audioUrls.current.get(modelId)
    if (!urls) return
    urls.forEach((url) => URL.revokeObjectURL(url))
    audioUrls.current.delete(modelId)
  }, [])

  /** 結果一覧をまるごと入れ替えるときは、表示から消える音声も解放する。 */
  const releaseAllAudio = useCallback(() => {
    audioUrls.current.forEach((urls) => urls.forEach((url) => URL.revokeObjectURL(url)))
    audioUrls.current.clear()
  }, [])

  const updateResult = useCallback((next: TtsDebugResult) => {
    setResults((current) => current.map((item) => item.modelId === next.modelId ? next : item))
  }, [])

  useEffect(() => {
    if (!isOpen) return
    void loadRecentTtsDebugRuns().then(setHistory).catch(() => setMessage('保存済み履歴を読み込めませんでした。'))
  }, [isOpen])

  // OpenRouterで音声出力できるモデルは随時変わるため、初回に開いた時点で取得する。
  // 取得中のPromiseをrefで持ち、再マウントされても取得をやり直さない。
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    if (!catalogRequest.current) {
      setCatalogState('loading')
      catalogRequest.current = loadTtsCatalog()
    }
    catalogRequest.current
      .then(({ models, stale }) => {
        if (cancelled) return
        setCatalog(models)
        setCatalogState('ready')
        setSelectedIds((current) => current.size > 0 ? current : new Set(models.filter((model) => model.languages.includes('zh')).map((model) => model.id)))
        if (stale) setMessage('OpenRouterのモデル一覧を取得できなかったため、既知のモデルのみ表示しています。')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // 失敗した取得は保持せず、開き直したときに再取得できるようにする。
        catalogRequest.current = undefined
        setCatalogState('error')
        setMessage(error instanceof Error ? error.message : 'モデル一覧を取得できませんでした。')
      })
    return () => { cancelled = true }
  }, [isOpen])

  useEffect(() => {
    if (!runId || !runCreatedAt || results.length === 0) return
    const run: TtsDebugRun = { id: runId, createdAt: runCreatedAt, inputText: text, language, speed, iterations, voiceIds, modelIds: results.map((item) => item.modelId), results }
    const timer = window.setTimeout(() => void saveTtsDebugRun(run).then(() => loadRecentTtsDebugRuns()).then(setHistory).catch(() => setMessage('検証結果を保存できませんでした。')), 150)
    return () => window.clearTimeout(timer)
  }, [iterations, language, results, runCreatedAt, runId, speed, text, voiceIds])

  useEffect(() => {
    const urls = audioUrls.current
    const abortControllers = controllers.current
    return () => {
      abortControllers.forEach((controller) => controller.abort())
      urls.forEach((list) => list.forEach((url) => URL.revokeObjectURL(url)))
    }
  }, [])

  const trackAudio = useCallback((modelId: string, result: TtsDebugResult) => {
    const urls = (result.attempts || []).map((attempt) => attempt.audioUrl).filter((url): url is string => url !== undefined)
    audioUrls.current.set(modelId, urls)
  }, [])

  const executeModel = useCallback(async (modelId: string) => {
    releaseAudio(modelId)
    const model = catalogById.get(modelId)
    const controller = new AbortController()
    controllers.current.set(modelId, controller)
    const base = createPendingTtsResult(modelId, text, {
      voiceId: voiceOf(modelId),
      estimatedCostUsd: model ? estimateCatalogCostUsd(model, text) : undefined,
      iterations,
    })
    updateResult({ ...base, status: 'running', timing: { requestStartedAt: Date.now() } })
    const result = await runTtsDebugSequence(base, {
      modelId,
      text: text.trim(),
      speed,
      voiceId: voiceOf(modelId),
      signal: controller.signal,
      ignoreCache,
      iterations,
      onProgress: (partial) => {
        trackAudio(modelId, partial)
        updateResult(partial)
      },
    })
    controllers.current.delete(modelId)
    trackAudio(modelId, result)
    updateResult(result)
  }, [catalogById, ignoreCache, iterations, releaseAudio, speed, text, trackAudio, updateResult, voiceOf])

  const stopAll = useCallback(() => {
    controllers.current.forEach((controller) => controller.abort())
    controllers.current.clear()
    setResults((current) => current.map((item) => item.status === 'pending' ? { ...item, status: 'cancelled', errorMessage: '停止しました' } : item))
  }, [])

  const close = useCallback(() => {
    stopAll()
    releaseAllAudio()
    onClose()
  }, [onClose, releaseAllAudio, stopAll])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, isOpen])

  /** 課金が発生するため、対象数・入力量・推定費用を必ず提示してから実行する。 */
  const confirmRun = (targets: readonly TtsCatalogModel[]): boolean => {
    const units = countTextUnits(text)
    const costs = targets.map((model) => estimateCatalogCostUsd(model, text))
    const total = costs.reduce<number>((sum, value) => sum + (value || 0), 0) * iterations
    const unknownCount = costs.filter((value) => value === undefined).length
    const lines = [
      'OpenRouter APIを実行します。',
      '対象モデル: ' + targets.length + '件',
      '連続生成: 1モデルあたり' + iterations + '回（合計' + targets.length * iterations + 'リクエスト）',
      '入力: ' + units.characters + '文字 / ' + units.utf8Bytes + 'バイト(UTF-8)',
      '推定費用: $' + total.toFixed(6),
    ]
    if (unknownCount > 0) lines.push('算出不能: ' + unknownCount + '件（音声トークン課金のため文字数からは確定できません）')
    lines.push('', '実行しますか？')
    return window.confirm(lines.join('\n'))
  }

  const runAll = async () => {
    if (runBlockReason) {
      setMessage(BLOCK_MESSAGES[runBlockReason])
      return
    }
    if (!confirmRun(selectedModels)) return
    const ids = selectedModels.map((model) => model.id)
    releaseAllAudio()
    setRunId(createRunId())
    setRunCreatedAt(new Date().toISOString())
    setResults(selectedModels.map((model) => createPendingTtsResult(model.id, text, {
      voiceId: voiceOf(model.id),
      estimatedCostUsd: estimateCatalogCostUsd(model, text),
      iterations,
    })))
    setMessage('')
    let index = 0
    const worker = async () => {
      while (index < ids.length) {
        const current = index
        index += 1
        await executeModel(ids[current])
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, ids.length) }, worker))
  }

  /** 単体実行は比較中の結果を消さず、対象モデルの行だけを差し替える。 */
  const runOne = async (model: TtsCatalogModel) => {
    const reason = getTtsDebugRunBlockReason({ text, selectedCount: 1, iterations })
    if (reason) {
      setMessage(BLOCK_MESSAGES[reason])
      return
    }
    if (!confirmRun([model])) return
    if (!runId || !runCreatedAt) {
      setRunId(createRunId())
      setRunCreatedAt(new Date().toISOString())
    }
    setMessage('')
    setResults((current) => current.some((item) => item.modelId === model.id)
      ? current
      : [...current, createPendingTtsResult(model.id, text, { voiceId: voiceOf(model.id), estimatedCostUsd: estimateCatalogCostUsd(model, text), iterations })])
    await executeModel(model.id)
  }

  const toggleModel = (modelId: string) => setSelectedIds((current) => {
    const next = new Set(current)
    if (next.has(modelId)) next.delete(modelId)
    else next.add(modelId)
    return next
  })

  const changeLanguage = (next: TtsDebugLanguage) => {
    setLanguage(next)
    setText(INITIAL_TEXTS[next])
  }

  const restoreRun = (run: TtsDebugRun) => {
    stopAll()
    releaseAllAudio()
    setRunId(run.id)
    setRunCreatedAt(run.createdAt)
    setText(run.inputText)
    setLanguage(run.language)
    setSpeed(run.speed)
    setIterations(run.iterations ?? 1)
    setVoiceIds(run.voiceIds ?? {})
    setSelectedIds(new Set(run.modelIds))
    setResults(run.results)
    setMessage('保存済み結果です。音声は保存されないため、聴き直すには再試行してください。')
  }

  const copyJson = async () => {
    if (!runId || !runCreatedAt) return
    const storedResults = results.map(({ audioUrl: _audioUrl, attempts, ...result }) => ({
      ...result,
      attempts: attempts?.map(({ audioUrl: _attemptUrl, ...attempt }) => attempt),
    }))
    const run: TtsDebugRun = { id: runId, createdAt: runCreatedAt, inputText: text, language, speed, iterations, voiceIds, modelIds: results.map((item) => item.modelId), results: storedResults }
    await navigator.clipboard.writeText(JSON.stringify(run, null, 2))
    setMessage('JSONをコピーしました。')
  }

  if (!isOpen) return null
  return (
    <div className={'tts-debug-overlay'} onClick={close}>
      <section className={'tts-debug-modal'} role={'dialog'} aria-modal={'true'} aria-labelledby={'tts-debug-title'} onClick={(event) => event.stopPropagation()}>
        <header className={'tts-debug-header'}><div><h2 id={'tts-debug-title'}>OpenRouter TTSモデル検証</h2><p>同じテキストで応答速度と音質を比較します。</p></div><button type={'button'} onClick={close} aria-label={'閉じる'}>×</button></header>
        <main className={'tts-debug-content'}>
          <h3 className={'tts-debug-section-title'}>1. テスト内容</h3>
          <section className={'tts-debug-input'}>
            <nav>{(['zh','ja','mixed'] as const).map((item) => <button type={'button'} key={item} data-active={language === item} onClick={() => changeLanguage(item)}>{item === 'zh' ? '中国語' : item === 'ja' ? '日本語' : '日中混合'}</button>)}</nav>
            <textarea value={text} onChange={(event) => setText(event.target.value)} aria-label={'テストテキスト'} placeholder={'比較したい文章を入力'} />
            <div className={'tts-debug-options'}>
              <span data-invalid={characterCount > TTS_DEBUG_MAX_CHARACTERS}>{characterCount}/{TTS_DEBUG_MAX_CHARACTERS}文字</span>
              <label>速度<input type={'range'} min={0.5} max={2} step={0.1} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />{speed.toFixed(1)}</label>
              <label title={'同じモデルで連続生成し、1回目と2回目以降の応答速度差を測ります。'}>
                連続生成
                <select value={iterations} onChange={(event) => setIterations(Number(event.target.value))}>
                  {Array.from({ length: TTS_DEBUG_MAX_ITERATIONS }, (_item, index) => index + 1).map((count) => <option key={count} value={count}>{count}回</option>)}
                </select>
              </label>
              <label><input type={'checkbox'} checked={ignoreCache} onChange={(event) => setIgnoreCache(event.target.checked)} />キャッシュを無視</label>
            </div>
            <aside>
              <b>対象:{selectedModels.length}モデル</b>
              <span>リクエスト:{selectedModels.length * iterations}件</span>
              <span>推定:${estimatedCost.toFixed(6)}{hasUnknownCost ? '＋算出不可' : ''}</span>
              <span>進捗:{completedCount}/{results.length}</span>
              <button type={'button'} className={'tts-debug-run'} onClick={() => void runAll()} disabled={isRunning || runBlockReason !== undefined}>選択モデルを実行（{selectedModels.length}件）</button>
              <button type={'button'} onClick={stopAll} disabled={!isRunning}>全停止</button>
              {runBlockReason ? <small className={'tts-debug-hint'}>{BLOCK_MESSAGES[runBlockReason]}</small> : null}
            </aside>
            {message ? <p className={'tts-debug-message'}>{message}</p> : null}
          </section>
          <h3 className={'tts-debug-section-title'}>2. 比較するモデル</h3>
          <div className={'tts-debug-models-toolbar'}>
            <button type={'button'} onClick={() => setSelectedIds(new Set(catalog.map((model) => model.id)))}>すべて選択</button>
            <button type={'button'} onClick={() => setSelectedIds(new Set(catalog.filter((model) => model.languages.includes('zh')).map((model) => model.id)))}>中国語対応のみ</button>
            <button type={'button'} onClick={() => setSelectedIds(new Set())}>すべて解除</button>
            <span>選択中: {selectedModels.length}件 / 全{catalog.length}件</span>
          </div>
          {catalogState === 'loading' ? <p className={'tts-debug-empty'}>OpenRouterのモデル一覧を取得しています…</p> : null}
          <section className={'tts-debug-models'}>
            {catalog.map((model) => (
              <article key={model.id} data-selected={selectedIds.has(model.id)}>
                <label><input type={'checkbox'} checked={selectedIds.has(model.id)} onChange={() => toggleModel(model.id)} /><b>{model.displayName}</b></label>
                <small className={'tts-debug-model-id'}>{model.id}</small>
                <small>{model.priceNote}</small>
                {model.supportedVoices.length > 0
                  ? <label className={'tts-debug-voice'}>
                      話者
                      <select value={voiceOf(model.id) || ''} onChange={(event) => setVoiceIds((current) => ({ ...current, [model.id]: event.target.value }))}>
                        {model.voicePresets.length > 0
                          ? <optgroup label={'おすすめ'}>{model.voicePresets.map((preset) => <option key={'p-' + preset.id} value={preset.id}>{preset.label}</option>)}</optgroup>
                          : null}
                        <optgroup label={'全話者（' + model.supportedVoices.length + '件）'}>
                          {model.supportedVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
                        </optgroup>
                      </select>
                    </label>
                  : <small>話者:プロバイダ既定</small>}
                {model.note ? <small className={'tts-debug-model-note'}>{model.note}</small> : null}
                <button type={'button'} onClick={() => void runOne(model)} disabled={isRunning}>このモデルだけ試す</button>
              </article>
            ))}
          </section>
          <section className={'tts-debug-results-section'}>
            <header className={'tts-debug-results-header'}>
              <h3 className={'tts-debug-section-title'}>3. 検証結果</h3>
              <div><span>完了 {completedCount} / 全 {results.length}</span><button type={'button'} onClick={() => void copyJson()} disabled={results.length === 0}>JSONをコピー</button></div>
            </header>
            {results.length
              ? <div className={'tts-debug-results'}>{results.map((result) => <TtsDebugResultCard key={result.modelId} model={catalogById.get(result.modelId)} result={result} onRetry={() => void executeModel(result.modelId)} onChange={updateResult} />)}</div>
              : <p className={'tts-debug-empty'}>まだ検証結果がありません。<br />テキストとモデルを選択して「選択モデルを実行」を押してください。</p>}
          </section>
          {history.length ? <section className={'tts-debug-history'}><h3>保存済み履歴</h3><div>{history.map((run) => <button type={'button'} key={run.id} onClick={() => restoreRun(run)}><b>{new Date(run.createdAt).toLocaleString()}</b><span>{run.modelIds.length}モデル・{run.iterations ?? 1}回・{run.inputText.slice(0,24)}</span></button>)}</div></section> : null}
        </main>
      </section>
    </div>
  )
}
