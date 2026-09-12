import { Hono } from 'hono'
import {
  fetchTranscriptionModels,
  FALLBACK_STT_MODEL_IDS,
  MODEL_ID_PATTERN,
  type SpeechModel,
} from '../services/openRouterCatalog'
import { FREE_MODE_PAID_MODEL_ERROR, isModelAllowedForKey, resolveApiKey } from '../lib/apiKey'

export interface SttEnv {
  OPENROUTER_API_KEY?: string
  OPENAI_API_KEY?: string
}

interface SttRequestBody {
  /** Base64 の音声データ。data URI ではなく生のバイト列を符号化したもの。 */
  audio: string
  /** 音声の形式。MediaRecorder の既定は webm。 */
  format?: string
  model?: string
  /** ISO-639-1。省略すると上流が自動判定する（日中混在の発話に対応するため既定は省略）。 */
  language?: string
  apiKey?: string
  /** verbose_json を指定すると言語・長さ・区間が返る。 */
  responseFormat?: 'json' | 'verbose_json'
}

const TRANSCRIPTION_URL = 'https://openrouter.ai/api/v1/audio/transcriptions'

export const DEFAULT_STT_MODEL = 'qwen/qwen3-asr-flash-2026-02-10'

/**
 * Base64 文字列の上限。
 * 上流は multipart で 25MB まで受けるが、会話の一発話はせいぜい数十KBなので
 * 事故で巨大な本文が飛んできたときに早く落とすための値として持つ。
 */
const MAX_AUDIO_BASE64_LENGTH = 12 * 1024 * 1024

/** 上流が受け付ける音声形式。 */
const SUPPORTED_FORMATS: readonly string[] = ['webm', 'wav', 'mp3', 'flac', 'm4a', 'ogg', 'aac', 'mp4', 'mpeg']

const DEFAULT_FORMAT = 'webm'

const sttRoute = new Hono<{ Bindings: SttEnv }>()

/** 形式名を正規化する。未対応の値は既定へ寄せず、呼び出し側でエラーにする。 */
export function normalizeAudioFormat(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return DEFAULT_FORMAT
  if (typeof value !== 'string') return undefined
  // "audio/webm;codecs=opus" のような MIME でも受け取れるようにする。
  const bare = value.split(';')[0].trim().toLowerCase().replace(/^audio\//, '')
  return SUPPORTED_FORMATS.includes(bare) ? bare : undefined
}

/** 言語指定を ISO-639-1 に限定する。空文字や不正値は「自動判定」として扱う。 */
export function normalizeLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().toLowerCase()
  return /^[a-z]{2}$/.test(trimmed) ? trimmed : undefined
}

export interface NormalizedTranscription {
  text: string
  language?: string
  durationSeconds?: number
  costUsd?: number
}

/**
 * 上流の応答から、段をまたいで扱いやすい形だけを取り出す。
 *
 * `usage.cost` は実費。TTS と同じくカタログは単価だけを返し課金単位を返さないため、
 * 費用はこの値を正として扱う。
 */
export function normalizeTranscription(payload: unknown): NormalizedTranscription | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const raw = payload as Record<string, unknown>
  if (typeof raw.text !== 'string') return undefined

  const usage = (raw.usage && typeof raw.usage === 'object' ? raw.usage : {}) as Record<string, unknown>
  const numberOrUndefined = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  return {
    text: raw.text,
    language: typeof raw.language === 'string' && raw.language !== '' ? raw.language : undefined,
    durationSeconds: numberOrUndefined(raw.duration) ?? numberOrUndefined(usage.seconds),
    costUsd: numberOrUndefined(usage.cost),
  }
}

/**
 * 文字起こしできるモデルの一覧。
 * 開発者モードのモデル選択と、本体の既定モデルの妥当性確認に使う。
 */
sttRoute.get('/stt/models', async (c) => {
  const models = await fetchTranscriptionModels(resolveApiKey(c)?.key)
  if (!models) {
    return c.json(
      {
        models: FALLBACK_STT_MODEL_IDS.map((id) => ({
          id,
          name: id,
          description: '',
          supportedVoices: [],
          pricing: { prompt: 0, completion: 0 },
        })),
        stale: true,
      },
      200
    )
  }
  return c.json({ models, stale: false })
})

sttRoute.post('/stt', async (c) => {
  let body: SttRequestBody
  try {
    body = await c.req.json<SttRequestBody>()
  } catch {
    return c.json({ error: 'リクエストボディが有効な JSON ではありません。' }, 400)
  }

  const { audio, format, model, language, apiKey, responseFormat } = body

  if (!audio || typeof audio !== 'string' || audio.trim() === '') {
    return c.json({ error: 'audio は必須の Base64 文字列です。' }, 400)
  }
  if (audio.length > MAX_AUDIO_BASE64_LENGTH) {
    return c.json({ error: '音声データが大きすぎます。録音を短く区切ってください。' }, 413)
  }

  const audioFormat = normalizeAudioFormat(format)
  if (!audioFormat) {
    return c.json({ error: `対応していない音声形式です: ${String(format)}` }, 400)
  }

  const resolved = resolveApiKey(c, apiKey)
  if (!resolved) {
    return c.json(
      { error: 'OpenRouter APIキーが見つかりません。設定画面でAPIキーを設定してください。' },
      401
    )
  }
  const resolvedApiKey = resolved.key

  const targetModel = model || DEFAULT_STT_MODEL

  // 所有者キーでの代行は無料モデルに限る。
  if (!isModelAllowedForKey(targetModel, resolved)) {
    return c.json({ error: FREE_MODE_PAID_MODEL_ERROR }, 402)
  }

  // 対応モデルはOpenRouterのカタログを正とし、取得できないときのみ既知の一覧で判定する。
  const catalog = await fetchTranscriptionModels(resolvedApiKey)
  let catalogEntry: SpeechModel | undefined
  if (catalog) {
    catalogEntry = catalog.find((entry) => entry.id === targetModel)
    if (!catalogEntry) {
      return c.json({ error: `許可されていないSTTモデルです: ${targetModel}（文字起こしに対応していません）` }, 400)
    }
  } else if (!FALLBACK_STT_MODEL_IDS.includes(targetModel) || !MODEL_ID_PATTERN.test(targetModel)) {
    return c.json({ error: `許可されていないSTTモデルです: ${targetModel}` }, 400)
  }

  const resolvedLanguage = normalizeLanguage(language)

  try {
    const upstream = await fetch(TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        input_audio: { data: audio, format: audioFormat },
        // language を送らないと上流が自動判定する。日中混在の発話はこれに任せる。
        ...(resolvedLanguage ? { language: resolvedLanguage } : {}),
        response_format: responseFormat === 'verbose_json' ? 'verbose_json' : 'json',
      }),
      signal: c.req.raw.signal,
    })

    if (!upstream.ok) {
      let detail: string
      try {
        detail = JSON.stringify(await upstream.json())
      } catch {
        detail = await upstream.text()
      }
      return c.json(
        { error: `OpenRouter STT API エラー (${upstream.status}): ${detail.slice(0, 2000)}` },
        upstream.status as 400
      )
    }

    const normalized = normalizeTranscription(await upstream.json())
    if (!normalized) {
      return c.json({ error: 'OpenRouterから転写テキストが返されませんでした。' }, 502)
    }

    return c.json({ ...normalized, model: targetModel })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenRouter STT通信エラーが発生しました'
    return c.json({ error: msg }, 500)
  }
})

export default sttRoute
