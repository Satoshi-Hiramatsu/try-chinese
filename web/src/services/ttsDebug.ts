import type { TtsDebugAttempt, TtsDebugResult } from '../types'
import { createPlayableAudioBlob, readPcmFormat } from './audioFormat'
import { loadApiKey } from './storage'

export const TTS_DEBUG_MAX_CHARACTERS = 1000
export const TTS_DEBUG_MAX_ITERATIONS = 5
export const TTS_DEBUG_DEFAULT_ITERATIONS = 3

export interface RunTtsDebugOptions {
  modelId: string
  text: string
  speed: number
  signal: AbortSignal
  voiceId?: string
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
  options?: { voiceId?: string; estimatedCostUsd?: number; iterations?: number }
): TtsDebugResult {
  const units = countTextUnits(text)
  return {
    modelId,
    voiceId: options?.voiceId,
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

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function collect(attempts: readonly TtsDebugAttempt[], key: 'requestToHeadersMs' | 'requestToFirstChunkMs' | 'requestToCompleteMs'): number[] {
  return attempts
    .filter((attempt) => attempt.status === 'success')
    .map((attempt) => attempt.metrics[key])
    .filter((value): value is number => value !== undefined)
}

/**
 * 各試行の計測値から、結果全体の状態と平均値をまとめる。
 * 1回目はコネクション確立やモデルのウォームアップを含むため、
 * 2回目以降だけの平均も併せて出す。
 */
export function summarizeAttempts(base: TtsDebugResult, attempts: readonly TtsDebugAttempt[]): TtsDebugResult {
  if (attempts.length === 0) return { ...base, attempts: [] }
  const first = attempts[0]
  const successes = attempts.filter((attempt) => attempt.status === 'success')
  const failed = attempts.find((attempt) => attempt.status === 'error')
  const cancelled = attempts.find((attempt) => attempt.status === 'cancelled')
  const warm = attempts.slice(1)

  const status: TtsDebugResult['status'] =
    successes.length > 0 ? 'success' : cancelled && !failed ? 'cancelled' : failed ? 'error' : first.status

  return {
    ...base,
    status,
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
      attemptCount: attempts.length,
      successCount: successes.length,
      averageRequestToHeadersMs: average(collect(attempts, 'requestToHeadersMs')),
      averageRequestToFirstChunkMs: average(collect(attempts, 'requestToFirstChunkMs')),
      averageRequestToCompleteMs: average(collect(attempts, 'requestToCompleteMs')),
      warmAverageRequestToFirstChunkMs: average(collect(warm, 'requestToFirstChunkMs')),
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
    const cancelled = options.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
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
  const attempts: TtsDebugAttempt[] = []
  const total = Math.max(1, Math.min(TTS_DEBUG_MAX_ITERATIONS, options.iterations))

  for (let index = 1; index <= total; index += 1) {
    if (options.signal.aborted) {
      attempts.push({
        index,
        status: 'cancelled',
        timing: { requestStartedAt: Date.now() },
        metrics: {},
        errorMessage: '停止しました',
      })
      break
    }
    const attempt = await runTtsDebugAttempt({ ...options, attemptIndex: index })
    attempts.push(attempt)
    if (options.onProgress) {
      const partial = summarizeAttempts(base, attempts)
      // まだ残りがある間は実行中として見せ、完了扱いにしない。
      const stillRunning = index < total && attempt.status !== 'cancelled'
      options.onProgress(stillRunning ? { ...partial, status: 'running' } : partial)
    }
    if (attempt.status === 'cancelled') break
  }

  return summarizeAttempts(base, attempts)
}
