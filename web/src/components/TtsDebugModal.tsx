import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OPENROUTER_TTS_MODELS, type OpenRouterTtsModel } from '../data/openRouterTtsModels'
import type { TtsDebugLanguage, TtsDebugResult, TtsDebugRun } from '../types'
import { countTextUnits, createPendingTtsResult, estimateTtsCostUsd, getTtsDebugRunBlockReason, runTtsDebugTest, TTS_DEBUG_MAX_CHARACTERS, type TtsDebugRunBlockReason } from '../services/ttsDebug'
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
}

function createRunId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'tts-' + Date.now()
}

export function TtsDebugModal({ isOpen, onClose }: Props) {
  const [language, setLanguage] = useState<TtsDebugLanguage>('zh')
  const [text, setText] = useState(INITIAL_TEXTS.zh)
  const [speed, setSpeed] = useState(1)
  const [ignoreCache, setIgnoreCache] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(OPENROUTER_TTS_MODELS.map((model) => model.id)))
  const [results, setResults] = useState<TtsDebugResult[]>([])
  const [runId, setRunId] = useState<string>()
  const [runCreatedAt, setRunCreatedAt] = useState<string>()
  const [history, setHistory] = useState<TtsDebugRun[]>([])
  const [message, setMessage] = useState('')
  const controllers = useRef(new Map<string, AbortController>())
  /** モデルIDごとの再生用URL。結果配列の参照が古くても確実に解放できるようrefで持つ。 */
  const audioUrls = useRef(new Map<string, string>())

  const characterCount = Array.from(text).length
  const isRunning = results.some((item) => item.status === 'running' || item.status === 'pending')
  const completedCount = results.filter((item) => item.status === 'success' || item.status === 'error' || item.status === 'cancelled').length
  const selectedModels = useMemo(() => OPENROUTER_TTS_MODELS.filter((model) => selectedIds.has(model.id)), [selectedIds])
  const estimatedCost = useMemo(() => selectedModels.reduce((sum, model) => sum + (estimateTtsCostUsd(model.id, text) || 0), 0), [selectedModels, text])
  const hasUnknownCost = selectedModels.some((model) => estimateTtsCostUsd(model.id, text) === undefined)
  const runBlockReason = getTtsDebugRunBlockReason({ text, selectedCount: selectedModels.length })

  const releaseAudio = useCallback((modelId: string) => {
    const url = audioUrls.current.get(modelId)
    if (!url) return
    URL.revokeObjectURL(url)
    audioUrls.current.delete(modelId)
  }, [])

  /** 結果一覧をまるごと入れ替えるときは、表示から消える音声も解放する。 */
  const releaseAllAudio = useCallback(() => {
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url))
    audioUrls.current.clear()
  }, [])

  const updateResult = useCallback((next: TtsDebugResult) => {
    setResults((current) => current.map((item) => item.modelId === next.modelId ? next : item))
  }, [])

  useEffect(() => {
    if (isOpen) void loadRecentTtsDebugRuns().then(setHistory).catch(() => setMessage('保存済み履歴を読み込めませんでした。'))
  }, [isOpen])

  useEffect(() => {
    if (!runId || !runCreatedAt || results.length === 0) return
    const run: TtsDebugRun = { id: runId, createdAt: runCreatedAt, inputText: text, language, speed, modelIds: results.map((item) => item.modelId), results }
    const timer = window.setTimeout(() => void saveTtsDebugRun(run).then(() => loadRecentTtsDebugRuns()).then(setHistory).catch(() => setMessage('検証結果を保存できませんでした。')), 150)
    return () => window.clearTimeout(timer)
  }, [language, results, runCreatedAt, runId, speed, text])

  useEffect(() => {
    const urls = audioUrls.current
    const abortControllers = controllers.current
    return () => {
      abortControllers.forEach((controller) => controller.abort())
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const executeModel = useCallback(async (modelId: string) => {
    releaseAudio(modelId)
    const controller = new AbortController()
    controllers.current.set(modelId, controller)
    updateResult({ ...createPendingTtsResult(modelId, text), status: 'running', timing: { requestStartedAt: Date.now() } })
    const result = await runTtsDebugTest({ modelId, text: text.trim(), speed, signal: controller.signal, ignoreCache })
    controllers.current.delete(modelId)
    if (result.audioUrl) audioUrls.current.set(modelId, result.audioUrl)
    updateResult(result)
  }, [ignoreCache, releaseAudio, speed, text, updateResult])

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
  const confirmRun = (targets: readonly OpenRouterTtsModel[]): boolean => {
    const units = countTextUnits(text)
    const costs = targets.map((model) => estimateTtsCostUsd(model.id, text))
    const total = costs.reduce<number>((sum, value) => sum + (value || 0), 0)
    const unknownCount = costs.filter((value) => value === undefined).length
    const lines = [
      'OpenRouter APIを実行します。',
      '対象モデル: ' + targets.length + '件',
      '入力: ' + units.characters + '文字 / ' + units.utf8Bytes + 'バイト(UTF-8)',
      '推定費用: $' + total.toFixed(6),
    ]
    if (unknownCount > 0) lines.push('算出不能: ' + unknownCount + '件（audio-token課金のため文字数からは確定できません）')
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
    setResults(ids.map((modelId) => createPendingTtsResult(modelId, text)))
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
  const runOne = async (model: OpenRouterTtsModel) => {
    const reason = getTtsDebugRunBlockReason({ text, selectedCount: 1 })
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
    setResults((current) => current.some((item) => item.modelId === model.id) ? current : [...current, createPendingTtsResult(model.id, text)])
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
    setSelectedIds(new Set(run.modelIds))
    setResults(run.results)
    setMessage('保存済み結果です。音声は保存されないため、聴き直すには再試行してください。')
  }

  const copyJson = async () => {
    if (!runId || !runCreatedAt) return
    const storedResults = results.map(({ audioUrl: _audioUrl, ...result }) => result)
    const run: TtsDebugRun = { id: runId, createdAt: runCreatedAt, inputText: text, language, speed, modelIds: results.map((item) => item.modelId), results: storedResults }
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
              <label><input type={'checkbox'} checked={ignoreCache} onChange={(event) => setIgnoreCache(event.target.checked)} />キャッシュを無視</label>
            </div>
            <aside>
              <b>対象:{selectedModels.length}モデル</b>
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
            <button type={'button'} onClick={() => setSelectedIds(new Set(OPENROUTER_TTS_MODELS.map((model) => model.id)))}>すべて選択</button>
            <button type={'button'} onClick={() => setSelectedIds(new Set())}>すべて解除</button>
            <span>選択中: {selectedModels.length}件</span>
          </div>
          <section className={'tts-debug-models'}>
            {OPENROUTER_TTS_MODELS.map((model) => <article key={model.id} data-selected={selectedIds.has(model.id)}><label><input type={'checkbox'} checked={selectedIds.has(model.id)} onChange={() => toggleModel(model.id)} /><b>{model.displayName}</b></label><small>{model.priceNote}</small><small>Voice:{model.defaultVoice || 'プロバイダ既定'}</small><button type={'button'} onClick={() => void runOne(model)} disabled={isRunning}>このモデルだけ試す</button></article>)}
          </section>
          <section className={'tts-debug-results-section'}>
            <header className={'tts-debug-results-header'}>
              <h3 className={'tts-debug-section-title'}>3. 検証結果</h3>
              <div><span>完了 {completedCount} / 全 {results.length}</span><button type={'button'} onClick={() => void copyJson()} disabled={results.length === 0}>JSONをコピー</button></div>
            </header>
            {results.length
              ? <div className={'tts-debug-results'}>{results.map((result) => { const model = OPENROUTER_TTS_MODELS.find((item) => item.id === result.modelId); return model ? <TtsDebugResultCard key={result.modelId} model={model} result={result} onRetry={() => void executeModel(result.modelId)} onChange={updateResult} /> : null })}</div>
              : <p className={'tts-debug-empty'}>まだ検証結果がありません。<br />テキストとモデルを選択して「選択モデルを実行」を押してください。</p>}
          </section>
          {history.length ? <section className={'tts-debug-history'}><h3>保存済み履歴</h3><div>{history.map((run) => <button type={'button'} key={run.id} onClick={() => restoreRun(run)}><b>{new Date(run.createdAt).toLocaleString()}</b><span>{run.modelIds.length}モデル・{run.inputText.slice(0,24)}</span></button>)}</div></section> : null}
        </main>
      </section>
    </div>
  )
}
