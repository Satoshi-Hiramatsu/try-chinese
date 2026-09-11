import type { Friend, LlmDebugAttempt, LlmDebugResult } from '../types'
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
}

/** 本体の既定にする予定のモデル（T-75 で切り替える）。 */
export const DEFAULT_LLM_MODEL = 'deepseek/deepseek-v4.1-flash'

export const LLM_CANDIDATES: readonly LlmCandidate[] = [
  {
    id: DEFAULT_LLM_MODEL,
    displayName: 'DeepSeek V4.1 Flash',
    note: '採用予定。$0.15/$0.60 per M・structured_outputs 対応・中国語ネイティブ。',
    featured: true,
  },
  {
    id: 'google/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash（現行）',
    note: '現在の既定。$0.30/$2.50 per M。乗り換えの基準にする。',
    featured: true,
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    note: '$0.10/$0.40 per M。速度重視。返答の質が足りるかを見る。',
    featured: true,
  },
  {
    id: 'deepseek/deepseek-v3.2',
    displayName: 'DeepSeek V3.2',
    note: '$0.27/$0.40 per M。V4.1 Flash との比較用。',
    featured: false,
  },
  {
    id: 'qwen/qwen3-max',
    displayName: 'Qwen3 Max',
    note: '中国語圏のモデル。中国語の自然さの上限を見る。',
    featured: false,
  },
  {
    id: 'openai/gpt-5.1-mini',
    displayName: 'GPT-5.1 Mini',
    note: '他系統の比較対象。',
    featured: false,
  },
]

/** 検証に使う既定の発話。片言・混在・学習質問という本アプリ特有の入力を含める。 */
export const LLM_DEBUG_PRESETS: readonly { id: string; label: string; message: string }[] = [
  { id: 'plain-zh', label: '普通の中国語', message: '我最近开始看中国电影，你有什么推荐吗？' },
  { id: 'broken-zh', label: '片言の中国語', message: '我 昨天 去 电影院 看 电影 很 好' },
  { id: 'mixed', label: '日中混在', message: 'えっと 你好って日本語で什么意思でしたっけ？' },
  { id: 'japanese', label: '日本語のみ', message: '週末はいつも何してるの？' },
]

export type LlmDebugRunBlockReason = 'empty-message' | 'no-model' | 'bad-iterations'

export function getLlmDebugRunBlockReason(input: {
  message: string
  selectedCount: number
  iterations: number
}): LlmDebugRunBlockReason | undefined {
  if (!input.message.trim()) return 'empty-message'
  if (input.selectedCount < 1) return 'no-model'
  if (!Number.isInteger(input.iterations) || input.iterations < 1 || input.iterations > 5) return 'bad-iterations'
  return undefined
}

export function createPendingLlmResult(modelId: string): LlmDebugResult {
  return {
    modelId,
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

export interface RunLlmDebugOptions {
  modelId: string
  message: string
  friend: Friend
  hskLevel: number
  signal: AbortSignal
  attemptIndex?: number
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json()
    if (typeof data === 'object' && data !== null && 'error' in data) {
      const error = (data as { error?: unknown }).error
      if (typeof error === 'string') return error
    }
  } catch {
    // JSONでないエラー本文はステータス表示だけに留める。
  }
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

    if (!response.ok) throw new Error(await readErrorMessage(response))

    const payload = (await response.json()) as {
      reply?: { zh?: string; ja?: string; pinyin?: string }
      correction?: { hasCorrection?: boolean; suggested?: string; ja?: string }
      vocabulary?: { term?: string }[]
      expression?: string
      usage?: { completionTokens?: number; promptTokens?: number; costUsd?: number }
    }
    const responseCompletedAt = Date.now()

    return {
      ...attempt,
      status: 'success',
      zh: payload.reply?.zh,
      ja: payload.reply?.ja,
      pinyin: payload.reply?.pinyin,
      expression: payload.expression,
      hasCorrection: Boolean(payload.correction?.hasCorrection),
      vocabularyCount: payload.vocabulary?.length ?? 0,
      schema: checkLlmSchema(payload),
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
    }),
    onAttempt: (current, hasMore) => {
      if (!options.onProgress) return
      const partial = summarizeLlmAttempts(base, current)
      options.onProgress(hasMore ? { ...partial, status: 'running' } : partial)
    },
  })

  return summarizeLlmAttempts(base, attempts)
}
