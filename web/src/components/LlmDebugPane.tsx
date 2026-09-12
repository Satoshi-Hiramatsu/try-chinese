import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  Friend,
  LlmDebugResult,
  LlmDebugRun,
  LlmReplyClassification,
  LlmTopicLevel,
} from '../types'
import { isModelAllowedForTopic, LLM_TOPIC_LEVELS } from '../data/llmProbes'
import {
  buildLlmDebugTargets,
  createLlmDebugRun,
  createPendingLlmResult,
  describeSchemaIssues,
  getLlmDebugResultKey,
  getLlmDebugRunBlockReason,
  LLM_CANDIDATES,
  LLM_DEBUG_CONCURRENCY,
  LLM_DEBUG_MAX_REQUESTS,
  LLM_DEBUG_PRESETS,
  runLlmDebugSequence,
  runWithConcurrency,
  summarizeLlmClassifications,
  type LlmDebugRunBlockReason,
} from '../services/llmDebug'
import { DEBUG_DEFAULT_ITERATIONS, DEBUG_MAX_ITERATIONS } from '../services/debugRunner'
import { DEBUG_RUN_STORES, loadRecentDebugRuns, saveDebugRun } from '../services/debugStorage'

interface Props {
  friends: readonly Friend[]
  currentFriend: Friend
  hskLevel: number
}

interface ActiveRunContext {
  id: string
  createdAt: string
  topicLevel: LlmTopicLevel
  friends: readonly Friend[]
  hskLevel: number
  iterations: number
  modelIds: readonly string[]
}

const BLOCK_MESSAGES: Record<LlmDebugRunBlockReason, string> = {
  'empty-message': '発話を入力してください。',
  'no-friend': '比較するFriendを1人以上選択してください。',
  'no-model': 'この話題で利用できるモデルを1件以上選択してください。',
  'bad-iterations': `反復回数は1〜${DEBUG_MAX_ITERATIONS}回で指定してください。`,
  'too-many-requests': `1回の実行は${LLM_DEBUG_MAX_REQUESTS}リクエスト以内にしてください。`,
}

const CLASSIFICATION_LABELS: Record<LlmReplyClassification, string> = {
  refuse: '拒否',
  deflect: 'はぐらかし',
  'comply-soft': '婉曲に応答',
  comply: '応答',
  broken: '破損・エラー',
}

function friendKey(friend: Friend): string {
  return friend.id || friend.name
}

function createRunId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'llm-' + Date.now()
}

function formatCost(cost?: number): string {
  return cost === undefined ? '—' : `$${cost.toFixed(6)}`
}

function historyFriendCount(run: LlmDebugRun): number {
  const legacy = run as LlmDebugRun & { friendId?: string }
  return run.friendIds?.length ?? (legacy.friendId ? 1 : 0)
}

export function LlmDebugPane({ friends, currentFriend, hskLevel }: Props) {
  const availableFriends = friends.length > 0 ? friends : [currentFriend]
  const [message, setMessage] = useState(LLM_DEBUG_PRESETS[0].message)
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(
    () => new Set([friendKey(currentFriend)])
  )
  const [topicLevel, setTopicLevel] = useState<LlmTopicLevel>('P0')
  const [level, setLevel] = useState(hskLevel)
  const [iterations, setIterations] = useState(DEBUG_DEFAULT_ITERATIONS)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(LLM_CANDIDATES.filter((model) => model.featured).map((model) => model.id))
  )
  const [groupBy, setGroupBy] = useState<'friend' | 'model'>('friend')
  const [results, setResults] = useState<LlmDebugResult[]>([])
  const [history, setHistory] = useState<LlmDebugRun[]>([])
  const [activeRun, setActiveRun] = useState<ActiveRunContext>()
  const [notice, setNotice] = useState('')
  const controllers = useRef(new Map<string, AbortController>())

  const selectedFriends = availableFriends.filter((friend) => selectedFriendIds.has(friendKey(friend)))
  const selectedModels = LLM_CANDIDATES.filter(
    (model) => selectedIds.has(model.id) && isModelAllowedForTopic(model.id, topicLevel)
  )
  const requestCount = selectedFriends.length * selectedModels.length * iterations
  const blockReason = getLlmDebugRunBlockReason({
    message,
    selectedFriendCount: selectedFriends.length,
    selectedCount: selectedModels.length,
    iterations,
  })
  const isRunning = results.some((item) => item.status === 'running' || item.status === 'pending')

  useEffect(() => {
    void loadRecentDebugRuns<LlmDebugRun>(DEBUG_RUN_STORES.llm, 5).then(setHistory).catch(() => undefined)
  }, [])

  useEffect(() => {
    const activeControllers = controllers.current
    return () => activeControllers.forEach((controller) => controller.abort())
  }, [])

  const toggleModel = (modelId: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

  const toggleFriend = (id: string) => {
    setSelectedFriendIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stopAll = () => {
    controllers.current.forEach((controller) => controller.abort())
    controllers.current.clear()
  }

  const persistResults = async (
    nextResults: readonly LlmDebugResult[],
    context: ActiveRunContext
  ) => {
    const run = createLlmDebugRun({
      ...context,
      results: nextResults,
    })
    await saveDebugRun(DEBUG_RUN_STORES.llm, run)
  }

  const runAll = async () => {
    if (blockReason) return
    stopAll()
    setNotice('')
    setActiveRun(undefined)

    const targetFriends = [...selectedFriends]
    const targetModelIds = selectedModels.map((model) => model.id)
    const targets = buildLlmDebugTargets(targetFriends, targetModelIds)
    setResults(targets.map((target) => createPendingLlmResult(target.modelId, target.friend)))

    const updateResult = (next: LlmDebugResult) => {
      const key = getLlmDebugResultKey(next)
      setResults((previous) => previous.map((item) => (getLlmDebugResultKey(item) === key ? next : item)))
    }

    const finished = await runWithConcurrency(targets, LLM_DEBUG_CONCURRENCY, async (target) => {
      const pending = createPendingLlmResult(target.modelId, target.friend)
      const key = getLlmDebugResultKey(pending)
      const controller = new AbortController()
      controllers.current.set(key, controller)
      try {
        return await runLlmDebugSequence(pending, {
          modelId: target.modelId,
          message,
          friend: target.friend,
          hskLevel: level,
          iterations,
          signal: controller.signal,
          onProgress: updateResult,
        })
      } finally {
        controllers.current.delete(key)
      }
    })

    setResults(finished)
    const context: ActiveRunContext = {
      id: createRunId(),
      createdAt: new Date().toISOString(),
      topicLevel,
      friends: targetFriends,
      hskLevel: level,
      iterations,
      modelIds: targetModelIds,
    }
    setActiveRun(context)
    try {
      const run = createLlmDebugRun({
        ...context,
        results: finished,
      })
      await saveDebugRun(DEBUG_RUN_STORES.llm, run)
      setHistory(await loadRecentDebugRuns<LlmDebugRun>(DEBUG_RUN_STORES.llm, 5))
    } catch {
      setNotice('結果は表示できましたが、メタデータ履歴の保存に失敗しました。')
    }
  }

  const setManualClassification = (
    resultKey: string,
    attemptIndex: number,
    classification: LlmReplyClassification | undefined
  ) => {
    const next = results.map((result) => {
      if (getLlmDebugResultKey(result) !== resultKey) return result
      return {
        ...result,
        attempts: result.attempts?.map((attempt) =>
          attempt.index === attemptIndex ? { ...attempt, manualClassification: classification } : attempt
        ),
      }
    })
    setResults(next)
    if (activeRun) {
      void persistResults(next, activeRun)
        .then(() => loadRecentDebugRuns<LlmDebugRun>(DEBUG_RUN_STORES.llm, 5))
        .then(setHistory)
        .catch(() => setNotice('手動判定の保存に失敗しました。'))
    }
  }

  const sortedResults = useMemo(() => [...results].sort((left, right) => {
    const leftPrimary = groupBy === 'friend' ? left.friendName : left.modelId
    const rightPrimary = groupBy === 'friend' ? right.friendName : right.modelId
    const primary = leftPrimary.localeCompare(rightPrimary, 'ja')
    if (primary !== 0) return primary
    const leftSecondary = groupBy === 'friend' ? left.modelId : left.friendName
    const rightSecondary = groupBy === 'friend' ? right.modelId : right.friendName
    return leftSecondary.localeCompare(rightSecondary, 'ja')
  }), [groupBy, results])

  const classificationSummary = summarizeLlmClassifications(results)

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
          <div className={'stt-debug-models-toolbar'}>
            <button type={'button'} onClick={() => setSelectedFriendIds(new Set(availableFriends.map(friendKey)))}>
              Friend全選択
            </button>
            <button type={'button'} onClick={() => setSelectedFriendIds(new Set())}>Friend全解除</button>
          </div>
          <div className={'stt-debug-models'}>
            {availableFriends.map((friend) => {
              const id = friendKey(friend)
              return (
                <label key={id} className={'stt-debug-model'} data-selected={selectedFriendIds.has(id)}>
                  <input
                    type={'checkbox'}
                    checked={selectedFriendIds.has(id)}
                    onChange={() => toggleFriend(id)}
                  />
                  <span><strong>{friend.name}</strong><small>{id}</small></span>
                </label>
              )
            })}
          </div>
        </div>
        <div className={'stt-debug-capture-side'}>
          <div className={'stt-debug-options'}>
            <label>
              話題
              <select value={topicLevel} onChange={(event) => setTopicLevel(event.target.value as LlmTopicLevel)}>
                {LLM_TOPIC_LEVELS.map((topic) => (
                  <option key={topic.id} value={topic.id} disabled={!topic.enabled}>
                    {topic.label}{topic.enabled ? '' : '（無効）'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              HSK
              <select id={'llm-hsk'} value={level} onChange={(event) => setLevel(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((item) => <option key={item} value={item}>{item}級</option>)}
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
          <small className={'stt-debug-hint'}>
            {LLM_TOPIC_LEVELS.find((topic) => topic.id === topicLevel)?.description}
          </small>
          <div className={'stt-debug-summary'}>
            <b>{selectedFriends.length} Friend × {selectedModels.length} モデル × {iterations}回</b>
            <span>リクエスト {requestCount}/{LLM_DEBUG_MAX_REQUESTS} 件</span>
            <span>回答本文は画面内だけに表示し、履歴には保存しません。</span>
            <button type={'button'} onClick={() => void runAll()} disabled={isRunning || blockReason !== undefined}>
              選択条件で生成
            </button>
            <button type={'button'} className={'stt-debug-stop'} onClick={stopAll} disabled={!isRunning}>全停止</button>
            {blockReason ? <small className={'stt-debug-hint'}>{BLOCK_MESSAGES[blockReason]}</small> : null}
          </div>
          {notice ? <p className={'stt-debug-message'}>{notice}</p> : null}
        </div>
      </section>

      <h2 className={'stt-debug-section-title'}>2. 比較するモデル</h2>
      <div className={'stt-debug-models'}>
        {LLM_CANDIDATES.map((model) => {
          const allowed = isModelAllowedForTopic(model.id, topicLevel)
          return (
            <label key={model.id} className={'stt-debug-model'} data-selected={allowed && selectedIds.has(model.id)}>
              <input
                type={'checkbox'}
                checked={allowed && selectedIds.has(model.id)}
                disabled={!allowed}
                onChange={() => toggleModel(model.id)}
              />
              <span>
                <strong>{model.displayName}</strong>
                <small>{model.id}</small>
                <small>{model.note}</small>
                <em>{model.evidence}</em>
                {!allowed ? <small>P3では利用できません</small> : null}
              </span>
            </label>
          )
        })}
      </div>

      <h2 className={'stt-debug-section-title'}>3. 結果</h2>
      {results.length === 0 ? (
        <p className={'dev-console-placeholder'}>
          同じ発話に対する複数モデル・複数Friendの中国語、日本語訳、ピンイン、添削、語彙を比較します。
        </p>
      ) : (
        <>
          <div className={'stt-debug-models-toolbar'}>
            <button type={'button'} onClick={() => setGroupBy('friend')}>Friendごと</button>
            <button type={'button'} onClick={() => setGroupBy('model')}>モデルごと</button>
            <span>
              応答 {classificationSummary.comply} / 婉曲 {classificationSummary.complySoft} / 拒否 {classificationSummary.refuse}
              {' '}/ はぐらかし {classificationSummary.deflect} / 破損 {classificationSummary.broken}
            </span>
          </div>
          <div className={'stt-debug-results'}>
            {sortedResults.map((result) => {
              const resultKey = getLlmDebugResultKey(result)
              const model = LLM_CANDIDATES.find((candidate) => candidate.id === result.modelId)
              return (
                <article key={resultKey} className={'stt-debug-result'} data-status={result.status}>
                  <div className={'stt-debug-result-head'}>
                    <strong>{result.friendName} × {model?.displayName || result.modelId}</strong>
                    <span>{result.modelId}</span>
                  </div>
                  <div className={'stt-debug-metrics'}>
                    <span>平均 <b>{result.metrics.averageRequestToCompleteMs ?? '—'}</b>ms</span>
                    <span>実費 <b>{formatCost(result.metrics.costUsd)}</b></span>
                    <span>成功 <b>{result.metrics.successCount ?? 0}/{result.metrics.attemptCount ?? 0}</b></span>
                  </div>
                  {result.status === 'pending' || result.status === 'running' ? <p className={'stt-debug-text'}>生成中…</p> : null}
                  {(result.attempts || []).map((attempt) => {
                    const issues = attempt.schema ? describeSchemaIssues(attempt.schema) : ''
                    const selectedClassification = attempt.manualClassification || attempt.autoClassification
                    return (
                      <details key={attempt.index} open={attempt.index === 1}>
                        <summary>
                          試行{attempt.index} — {selectedClassification ? CLASSIFICATION_LABELS[selectedClassification] : attempt.status}
                        </summary>
                        <p className={'stt-debug-text'}>{attempt.zh}</p>
                        {attempt.pinyin ? <p className={'stt-debug-text'}>{attempt.pinyin}</p> : null}
                        {attempt.ja ? <p className={'stt-debug-text'}>{attempt.ja}</p> : null}
                        {attempt.correction?.hasCorrection ? (
                          <p className={'stt-debug-text'}>
                            添削: {attempt.correction.original || '—'} → {attempt.correction.suggested || '—'}
                            {attempt.correction.ja ? `（${attempt.correction.ja}）` : ''}
                          </p>
                        ) : null}
                        {attempt.vocabulary && attempt.vocabulary.length > 0 ? (
                          <p className={'stt-debug-text'}>
                            語彙: {attempt.vocabulary.map((item) => `${item.term} / ${item.pinyin} / ${item.ja}`).join('、')}
                          </p>
                        ) : null}
                        <div className={'stt-debug-metrics'}>
                          <span>自動 <b>{attempt.autoClassification ? CLASSIFICATION_LABELS[attempt.autoClassification] : '—'}</b></span>
                          <span>表情 <b>{attempt.expression || '—'}</b></span>
                          <span>時間 <b>{attempt.metrics.requestToCompleteMs ?? '—'}</b>ms</span>
                          <span>出力 <b>{attempt.completionTokens ?? '—'}</b>tok</span>
                          <span>実費 <b>{formatCost(attempt.costUsd)}</b></span>
                        </div>
                        <label>
                          手動判定
                          <select
                            value={attempt.manualClassification || ''}
                            onChange={(event) => setManualClassification(
                              resultKey,
                              attempt.index,
                              event.target.value ? event.target.value as LlmReplyClassification : undefined
                            )}
                          >
                            <option value={''}>自動判定を使用</option>
                            {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </label>
                        {issues ? <p className={'stt-debug-error'}>約束違反: {issues}</p> : null}
                        {attempt.errorMessage ? <p className={'stt-debug-error'}>{attempt.errorMessage}</p> : null}
                      </details>
                    )
                  })}
                  {result.errorMessage ? <p className={'stt-debug-error'}>{result.errorMessage}</p> : null}
                </article>
              )
            })}
          </div>
        </>
      )}

      {history.length > 0 ? (
        <>
          <h2 className={'stt-debug-section-title'}>4. 履歴（本文なし）</h2>
          <div className={'stt-debug-results'}>
            {history.map((run) => (
              <article key={run.id} className={'stt-debug-result'}>
                <div className={'stt-debug-result-head'}>
                  <strong>{run.topicLevel || 'P0'}・{historyFriendCount(run)} Friend × {run.modelIds.length}モデル</strong>
                  <span>{new Date(run.createdAt).toLocaleString()}</span>
                </div>
                <div className={'stt-debug-metrics'}>
                  <span>{run.iterations ?? 1}回</span>
                  <span>HSK {run.hskLevel}級</span>
                  <span>{run.results.reduce((sum, result) => sum + (result.attempts?.length ?? 0), 0)}試行</span>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
