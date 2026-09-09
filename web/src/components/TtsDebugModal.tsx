import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OPENROUTER_TTS_MODELS } from '../data/openRouterTtsModels'
import type { TtsDebugLanguage, TtsDebugResult, TtsDebugRun } from '../types'
import { createPendingTtsResult, estimateTtsCostUsd, revokeTtsDebugAudio, runTtsDebugTest, TTS_DEBUG_MAX_CHARACTERS } from '../services/ttsDebug'
import { loadRecentTtsDebugRuns, saveTtsDebugRun } from '../services/ttsDebugStorage'
import { TtsDebugResultCard } from './TtsDebugResultCard'

interface Props { isOpen: boolean; onClose: () => void }

const INITIAL_TEXTS: Record<TtsDebugLanguage, string> = {
  zh: '你好，今天过得怎么样？学习中文很有意思，对吧？',
  ja: 'こんにちは。今日はどうだった？中国語の勉強は楽しいよね。',
  mixed: '你好。今日は元気？中国語の発音を一緒に練習しよう。',
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
  const audioUrls = useRef(new Set<string>())

  const characterCount = Array.from(text).length
  const isRunning = results.some((item) => item.status === 'running' || item.status === 'pending')
  const completedCount = results.filter((item) => item.status === 'success' || item.status === 'error' || item.status === 'cancelled').length
  const selectedModels = useMemo(() => OPENROUTER_TTS_MODELS.filter((model) => selectedIds.has(model.id)), [selectedIds])
  const estimatedCost = useMemo(() => selectedModels.reduce((sum, model) => sum + (estimateTtsCostUsd(model.id, text) || 0), 0), [selectedModels, text])
  const hasUnknownCost = selectedModels.some((model) => estimateTtsCostUsd(model.id, text) === undefined)

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

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort())
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const executeModel = useCallback(async (modelId: string) => {
    const previous = results.find((item) => item.modelId === modelId)
    if (previous?.audioUrl) {
      revokeTtsDebugAudio(previous)
      audioUrls.current.delete(previous.audioUrl)
    }
    const controller = new AbortController()
    controllers.current.set(modelId, controller)
    updateResult({ ...createPendingTtsResult(modelId, text), status: 'running', timing: { requestStartedAt: Date.now() } })
    const result = await runTtsDebugTest({ modelId, text: text.trim(), speed, signal: controller.signal, ignoreCache })
    controllers.current.delete(modelId)
    if (result.audioUrl) audioUrls.current.add(result.audioUrl)
    updateResult(result)
  }, [ignoreCache, results, speed, text, updateResult])

  const validateInput = () => {
    if (!text.trim()) {
      setMessage('テストテキストを入力してください。')
      return false
    }
    if (characterCount > TTS_DEBUG_MAX_CHARACTERS) {
      setMessage(TTS_DEBUG_MAX_CHARACTERS + '文字以内にしてください。')
      return false
    }
    return true
  }

  const prepareRun = (modelIds: string[]) => {
    setRunId(createRunId())
    setRunCreatedAt(new Date().toISOString())
    setResults(modelIds.map((modelId) => createPendingTtsResult(modelId, text)))
    setMessage('')
  }

  const runAll = async () => {
    if (!validateInput() || selectedModels.length === 0) {
      if (selectedModels.length === 0) setMessage('検証するモデルを選択してください。')
      return
    }
    const cost = '$' + estimatedCost.toFixed(6) + (hasUnknownCost ? '＋算出不可モデル' : '')
    if (!window.confirm(selectedModels.length + 'モデルを実行します。推定費用:' + cost + '\n続行しますか？')) return
    const ids = selectedModels.map((model) => model.id)
    prepareRun(ids)
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

  const runOne = async (modelId: string) => {
    if (!validateInput()) return
    prepareRun([modelId])
    await executeModel(modelId)
  }

  const stopAll = () => {
    controllers.current.forEach((controller) => controller.abort())
    controllers.current.clear()
    setResults((current) => current.map((item) => item.status === 'pending' ? { ...item, status: 'cancelled', errorMessage: '停止しました' } : item))
  }

  const close = () => {
    stopAll()
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url))
    audioUrls.current.clear()
    onClose()
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
    setRunId(run.id)
    setRunCreatedAt(run.createdAt)
    setText(run.inputText)
    setLanguage(run.language)
    setSpeed(run.speed)
    setSelectedIds(new Set(run.modelIds))
    setResults(run.results)
    setMessage('保存済み結果です。音声は再試行すると生成されます。')
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
      <section className={'tts-debug-modal'} onClick={(event) => event.stopPropagation()}>
        <header className={'tts-debug-header'}><div><h2>OpenRouter TTSモデル検証</h2><p>同じテキストで応答速度と音質を比較します。</p></div><button type={'button'} onClick={close} aria-label={'閉じる'}>×</button></header>
        <main className={'tts-debug-content'}>
          <section className={'tts-debug-input'}>
            <nav>{(['zh','ja','mixed'] as const).map((item) => <button type={'button'} key={item} data-active={language === item} onClick={() => changeLanguage(item)}>{item === 'zh' ? '中国語' : item === 'ja' ? '日本語' : '日中混合'}</button>)}</nav>
            <textarea value={text} onChange={(event) => setText(event.target.value)} />
            <div className={'tts-debug-options'}>
              <span data-invalid={characterCount > TTS_DEBUG_MAX_CHARACTERS}>{characterCount}/{TTS_DEBUG_MAX_CHARACTERS}文字</span>
              <label>速度<input type={'range'} min={0.5} max={2} step={0.1} value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />{speed.toFixed(1)}</label>
              <label><input type={'checkbox'} checked={ignoreCache} onChange={(event) => setIgnoreCache(event.target.checked)} />キャッシュを無視</label>
            </div>
            <aside><b>対象:{selectedModels.length}モデル</b><span>推定:${estimatedCost.toFixed(6)}{hasUnknownCost ? '＋算出不可' : ''}</span><span>進捗:{completedCount}/{results.length}</span><button type={'button'} onClick={() => void runAll()} disabled={isRunning}>選択モデルを実行</button><button type={'button'} onClick={stopAll} disabled={!isRunning}>全停止</button></aside>
            {message ? <p className={'tts-debug-message'}>{message}</p> : null}
          </section>
          <section className={'tts-debug-models'}>
            {OPENROUTER_TTS_MODELS.map((model) => <article key={model.id} data-selected={selectedIds.has(model.id)}><label><input type={'checkbox'} checked={selectedIds.has(model.id)} onChange={() => toggleModel(model.id)} /><b>{model.displayName}</b></label><small>{model.priceNote}</small><small>Voice:{model.defaultVoice || 'プロバイダ既定'}</small><button type={'button'} onClick={() => void runOne(model.id)} disabled={isRunning}>このモデルだけ検証</button></article>)}
          </section>
          {results.length ? <section><header className={'tts-debug-results-header'}><h3>検証結果</h3><button type={'button'} onClick={() => void copyJson()}>JSONコピー</button></header><div className={'tts-debug-results'}>{results.map((result) => { const model = OPENROUTER_TTS_MODELS.find((item) => item.id === result.modelId); return model ? <TtsDebugResultCard key={result.modelId} model={model} result={result} onRetry={() => void executeModel(result.modelId)} onChange={updateResult} /> : null })}</div></section> : null}
          {history.length ? <section className={'tts-debug-history'}><h3>保存済み履歴</h3><div>{history.map((run) => <button type={'button'} key={run.id} onClick={() => restoreRun(run)}><b>{new Date(run.createdAt).toLocaleString()}</b><span>{run.modelIds.length}モデル・{run.inputText.slice(0,24)}</span></button>)}</div></section> : null}
        </main>
      </section>
    </div>
  )
}
