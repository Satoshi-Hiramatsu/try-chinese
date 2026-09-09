/**
 * OpenRouter の音声出力モデル一覧を取得・キャッシュする。
 *
 * モデルの追加・廃止・価格改定はOpenRouter側で随時行われるため、
 * 対応モデルをコードに固定せず実行時に取得する。
 * Workers のアイソレート内でのみ有効な軽量キャッシュを持つ。
 */

const CATALOG_URL = 'https://openrouter.ai/api/v1/models?output_modalities=speech'
const CACHE_TTL_MS = 10 * 60 * 1000

export interface SpeechModelPricing {
  /** 入力単位あたりのUSD。TTSでは文字/バイト/トークンのいずれかで、モデルにより異なる。 */
  prompt: number
  /** 出力音声トークンあたりのUSD。文字課金モデルでは0。 */
  completion: number
}

export interface SpeechModel {
  id: string
  name: string
  description: string
  supportedVoices: string[]
  pricing: SpeechModelPricing
}

interface RawModel {
  id?: unknown
  name?: unknown
  description?: unknown
  supported_voices?: unknown
  pricing?: { prompt?: unknown; completion?: unknown }
}

/**
 * カタログ取得に失敗した場合に許可するモデル。
 * OpenRouterへ到達できない状況でも既存の会話機能を止めないための最低限の集合。
 */
export const FALLBACK_TTS_MODEL_IDS: readonly string[] = [
  'hexgrad/kokoro-82m',
  'qwen/qwen-audio-3.0-tts-flash',
  'qwen/qwen-audio-3.0-tts-plus',
  'fish-audio/s2.1-pro-free:free',
  'fish-audio/s2.1-pro',
  'fish-audio/s2-pro',
  'google/gemini-3.1-flash-tts-preview',
  'minimax/speech-2.8-turbo',
  'microsoft/mai-voice-2',
]

/** `provider/model` 形式のみ通す。カタログ未取得時の最低限の入力検証に使う。 */
export const MODEL_ID_PATTERN = /^[a-z0-9][\w.-]*\/[\w.:-]+$/i

let cache: { fetchedAt: number; models: SpeechModel[] } | undefined

function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function normalize(raw: RawModel): SpeechModel | undefined {
  if (typeof raw.id !== 'string' || raw.id === '') return undefined
  const voices = Array.isArray(raw.supported_voices)
    ? raw.supported_voices.filter((voice): voice is string => typeof voice === 'string')
    : []
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : raw.id,
    description: typeof raw.description === 'string' ? raw.description : '',
    supportedVoices: voices,
    pricing: {
      prompt: toNumber(raw.pricing?.prompt),
      completion: toNumber(raw.pricing?.completion),
    },
  }
}

/**
 * 音声出力モデル一覧を返す。取得できない場合は undefined を返し、
 * 呼び出し側でフォールバック判断できるようにする。
 */
export async function fetchSpeechModels(apiKey?: string): Promise<SpeechModel[] | undefined> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.models

  try {
    const response = await fetch(CATALOG_URL, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
    if (!response.ok) return cache?.models
    const payload = (await response.json()) as { data?: unknown }
    if (!Array.isArray(payload.data)) return cache?.models
    const models = payload.data
      .map((item) => normalize(item as RawModel))
      .filter((model): model is SpeechModel => model !== undefined)
    if (models.length === 0) return cache?.models
    cache = { fetchedAt: Date.now(), models }
    return models
  } catch {
    // ネットワーク障害時は期限切れキャッシュでも返し、無ければ未取得として扱う。
    return cache?.models
  }
}

/** テスト用にキャッシュを破棄する。 */
export function resetSpeechModelCache(): void {
  cache = undefined
}
