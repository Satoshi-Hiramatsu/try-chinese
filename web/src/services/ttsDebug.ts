import type { TtsDebugAttempt, TtsDebugResult, TtsVoiceTuning } from '../types'
import { normalizeTuning } from '../data/ttsVoiceTuning'
import { createPlayableAudioBlob, readPcmFormat } from './audioFormat'
import {
  DEBUG_DEFAULT_ITERATIONS,
  DEBUG_MAX_ITERATIONS,
  isAbortError,
  resolveAggregateStatus,
  runDebugSequence,
  summarizeLatencies,
} from './debugRunner'
import { loadApiKey } from './storage'

export const TTS_DEBUG_MAX_CHARACTERS = 1000
// 反復回数の上限・既定は段をまたいで揃える。共通基盤の値をそのまま使う。
export const TTS_DEBUG_MAX_ITERATIONS = DEBUG_MAX_ITERATIONS
export const TTS_DEBUG_DEFAULT_ITERATIONS = DEBUG_DEFAULT_ITERATIONS

export interface RunTtsDebugOptions {
  modelId: string
  text: string
  speed: number
  signal: AbortSignal
  voiceId?: string
  /** 声の揺らぎや話し方の指定。空の項目はWorkerへ送らない。 */
  tuning?: TtsVoiceTuning
  ignoreCache?: boolean
  /** 1始まりの試行番号。計測結果に記録する。 */
  attemptIndex?: number
}

export function countTextUnits(text: string): { characters: number; utf8Bytes: number } {
  return {
    characters: Array.from(text).length,
    utf8Bytes: new TextEncoder().encode(text).byteLength,
  }
}

export type TtsDebugRunBlockReason = 'empty-text' | 'too-long' | 'no-model' | 'bad-iterations'

/**
 * 実行を止める理由を返す。実行ボタンの無効化と警告文で共有する。
 * DOMに依存しないため、UIを描画せずにテストできる。
 * 単体実行の判定には selectedCount に 1 を渡す。
 */
export function getTtsDebugRunBlockReason(input: {
  text: string
  selectedCount: number
  iterations?: number
}): TtsDebugRunBlockReason | undefined {
  if (!input.text.trim()) return 'empty-text'
  if (countTextUnits(input.text).characters > TTS_DEBUG_MAX_CHARACTERS) return 'too-long'
  if (input.selectedCount < 1) return 'no-model'
  const iterations = input.iterations ?? 1
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > TTS_DEBUG_MAX_ITERATIONS) return 'bad-iterations'
  return undefined
}

export function createPendingTtsResult(
  modelId: string,
  text: string,
  options?: { voiceId?: string; estimatedCostUsd?: number; iterations?: number; tuning?: TtsVoiceTuning }
): TtsDebugResult {
  const units = countTextUnits(text)
  return {
    modelId,
    voiceId: options?.voiceId,
    tuning: normalizeTuning(options?.tuning),
    status: 'pending',
    timing: { requestStartedAt: 0 },
    metrics: {
      inputCharacterCount: units.characters,
      inputUtf8ByteCount: units.utf8Bytes,
      estimatedCostUsd: options?.estimatedCostUsd,
      attemptCount: options?.iterations,
      successCount: 0,
    },
    attempts: [],
  }
}

/**
 * 各試行の計測値から、結果全体の状態と平均値をまとめる。
 * 所要時間の集計と状態の畳み込みは共通基盤に任せ、
 * ここでは音声固有の項目（形式・生成ID・再生用URL）だけを引き継ぐ。
 */
export function summarizeAttempts(base: TtsDebugResult, attempts: readonly TtsDebugAttempt[]): TtsDebugResult {
  if (attempts.length === 0) return { ...base, attempts: [] }
  const first = attempts[0]
  const successes = attempts.filter((attempt) => attempt.status === 'success')
  const failed = attempts.find((attempt) => attempt.status === 'error')
  const cancelled = attempts.find((attempt) => attempt.status === 'cancelled')

  return {
    ...base,
    status: resolveAggregateStatus(attempts),
    httpStatus: first.httpStatus,
    contentType: first.contentType,
    responseFormat: first.responseFormat,
    generationId: first.generationId,
    audioUrl: successes[0]?.audioUrl,
    audioCacheKey: successes[0]?.generationId,
    errorMessage: successes.length > 0 ? undefined : (failed || cancelled || first)?.errorMessage,
    timing: first.timing,
    metrics: {
      ...base.metrics,
      requestToHeadersMs: first.metrics.requestToHeadersMs,
      requestToFirstChunkMs: first.metrics.requestToFirstChunkMs,
      requestToCompleteMs: first.metrics.requestToCompleteMs,
      audioDurationMs: first.metrics.audioDurationMs,
      ...summarizeLatencies(attempts),
    },
    attempts: [...attempts],
  }
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
  return `TTS API エラー (${response.status})`
}

/** 1回分の生成を実行して計測する。 */
export async function runTtsDebugAttempt(options: RunTtsDebugOptions): Promise<TtsDebugAttempt> {
  const requestStartedAt = Date.now()
  const attempt: TtsDebugAttempt = {
    index: options.attemptIndex ?? 1,
    status: 'running',
    timing: { requestStartedAt },
    metrics: {},
  }

  try {
    const apiKey = loadApiKey()
    if (!apiKey) throw new Error('OpenRouter APIキーが設定されていません。')

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...(options.ignoreCache ? { 'Cache-Control': 'no-cache' } : {}),
      },
      body: JSON.stringify({
        text: options.text,
        model: options.modelId,
        voice: options.voiceId,
        speed: options.speed,
        tuning: normalizeTuning(options.tuning),
      }),
      signal: options.signal,
      cache: options.ignoreCache ? 'no-store' : 'default',
    })

    const responseHeadersAt = Date.now()
    attempt.httpStatus = response.status
    attempt.timing.responseHeadersAt = responseHeadersAt
    attempt.metrics.requestToHeadersMs = responseHeadersAt - requestStartedAt
    attempt.generationId = response.headers.get('X-Generation-Id') || undefined
    attempt.responseFormat = response.headers.get('X-TTS-Format') || undefined

    if (!response.ok) throw new Error(await readErrorMessage(response))
    if (!response.body) throw new Error('音声ストリームが空です。')

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let firstChunkAt: number | undefined
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!firstChunkAt) firstChunkAt = Date.now()
      chunks.push(value)
    }

    const responseCompletedAt = Date.now()
    const contentType = response.headers.get('Content-Type') || 'audio/mpeg'
    const byteLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const audioBytes = new Uint8Array(byteLength)
    let offset = 0
    for (const chunk of chunks) {
      audioBytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    // PCMのみ返すモデルは、計測後にWAVへ変換してから再生用URLを作る。
    const blob = createPlayableAudioBlob(audioBytes, contentType, readPcmFormat(response.headers))
    return {
      ...attempt,
      status: 'success',
      contentType,
      audioUrl: URL.createObjectURL(blob),
      timing: { ...attempt.timing, firstChunkAt, responseCompletedAt },
      metrics: {
        ...attempt.metrics,
        requestToFirstChunkMs: firstChunkAt ? firstChunkAt - requestStartedAt : undefined,
        requestToCompleteMs: responseCompletedAt - requestStartedAt,
      },
    }
  } catch (error) {
    const cancelled = isAbortError(error, options.signal)
    return {
      ...attempt,
      status: cancelled ? 'cancelled' : 'error',
      errorMessage: cancelled ? '停止しました' : error instanceof Error ? error.message : 'TTS通信エラーが発生しました',
    }
  }
}

export interface RunTtsDebugSequenceOptions extends Omit<RunTtsDebugOptions, 'attemptIndex'> {
  /** 連続生成の回数。1回目と2回目以降の応答速度差を見るために使う。 */
  iterations: number
  /** 1回終わるたびに途中経過を通知する。 */
  onProgress?: (result: TtsDebugResult) => void
}

/**
 * 同じモデル・同じ話者で連続生成し、各回の計測値と平均をまとめる。
 * 1回目のコネクション確立や初期化の影響を見分けるため、逐次実行する。
 */
export async function runTtsDebugSequence(
  base: TtsDebugResult,
  options: RunTtsDebugSequenceOptions
): Promise<TtsDebugResult> {
  const attempts = await runDebugSequence<TtsDebugAttempt>({
    iterations: options.iterations,
    signal: options.signal,
    runAttempt: (index) => runTtsDebugAttempt({ ...options, attemptIndex: index }),
    createCancelled: (index) => ({
      index,
      status: 'cancelled',
      timing: { requestStartedAt: Date.now() },
      metrics: {},
      errorMessage: '停止しました',
    }),
    onAttempt: (current, hasMore) => {
      if (!options.onProgress) return
      const partial = summarizeAttempts(base, current)
      // まだ残りがある間は実行中として見せ、完了扱いにしない。
      options.onProgress(hasMore ? { ...partial, status: 'running' } : partial)
    },
  })

  return summarizeAttempts(base, attempts)
}
