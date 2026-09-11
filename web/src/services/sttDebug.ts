import type { SttDebugAttempt, SttDebugResult } from '../types'
import {
  isAbortError,
  resolveAggregateStatus,
  runDebugSequence,
  summarizeLatencies,
} from './debugRunner'
import { loadApiKey } from './storage'

export const STT_DEBUG_MAX_AUDIO_SECONDS = 60

/**
 * 文字誤り率(CER)の計算で無視する文字。
 *
 * 中国語には単語境界が無いため単語単位(WER)では測れず、文字単位で測る。
 * 句読点の付け方はモデルごとに癖があり、聞き取りの正しさとは別物なので
 * 比較からは外す。空白も同様に落とす。
 */
const IGNORED_FOR_CER = /[\s　。、，．,.!！?？；;：:「」『』（）()《》〈〉…—\-~～"'"'`]/g

/** 比較用に整える。句読点と空白を落とし、全角英数は半角へ寄せる。 */
export function normalizeForCer(text: string): string {
  return text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(IGNORED_FOR_CER, '')
}

/** 2つの文字列の編集距離。1行ぶんだけ持って回す。 */
export function levenshtein(reference: readonly string[], hypothesis: readonly string[]): number {
  if (reference.length === 0) return hypothesis.length
  if (hypothesis.length === 0) return reference.length

  let previous = Array.from({ length: hypothesis.length + 1 }, (_value, index) => index)
  for (let i = 1; i <= reference.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= hypothesis.length; j += 1) {
      const substitution = previous[j - 1] + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1)
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1)
    }
    previous = current
  }
  return previous[hypothesis.length]
}

/**
 * 文字誤り率。0 が完全一致で、1 は参照と同じだけ誤っていることを表す。
 * 正解テキストが未入力のときは測れないので undefined を返す。
 */
export function characterErrorRate(reference: string, hypothesis: string): number | undefined {
  const referenceChars = Array.from(normalizeForCer(reference))
  if (referenceChars.length === 0) return undefined
  const hypothesisChars = Array.from(normalizeForCer(hypothesis))
  return levenshtein(referenceChars, hypothesisChars) / referenceChars.length
}

export type SttDebugRunBlockReason = 'no-audio' | 'no-model' | 'bad-iterations' | 'too-long'

/** 実行を止める理由。実行ボタンの無効化と警告文で共有する。 */
export function getSttDebugRunBlockReason(input: {
  hasAudio: boolean
  selectedCount: number
  iterations: number
  audioDurationMs?: number
}): SttDebugRunBlockReason | undefined {
  if (!input.hasAudio) return 'no-audio'
  if (input.audioDurationMs !== undefined && input.audioDurationMs > STT_DEBUG_MAX_AUDIO_SECONDS * 1000) return 'too-long'
  if (input.selectedCount < 1) return 'no-model'
  if (!Number.isInteger(input.iterations) || input.iterations < 1 || input.iterations > 5) return 'bad-iterations'
  return undefined
}

export function createPendingSttResult(modelId: string): SttDebugResult {
  return {
    modelId,
    status: 'pending',
    timing: { requestStartedAt: 0 },
    metrics: { attemptCount: 0, successCount: 0 },
    attempts: [],
  }
}

export interface RunSttDebugOptions {
  modelId: string
  /** Base64 の音声。同じ音声を全モデルへ送るため、呼び出し側で一度だけ変換する。 */
  audioBase64: string
  format: string
  /** 未指定なら上流の自動判定に任せる。判定結果そのものを比較したいので既定は未指定。 */
  language?: string
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
  return `STT API エラー (${response.status})`
}

/** 1回分の文字起こしを実行して計測する。 */
export async function runSttDebugAttempt(options: RunSttDebugOptions): Promise<SttDebugAttempt> {
  const requestStartedAt = Date.now()
  const attempt: SttDebugAttempt = {
    index: options.attemptIndex ?? 1,
    status: 'running',
    timing: { requestStartedAt },
    metrics: {},
  }

  try {
    const apiKey = loadApiKey()
    if (!apiKey) throw new Error('OpenRouter APIキーが設定されていません。')

    const response = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        model: options.modelId,
        audio: options.audioBase64,
        format: options.format,
        ...(options.language ? { language: options.language } : {}),
        responseFormat: 'verbose_json',
      }),
      signal: options.signal,
    })

    const responseHeadersAt = Date.now()
    attempt.httpStatus = response.status
    attempt.timing.responseHeadersAt = responseHeadersAt
    attempt.metrics.requestToHeadersMs = responseHeadersAt - requestStartedAt

    if (!response.ok) throw new Error(await readErrorMessage(response))

    const payload = (await response.json()) as {
      text?: string
      language?: string
      durationSeconds?: number
      costUsd?: number
    }
    const responseCompletedAt = Date.now()
    if (typeof payload.text !== 'string') throw new Error('転写テキストが返されませんでした。')

    return {
      ...attempt,
      status: 'success',
      text: payload.text,
      detectedLanguage: payload.language,
      audioDurationSeconds: payload.durationSeconds,
      costUsd: payload.costUsd,
      timing: { ...attempt.timing, responseCompletedAt },
      metrics: {
        ...attempt.metrics,
        // 一括応答なので初回チャンクと完了は同じ。段をまたいだ比較のため両方に入れる。
        requestToFirstChunkMs: responseCompletedAt - requestStartedAt,
        requestToCompleteMs: responseCompletedAt - requestStartedAt,
      },
    }
  } catch (error) {
    const cancelled = isAbortError(error, options.signal)
    return {
      ...attempt,
      status: cancelled ? 'cancelled' : 'error',
      errorMessage: cancelled ? '停止しました' : error instanceof Error ? error.message : 'STT通信エラーが発生しました',
    }
  }
}

/** 各試行の計測値と、転写テキストの精度をまとめる。 */
export function summarizeSttAttempts(
  base: SttDebugResult,
  attempts: readonly SttDebugAttempt[],
  referenceText: string
): SttDebugResult {
  if (attempts.length === 0) return { ...base, attempts: [] }
  const first = attempts[0]
  const successes = attempts.filter((attempt) => attempt.status === 'success')
  const failed = attempts.find((attempt) => attempt.status === 'error')
  const cancelled = attempts.find((attempt) => attempt.status === 'cancelled')
  const text = successes[0]?.text

  return {
    ...base,
    status: resolveAggregateStatus(attempts),
    httpStatus: first.httpStatus,
    text,
    detectedLanguage: successes[0]?.detectedLanguage,
    errorMessage: successes.length > 0 ? undefined : (failed || cancelled || first)?.errorMessage,
    timing: first.timing,
    metrics: {
      ...base.metrics,
      requestToCompleteMs: first.metrics.requestToCompleteMs,
      audioDurationSeconds: successes[0]?.audioDurationSeconds,
      // 実費は反復した回数ぶん積む。カタログの単価では単位が分からないため実測値を使う。
      costUsd: successes.reduce<number | undefined>(
        (sum, attempt) => (attempt.costUsd === undefined ? sum : (sum ?? 0) + attempt.costUsd),
        undefined
      ),
      characterErrorRate: text === undefined ? undefined : characterErrorRate(referenceText, text),
      ...summarizeLatencies(attempts),
    },
    attempts: [...attempts],
  }
}

export interface RunSttDebugSequenceOptions extends Omit<RunSttDebugOptions, 'attemptIndex'> {
  iterations: number
  referenceText: string
  onProgress?: (result: SttDebugResult) => void
}

/** 同じ音声で連続実行し、各回の計測値と平均をまとめる。 */
export async function runSttDebugSequence(
  base: SttDebugResult,
  options: RunSttDebugSequenceOptions
): Promise<SttDebugResult> {
  const attempts = await runDebugSequence<SttDebugAttempt>({
    iterations: options.iterations,
    signal: options.signal,
    runAttempt: (index) => runSttDebugAttempt({ ...options, attemptIndex: index }),
    createCancelled: (index) => ({
      index,
      status: 'cancelled',
      timing: { requestStartedAt: Date.now() },
      metrics: {},
      errorMessage: '停止しました',
    }),
    onAttempt: (current, hasMore) => {
      if (!options.onProgress) return
      const partial = summarizeSttAttempts(base, current, options.referenceText)
      options.onProgress(hasMore ? { ...partial, status: 'running' } : partial)
    },
  })

  return summarizeSttAttempts(base, attempts, options.referenceText)
}
