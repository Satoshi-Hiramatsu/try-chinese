import { useEffect, useMemo, useRef, useState } from 'react'
import type { Friend, LlmDebugResult, LlmDebugRun } from '../types'
import {
  createPendingLlmResult,
  describeSchemaIssues,
  getLlmDebugRunBlockReason,
  LLM_CANDIDATES,
  LLM_DEBUG_PRESETS,
  runLlmDebugSequence,
  type LlmDebugRunBlockReason,
} from '../services/llmDebug'
import { DEBUG_DEFAULT_ITERATIONS, DEBUG_MAX_ITERATIONS } from '../services/debugRunner'
import { DEBUG_RUN_STORES, loadRecentDebugRuns, saveDebugRun } from '../services/debugStorage'

interface Props {
  friends: readonly Friend[]
  currentFriend: Friend
  hskLevel: number
}

const BLOCK_MESSAGES: Record<LlmDebugRunBlockReason, string> = {
  'empty-message': '発話を入力してください。',
  'no-model': '比較するモデルを1件以上選択してください。',
  'bad-iterations': `反復回数は1〜${DEBUG_MAX_ITERATIONS}回で指定してください。`,
}

function createRunId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'llm-' + Date.now()
}

function formatCost(cost?: number): string {
  return cost === undefined ? '—' : `$${cost.toFixed(6)}`
}

export function LlmDebugPane({ friends, currentFriend, hskLevel }: Props) {
  const [message, setMessage] = useState(LLM_DEBUG_PRESETS[0].message)
  const [friendId, setFriendId] = useState(currentFriend.id || '')
  const [level, setLevel] = useState(hskLevel)
  const [iterations, setIterations] = useState(DEBUG_DEFAULT_ITERATIONS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(LLM_CANDIDATES.filter((model) => model.featured).map((model) => model.id))
  )
  const [results, setResults] = useState<LlmDebugResult[]>([])
  const [history, setHistory] = useState<LlmDebugRun[]>([])
  const [notice, setNotice] = useState('')
  const controllers = useRef(new Map<string, AbortController>())

  const friend = useMemo(
    () => friends.find((item) => item.id === friendId) || currentFriend,
    [currentFriend, friendId, friends]
  )
  const isRunning = results.some((item) => item.status === 'running' || item.status === 'pending')
  const selectedModels = LLM_CANDIDATES.filter((model) => selectedIds.has(model.id))
  const blockReason = getLlmDebugRunBlockReason({ message, selectedCount: selectedModels.length, iterations })

  useEffect(() => {
    void loadRecentDebugRuns<LlmDebugRun>(DEBUG_RUN_STORES.llm, 5).then(setHistory).catch(() => undefined)
  }, [])

  useEffect(() => {
    return () => controllers.current.forEach((controller) => controller.abort())
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
    if (blockReason) return
    stopAll()
    setNotice('')

    const targets = selectedModels.map((model) => model.id)
    setResults(targets.map((modelId) => createPendingLlmResult(modelId)))

    const updateResult = (next: LlmDebugResult) => {
      setResults((previous) => previous.map((item) => (item.modelId === next.modelId ? next : item)))
    }

    const finished = await Promise.all(
      targets.map(async (modelId) => {
        const controller = new AbortController()
        controllers.current.set(modelId, controller)
        try {
          return await runLlmDebugSequence(createPendingLlmResult(modelId), {
            modelId,
            message,
            friend,
            hskLevel: level,
            iterations,
            signal: controller.signal,
            onProgress: updateResult,
          })
        } finally {
          controllers.current.delete(modelId)
        }
      })
    )

    setResults(finished)

    const run: LlmDebugRun = {
      id: createRunId(),
      createdAt: new Date().toISOString(),
      message,
      friendId: friend.id,
      hskLevel: level,
      iterations,
      modelIds: targets,
      results: finished,
    }
    try {
      await saveDebugRun(DEBUG_RUN_STORES.llm, run)
      setHistory(await loadRecentDebugRuns<LlmDebugRun>(DEBUG_RUN_STORES.llm, 5))
    } catch {
      setNotice('結果は表示できましたが、履歴の保存に失敗しました。')
    }
  }

  // 速い順。約束を守れていないモデルは速くても選べないので、印を強く出す。
  const sortedResults = useMemo(
    () => [...results].sort((left, right) =>
      (left.metrics.averageRequestToCompleteMs ?? Infinity) - (right.metrics.averageRequestToCompleteMs ?? Infinity)
    ),
    [results]
  )

  return (
    <>
      <h2 className={'stt-debug-section-title'}>1. 条件</h2>
      <section className={'stt-debug-capture'}>
        <div className={'stt-debug-capture-main'}>
          <div className={'stt-debug-models-toolbar'}>
            {LLM_DEBUG_PRESETS.map((preset) => (
              <button key={preset.id} type={'button'} onClick={() => setMessage(preset.message)}>
                {preset.label}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor={'llm-message'}>学習者の発話</label>
            <textarea
              id={'llm-message'}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={'比較したい発話を入力'}
            />
          </div>
        </div>
        <div className={'stt-debug-capture-side'}>
          <div className={'stt-debug-options'}>
            <label>
              友達
              <select id={'llm-friend'} value={friendId} onChange={(event) => setFriendId(event.target.value)}>
                {friends.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              HSK
              <select id={'llm-hsk'} value={level} onChange={(event) => setLevel(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((item) => (
                  <option key={item} value={item}>{item}級</option>
                ))}
              </select>
            </label>
            <label>
              反復
              <select id={'llm-iterations'} value={iterations} onChange={(event) => setIterations(Number(event.target.value))}>
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
              選択モデルで生成
            </button>
            <button type={'button'} className={'stt-debug-stop'} onClick={stopAll} disabled={!isRunning}>
              全停止
            </button>
            {blockReason ? <small className={'stt-debug-hint'}>{BLOCK_MESSAGES[blockReason]}</small> : null}
          </div>
          {notice ? <p className={'stt-debug-message'}>{notice}</p> : null}
        </div>
      </section>

      <h2 className={'stt-debug-section-title'}>2. 比較するモデル</h2>
      <div className={'stt-debug-models'}>
        {LLM_CANDIDATES.map((model) => (
          <label key={model.id} className={'stt-debug-model'} data-selected={selectedIds.has(model.id)}>
            <input type={'checkbox'} checked={selectedIds.has(model.id)} onChange={() => toggleModel(model.id)} />
            <span>
              <strong>{model.displayName}</strong>
              <small>{model.id}</small>
              <small>{model.note}</small>
            </span>
          </label>
        ))}
      </div>

      <h2 className={'stt-debug-section-title'}>3. 結果</h2>
      {results.length === 0 ? (
        <p className={'dev-console-placeholder'}>
          発話とモデルを選んで実行すると結果が並びます。速い順に表示し、
          返答本文への仮名混入・表情の不正・必須項目の欠落を併せて検査します。
        </p>
      ) : (
        <div className={'stt-debug-results'}>
          {sortedResults.map((result) => {
            const issues = result.schema ? describeSchemaIssues(result.schema) : ''
            return (
              <article key={result.modelId} className={'stt-debug-result'} data-status={result.status}>
                <div className={'stt-debug-result-head'}>
                  <strong>{LLM_CANDIDATES.find((model) => model.id === result.modelId)?.displayName || result.modelId}</strong>
                  <span>{result.modelId}</span>
                </div>
                <p className={'stt-debug-text'}>{result.status === 'running' ? '生成中…' : result.zh}</p>
                {result.ja ? <p className={'stt-debug-text'} style={{ fontSize: '.78rem', color: '#57534e' }}>{result.ja}</p> : null}
                <div className={'stt-debug-metrics'}>
                  <span>平均 <b>{result.metrics.averageRequestToCompleteMs ?? '—'}</b>ms</span>
                  <span>初回 <b>{result.metrics.requestToCompleteMs ?? '—'}</b>ms</span>
                  <span>出力 <b>{result.metrics.completionTokens ?? '—'}</b>tok</span>
                  <span>実費 <b>{formatCost(result.metrics.costUsd)}</b></span>
                  <span>表情 <b>{result.expression || '—'}</b></span>
                  <span>添削 <b>{result.hasCorrection === undefined ? '—' : result.hasCorrection ? 'あり' : 'なし'}</b></span>
                  <span>語彙 <b>{result.vocabularyCount ?? '—'}</b></span>
                  <span>成功 <b>{result.metrics.successCount ?? 0}/{result.metrics.attemptCount ?? 0}</b></span>
                </div>
                {issues ? <p className={'stt-debug-error'}>約束違反: {issues}</p> : null}
                {result.errorMessage ? <p className={'stt-debug-error'}>{result.errorMessage}</p> : null}
              </article>
            )
          })}
        </div>
      )}

      {history.length > 0 ? (
        <>
          <h2 className={'stt-debug-section-title'}>4. 履歴</h2>
          <div className={'stt-debug-results'}>
            {history.map((run) => (
              <article key={run.id} className={'stt-debug-result'}>
                <div className={'stt-debug-result-head'}>
                  <strong>{run.message}</strong>
                  <span>{new Date(run.createdAt).toLocaleString()}</span>
                </div>
                <div className={'stt-debug-metrics'}>
                  <span>{run.modelIds.length}モデル</span>
                  <span>{run.iterations ?? 1}回</span>
                  <span>HSK {run.hskLevel}級</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
