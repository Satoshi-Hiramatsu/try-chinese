import type {
  Friend,
  LlmDebugAttempt,
  LlmDebugResult,
  LlmDebugRun,
  LlmDebugStoredResult,
  LlmReplyClassification,
} from '../types'
import {
  isAbortError,
  resolveAggregateStatus,
  runDebugSequence,
  summarizeLatencies,
} from './debugRunner'
import { loadApiKey } from './storage'

/**
 * 比較候補のテキストモデル。
 *
 * 会話に使えるのは「JSONで構造化して返せて、速い」モデルに限られる。
 * 全モデルを並べても選べないので、その条件を満たすものだけを載せる。
 */
export interface LlmCandidate {
  id: string
  displayName: string
  note: string
  /** 既定で選択しておくか。 */
  featured: boolean
  evidence: 'explicit-uncensored' | 'roleplay-unmoderated' | 'baseline'
  structuredOutput: 'json-schema' | 'json-object'
}

/** 本体の既定にする予定のモデル（T-75 で切り替える）。 */
export const DEFAULT_LLM_MODEL = 'deepseek/deepseek-v4.1-flash'

export const LLM_CANDIDATES: readonly LlmCandidate[] = [
  {
    id: DEFAULT_LLM_MODEL,
    displayName: 'DeepSeek V4.1 Flash',
    note: '採用予定。$0.15/$0.60 per M・structured_outputs 対応・中国語ネイティブ。',
    featured: false,
    evidence: 'baseline',
    structuredOutput: 'json-schema',
  },
  {
    id: 'google/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash（現行）',
    note: '現在の既定。$0.30/$2.50 per M。乗り換えの基準にする。',
    featured: false,
    evidence: 'baseline',
    structuredOutput: 'json-schema',
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    note: '$0.10/$0.40 per M。速度重視。返答の質が足りるかを見る。',
    featured: false,
    evidence: 'baseline',
    structuredOutput: 'json-schema',
  },
  {
    id: 'deepseek/deepseek-v3.2',
    displayName: 'DeepSeek V3.2',
    note: '$0.27/$0.40 per M。V4.1 Flash との比較用。',
    featured: false,
    evidence: 'baseline',
    structuredOutput: 'json-schema',
  },
  {
    id: 'qwen/qwen3-max',
    displayName: 'Qwen3 Max',
    note: '中国語圏のモデル。中国語の自然さの上限を見る。',
    featured: true,
    evidence: 'baseline',
    structuredOutput: 'json-schema',
  },
  {
    id: 'openai/gpt-5.1-mini',
    displayName: 'GPT-5.1 Mini',
    note: '他系統の比較対象。',
    featured: false,
    evidence: 'baseline',
    structuredOutput: 'json-schema',
  },
  {
    id: 'thedrummer/cydonia-24b-v4.1',
    displayName: 'Cydonia 24B v4.1',
    note: '明示的なuncensored・創作向け。$0.30/$0.50 per M・JSON Schema対応。',
    featured: true,
    evidence: 'explicit-uncensored',
    structuredOutput: 'json-schema',
  },
  {
    id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition',
    displayName: 'Venice Uncensored',
    note: 'Dolphin Mistral 24B。$0.20/$0.90 per M・JSON objectフォールバックを検証。',
    featured: true,
    evidence: 'explicit-uncensored',
    structuredOutput: 'json-object',
  },
  {
    id: 'anthracite-org/magnum-v4-72b',
    displayName: 'Magnum v4 72B',
    note: 'Qwen2.5 72Bベースの創作比較枠。$2.50/$5.00 per M。',
    featured: false,
    evidence: 'roleplay-unmoderated',
    structuredOutput: 'json-schema',
  },
  {
    id: 'sao10k/l3.3-euryale-70b',
    displayName: 'Euryale L3.3 70B',
    note: 'ロールプレイ・創作向け。$0.65/$0.75 per M。',
    featured: false,
    evidence: 'roleplay-unmoderated',
    structuredOutput: 'json-schema',
  },
  {
    id: 'thedrummer/unslopnemo-12b',
    displayName: 'UnslopNemo 12B',
    note: '小型の会話・ロールプレイ比較枠。$0.40/$0.40 per M。',
    featured: false,
    evidence: 'roleplay-unmoderated',
    structuredOutput: 'json-schema',
  },
]

/** 検証に使う既定の発話。片言・混在・学習質問という本アプリ特有の入力を含める。 */
export const LLM_DEBUG_PRESETS: readonly { id: string; label: string; message: string }[] = [
  { id: 'plain-zh', label: '普通の中国語', message: '我最近开始看中国电影，你有什么推荐吗？' },
  { id: 'broken-zh', label: '片言の中国語', message: '我 昨天 去 电影院 看 电影 很 好' },
  { id: 'mixed', label: '日中混在', message: 'えっと 你好って日本語で什么意思でしたっけ？' },
  { id: 'japanese', label: '日本語のみ', message: '週末はいつも何してるの？' },
]

export const LLM_DEBUG_MAX_REQUESTS = 60
export const LLM_DEBUG_CONCURRENCY = 3

export type LlmDebugRunBlockReason =
  | 'empty-message'
  | 'no-friend'
  | 'no-model'
  | 'bad-iterations'
  | 'too-many-requests'

export function getLlmDebugRunBlockReason(input: {
  message: string
  selectedFriendCount?: number
  selectedCount: number
  iterations: number
}): LlmDebugRunBlockReason | undefined {
  if (!input.message.trim()) return 'empty-message'
  if ((input.selectedFriendCount ?? 1) < 1) return 'no-friend'
  if (input.selectedCount < 1) return 'no-model'
  if (!Number.isInteger(input.iterations) || input.iterations < 1 || input.iterations > 5) return 'bad-iterations'
  if ((input.selectedFriendCount ?? 1) * input.selectedCount * input.iterations > LLM_DEBUG_MAX_REQUESTS) {
    return 'too-many-requests'
  }
  return undefined
}

export function getLlmDebugResultKey(result: Pick<LlmDebugResult, 'friendId' | 'modelId'>): string {
  return `${result.friendId}::${result.modelId}`
}

export function createPendingLlmResult(modelId: string, friend: Friend): LlmDebugResult {
  return {
    modelId,
    friendId: friend.id || friend.name,
    friendName: friend.name,
    status: 'pending',
    timing: { requestStartedAt: 0 },
    metrics: { attemptCount: 0, successCount: 0 },
    attempts: [],
  }
}

/**
 * 返答が要件を満たしているかの静的な検査。
 *
 * 速さだけで選ぶと「速いが中国語に日本語が混ざる」モデルを掴むため、
 * プロンプトが課している約束を機械的に確かめる。
 */
export interface LlmSchemaCheck {
  /** 返答本文・日本語訳・表情がすべて揃っているか。 */
  hasRequiredFields: boolean
  /** reply.zh にかな・カナが混ざっていないか（100%中国語の約束）。 */
  zhIsChineseOnly: boolean
  /** expression が許可された10種のいずれかか。 */
  expressionIsValid: boolean
}

const KANA_PATTERN = /[぀-ゟ゠-ヿ]/
const VALID_EXPRESSIONS = new Set([
  'neutral', 'smile', 'joy', 'laugh', 'shy', 'surprised', 'sad', 'angry', 'thinking', 'wink',
])

export function checkLlmSchema(payload: {
  reply?: { zh?: string; ja?: string }
  expression?: string
}): LlmSchemaCheck {
  const zh = payload.reply?.zh || ''
  return {
    hasRequiredFields: Boolean(zh.trim() && payload.reply?.ja?.trim() && payload.expression),
    zhIsChineseOnly: zh.trim() !== '' && !KANA_PATTERN.test(zh),
    expressionIsValid: VALID_EXPRESSIONS.has(payload.expression || ''),
  }
}

/** 検査結果を1行にまとめる。すべて満たしていれば空文字を返す。 */
export function describeSchemaIssues(check: LlmSchemaCheck): string {
  const issues: string[] = []
  if (!check.hasRequiredFields) issues.push('必須項目の欠落')
  if (!check.zhIsChineseOnly) issues.push('中国語に仮名が混入')
  if (!check.expressionIsValid) issues.push('表情が不正')
  return issues.join(' / ')
}

const REFUSAL_PATTERNS = [
  /お答えできません/u,
  /対応できません/u,
  /その(?:内容|話題)には/u,
  /不能(?:回答|讨论|帮助)/u,
  /无法(?:回答|讨论|提供)/u,
  /抱歉.{0,12}(?:不能|无法)/u,
]

const DEFLECTION_PATTERNS = [
  /別の話題/u,
  /話題を変/u,
  /聊点别的/u,
  /换个话题/u,
]

export function classifyReply(input: {
  status: LlmDebugAttempt['status']
  zh?: string
  ja?: string
  schema?: LlmSchemaCheck
}): LlmReplyClassification {
  if (
    input.status !== 'success'
    || !input.schema?.hasRequiredFields
    || !input.schema.zhIsChineseOnly
    || !input.schema.expressionIsValid
  ) return 'broken'
  const text = `${input.zh || ''}\n${input.ja || ''}`
  if (REFUSAL_PATTERNS.some((pattern) => pattern.test(text))) return 'refuse'
  if (DEFLECTION_PATTERNS.some((pattern) => pattern.test(text))) return 'deflect'
  return 'comply'
}

export interface RunLlmDebugOptions {
  modelId: string
  message: string
  friend: Friend
  hskLevel: number
  signal: AbortSignal
  attemptIndex?: number
}

function readErrorMessage(response: Response): string {
  if (response.status === 401 || response.status === 403) return 'APIキーまたはモデルの利用権限を確認してください。'
  if (response.status === 402) return 'OpenRouterの残高を確認してください。'
  if (response.status === 429) return 'レート制限に達しました。時間を置いて再実行してください。'
  return `LLM API エラー (${response.status})`
}

/** 1回分の会話生成を実行して計測する。 */
export async function runLlmDebugAttempt(options: RunLlmDebugOptions): Promise<LlmDebugAttempt> {
  const requestStartedAt = Date.now()
  const attempt: LlmDebugAttempt = {
    index: options.attemptIndex ?? 1,
    status: 'running',
    timing: { requestStartedAt },
    metrics: {},
  }

  try {
    const apiKey = loadApiKey()
    if (!apiKey) throw new Error('OpenRouter APIキーが設定されていません。')

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        message: options.message,
        friend: options.friend,
        hskLevel: options.hskLevel,
        // 履歴なしで比べる。同じ条件を全モデルに揃えるため。
        history: [],
        config: { llm: { apiKey, model: options.modelId } },
      }),
      signal: options.signal,
    })

    const responseHeadersAt = Date.now()
    attempt.httpStatus = response.status
    attempt.timing.responseHeadersAt = responseHeadersAt
    attempt.metrics.requestToHeadersMs = responseHeadersAt - requestStartedAt

    if (!response.ok) throw new Error(readErrorMessage(response))

    const payload = (await response.json()) as {
      reply?: { zh?: string; ja?: string; pinyin?: string }
      correction?: {
        hasCorrection?: boolean
        original?: string
        suggested?: string
        pinyin?: string
        ja?: string
      }
      vocabulary?: { term?: string; pinyin?: string; ja?: string; hskLevel?: number }[]
      expression?: string
      usage?: { completionTokens?: number; promptTokens?: number; costUsd?: number }
    }
    const responseCompletedAt = Date.now()

    const schema = checkLlmSchema(payload)
    const correction = payload.correction
      ? {
          hasCorrection: Boolean(payload.correction.hasCorrection),
          original: payload.correction.original,
          suggested: payload.correction.suggested,
          pinyin: payload.correction.pinyin,
          ja: payload.correction.ja,
        }
      : undefined
    const vocabulary = payload.vocabulary
      ?.filter((item): item is { term: string; pinyin?: string; ja?: string; hskLevel?: number } => Boolean(item.term))
      .map((item) => ({
        term: item.term,
        pinyin: item.pinyin || '',
        ja: item.ja || '',
        hskLevel: item.hskLevel,
      }))

    return {
      ...attempt,
      status: 'success',
      zh: payload.reply?.zh,
      ja: payload.reply?.ja,
      pinyin: payload.reply?.pinyin,
      expression: payload.expression,
      hasCorrection: Boolean(payload.correction?.hasCorrection),
      vocabularyCount: payload.vocabulary?.length ?? 0,
      correction,
      vocabulary,
      schema,
      autoClassification: classifyReply({
        status: 'success',
        zh: payload.reply?.zh,
        ja: payload.reply?.ja,
        schema,
      }),
      completionTokens: payload.usage?.completionTokens,
      costUsd: payload.usage?.costUsd,
      timing: { ...attempt.timing, responseCompletedAt },
      metrics: {
        ...attempt.metrics,
        // 今は一括応答なので初回チャンクと完了は同じ。分離(T-77)後は差が出る。
        requestToFirstChunkMs: responseCompletedAt - requestStartedAt,
        requestToCompleteMs: responseCompletedAt - requestStartedAt,
      },
    }
  } catch (error) {
    const cancelled = isAbortError(error, options.signal)
    return {
      ...attempt,
      status: cancelled ? 'cancelled' : 'error',
      autoClassification: 'broken',
      errorMessage: cancelled ? '停止しました' : error instanceof Error ? error.message : 'LLM通信エラーが発生しました',
    }
  }
}

export function summarizeLlmAttempts(
  base: LlmDebugResult,
  attempts: readonly LlmDebugAttempt[]
): LlmDebugResult {
  if (attempts.length === 0) return { ...base, attempts: [] }
  const first = attempts[0]
  const successes = attempts.filter((attempt) => attempt.status === 'success')
  const failed = attempts.find((attempt) => attempt.status === 'error')
  const cancelled = attempts.find((attempt) => attempt.status === 'cancelled')
  const sample = successes[0]

  return {
    ...base,
    status: resolveAggregateStatus(attempts),
    httpStatus: first.httpStatus,
    zh: sample?.zh,
    ja: sample?.ja,
    pinyin: sample?.pinyin,
    expression: sample?.expression,
    hasCorrection: sample?.hasCorrection,
    vocabularyCount: sample?.vocabularyCount,
    schema: sample?.schema,
    errorMessage: successes.length > 0 ? undefined : (failed || cancelled || first)?.errorMessage,
    timing: first.timing,
    metrics: {
      ...base.metrics,
      requestToCompleteMs: first.metrics.requestToCompleteMs,
      completionTokens: sample?.completionTokens,
      costUsd: successes.reduce<number | undefined>(
        (sum, attempt) => (attempt.costUsd === undefined ? sum : (sum ?? 0) + attempt.costUsd),
        undefined
      ),
      ...summarizeLatencies(attempts),
    },
    attempts: [...attempts],
  }
}

export interface RunLlmDebugSequenceOptions extends Omit<RunLlmDebugOptions, 'attemptIndex'> {
  iterations: number
  onProgress?: (result: LlmDebugResult) => void
}

export async function runLlmDebugSequence(
  base: LlmDebugResult,
  options: RunLlmDebugSequenceOptions
): Promise<LlmDebugResult> {
  const attempts = await runDebugSequence<LlmDebugAttempt>({
    iterations: options.iterations,
    signal: options.signal,
    runAttempt: (index) => runLlmDebugAttempt({ ...options, attemptIndex: index }),
    createCancelled: (index) => ({
      index,
      status: 'cancelled',
      timing: { requestStartedAt: Date.now() },
      metrics: {},
      errorMessage: '停止しました',
      autoClassification: 'broken',
    }),
    onAttempt: (current, hasMore) => {
      if (!options.onProgress) return
      const partial = summarizeLlmAttempts(base, current)
      options.onProgress(hasMore ? { ...partial, status: 'running' } : partial)
    },
  })

  return summarizeLlmAttempts(base, attempts)
}

export interface LlmDebugTarget {
  modelId: string
  friend: Friend
}

export function buildLlmDebugTargets(
  friends: readonly Friend[],
  modelIds: readonly string[]
): LlmDebugTarget[] {
  return friends.flatMap((friend) => modelIds.map((modelId) => ({ friend, modelId })))
}

export async function runWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  runItem: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) return []
  const results = new Array<TResult>(items.length)
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), items.length))

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await runItem(items[index])
    }
  }))
  return results
}

export function createStoredLlmResult(result: LlmDebugResult): LlmDebugStoredResult {
  return {
    modelId: result.modelId,
    friendId: result.friendId,
    friendName: result.friendName,
    status: result.status,
    attempts: (result.attempts || []).map((attempt) => ({
      index: attempt.index,
      status: attempt.status,
      httpStatus: attempt.httpStatus,
      responseLength: (attempt.zh?.length || 0) + (attempt.ja?.length || 0),
      requestToCompleteMs: attempt.metrics.requestToCompleteMs,
      completionTokens: attempt.completionTokens,
      costUsd: attempt.costUsd,
      schema: attempt.schema,
      autoClassification: attempt.autoClassification,
      manualClassification: attempt.manualClassification,
    })),
  }
}

export function createLlmDebugRun(input: {
  id: string
  createdAt: string
  topicLevel: LlmDebugRun['topicLevel']
  friends: readonly Friend[]
  hskLevel: number
  iterations: number
  modelIds: readonly string[]
  results: readonly LlmDebugResult[]
}): LlmDebugRun {
  return {
    id: input.id,
    createdAt: input.createdAt,
    topicLevel: input.topicLevel,
    friendIds: input.friends.map((friend) => friend.id || friend.name),
    hskLevel: input.hskLevel,
    iterations: input.iterations,
    modelIds: [...input.modelIds],
    results: input.results.map(createStoredLlmResult),
  }
}

export interface LlmClassificationSummary {
  refuse: number
  deflect: number
  complySoft: number
  comply: number
  broken: number
  total: number
}

export function summarizeLlmClassifications(results: readonly LlmDebugResult[]): LlmClassificationSummary {
  const summary: LlmClassificationSummary = {
    refuse: 0,
    deflect: 0,
    complySoft: 0,
    comply: 0,
    broken: 0,
    total: 0,
  }
  for (const result of results) {
    for (const attempt of result.attempts || []) {
      const classification = attempt.manualClassification || attempt.autoClassification
      if (!classification) continue
      summary.total += 1
      if (classification === 'comply-soft') summary.complySoft += 1
      else summary[classification] += 1
    }
  }
  return summary
}
