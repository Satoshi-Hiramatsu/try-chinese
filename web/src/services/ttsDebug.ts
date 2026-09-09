import { getOpenRouterTtsModel } from '../data/openRouterTtsModels'
import type { TtsDebugResult } from '../types'
import { loadApiKey } from './storage'

export const TTS_DEBUG_MAX_CHARACTERS = 1000

export interface RunTtsDebugOptions {
  modelId: string
  text: string
  speed: number
  signal: AbortSignal
  voiceId?: string
  ignoreCache?: boolean
}

export function countTextUnits(text: string): { characters: number; utf8Bytes: number } {
  return {
    characters: Array.from(text).length,
    utf8Bytes: new TextEncoder().encode(text).byteLength,
  }
}

export function estimateTtsCostUsd(modelId: string, text: string): number | undefined {
  const model = getOpenRouterTtsModel(modelId)
  if (!model || model.priceUsdPerMillionUnit === undefined || model.billingUnit === 'audio-token') {
    return undefined
  }
  const units = countTextUnits(text)
  const billableUnits = model.billingUnit === 'utf8-byte' ? units.utf8Bytes : units.characters
  return (billableUnits * model.priceUsdPerMillionUnit) / 1_000_000
}

export function createPendingTtsResult(modelId: string, text: string): TtsDebugResult {
  const units = countTextUnits(text)
  return {
    modelId,
    status: 'pending',
    timing: { requestStartedAt: 0 },
    metrics: {
      inputCharacterCount: units.characters,
      inputUtf8ByteCount: units.utf8Bytes,
      estimatedCostUsd: estimateTtsCostUsd(modelId, text),
    },
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

export async function runTtsDebugTest(options: RunTtsDebugOptions): Promise<TtsDebugResult> {
  const model = getOpenRouterTtsModel(options.modelId)
  const units = countTextUnits(options.text)
  const requestStartedAt = Date.now()
  const base: TtsDebugResult = {
    modelId: options.modelId,
    voiceId: options.voiceId || model?.defaultVoice,
    status: 'running',
    timing: { requestStartedAt },
    metrics: {
      inputCharacterCount: units.characters,
      inputUtf8ByteCount: units.utf8Bytes,
      estimatedCostUsd: estimateTtsCostUsd(options.modelId, options.text),
    },
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
        voice: options.voiceId || model?.defaultVoice,
        speed: options.speed,
      }),
      signal: options.signal,
      cache: options.ignoreCache ? 'no-store' : 'default',
    })

    const responseHeadersAt = Date.now()
    base.httpStatus = response.status
    base.timing.responseHeadersAt = responseHeadersAt
    base.metrics.requestToHeadersMs = responseHeadersAt - requestStartedAt
    base.generationId = response.headers.get('X-Generation-Id') || undefined
    base.voiceId = response.headers.get('X-TTS-Voice') || base.voiceId

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
    const blob = new Blob([audioBytes.buffer], { type: contentType })
    const audioUrl = URL.createObjectURL(blob)
    return {
      ...base,
      status: 'success',
      contentType,
      audioUrl,
      audioCacheKey: base.generationId,
      timing: { ...base.timing, firstChunkAt, responseCompletedAt },
      metrics: {
        ...base.metrics,
        requestToFirstChunkMs: firstChunkAt ? firstChunkAt - requestStartedAt : undefined,
        requestToCompleteMs: responseCompletedAt - requestStartedAt,
      },
    }
  } catch (error) {
    const cancelled = options.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
    return {
      ...base,
      status: cancelled ? 'cancelled' : 'error',
      errorMessage: cancelled ? '停止しました' : error instanceof Error ? error.message : 'TTS通信エラーが発生しました',
    }
  }
}

export function revokeTtsDebugAudio(result: TtsDebugResult): void {
  if (result.audioUrl) URL.revokeObjectURL(result.audioUrl)
}
