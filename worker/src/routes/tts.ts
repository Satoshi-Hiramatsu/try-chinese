import { Hono } from 'hono'
import {
  fetchSpeechModels,
  FALLBACK_TTS_MODEL_IDS,
  MODEL_ID_PATTERN,
  type SpeechModel,
} from '../services/openRouterCatalog'

export interface TtsEnv {
  OPENROUTER_API_KEY?: string
  OPENAI_API_KEY?: string
}

interface TtsRequestBody {
  text: string
  voice?: string
  speed?: number
  apiKey?: string
  model?: string
  /** 省略時はモデルごとの既定形式を使う。検証モードから明示指定できる。 */
  format?: string
}

const MAX_TTS_CHARACTERS = 1000
const DEFAULT_TTS_MODEL = 'qwen/qwen-audio-3.0-tts-flash'
const DEFAULT_RESPONSE_FORMAT = 'mp3'

/**
 * mp3を受け付けないモデルの既定形式。
 * Gemini TTS は response_format="pcm" のみを受け付け、mp3を送ると400になる。
 */
const FORCED_RESPONSE_FORMATS: readonly { pattern: RegExp; format: string }[] = [
  { pattern: /^google\/gemini-.*-tts/i, format: 'pcm' },
]

/** PCMで返るモデルのサンプリングレート。Gemini TTS は 24kHz / 16bit / モノラル。 */
const PCM_SAMPLE_RATES: readonly { pattern: RegExp; sampleRate: number }[] = [
  { pattern: /^google\/gemini-.*-tts/i, sampleRate: 24000 },
]

/** speed を受け付けないモデル。指定するとプロバイダ側で400になることがある。 */
const NO_SPEED_MODELS: readonly RegExp[] = [/^google\/gemini-.*-tts/i]

/**
 * 中国語会話での既定話者。カタログの先頭話者は英語音声であることが多いため、
 * 本アプリの用途に合う話者を明示しておく。
 */
const PREFERRED_VOICES: Record<string, { female: string; male: string }> = {
  'hexgrad/kokoro-82m': { female: 'zf_xiaoxiao', male: 'zm_yunxi' },
  'qwen/qwen-audio-3.0-tts-flash': { female: 'longanhuan_v3.6', male: 'loongjohn' },
  'qwen/qwen-audio-3.0-tts-plus': { female: 'longanlingxin', male: 'longanlufeng' },
  'google/gemini-3.1-flash-tts-preview': { female: 'Kore', male: 'Puck' },
  // MiniMax は多言語対応だが、OpenRouterが公開する話者IDは英語名のみ。
  'minimax/speech-2.8-turbo': { female: 'English_radiant_girl', male: 'English_magnetic_voiced_man' },
  'minimax/speech-2.8-hd': { female: 'English_radiant_girl', male: 'English_magnetic_voiced_man' },
  'microsoft/mai-voice-2': { female: 'en-US-Harper:MAI-Voice-2', male: 'de-DE-Klaus:MAI-Voice-2' },
  'microsoft/mai-voice-2-flash': { female: 'en-US-Harper:MAI-Voice-2', male: 'de-DE-Klaus:MAI-Voice-2' },
}

const ttsRoute = new Hono<{ Bindings: TtsEnv }>()

function resolveApiKey(c: { req: { header: (name: string) => string | undefined }; env?: TtsEnv }, bodyKey?: string) {
  const headerKey =
    c.req.header('x-openrouter-key') ||
    c.req.header('x-api-key') ||
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
  return bodyKey || headerKey || c.env?.OPENROUTER_API_KEY || c.env?.OPENAI_API_KEY
}

function matches(list: readonly RegExp[], modelId: string): boolean {
  return list.some((pattern) => pattern.test(modelId))
}

export function resolveResponseFormat(modelId: string, requested?: string): string {
  if (requested && requested.trim() !== '') return requested.trim()
  return FORCED_RESPONSE_FORMATS.find((entry) => entry.pattern.test(modelId))?.format || DEFAULT_RESPONSE_FORMAT
}

export function resolvePcmSampleRate(modelId: string): number {
  return PCM_SAMPLE_RATES.find((entry) => entry.pattern.test(modelId))?.sampleRate || 24000
}

/**
 * `Gemini TTS only supports response_format="pcm". Got "mp3".` のような
 * 上流エラーから、要求されている形式を取り出す。
 * 未知のモデルでも1回だけ正しい形式で再試行できるようにするために使う。
 */
export function extractRequiredFormat(errorDetail: string): string | undefined {
  const match = /response_format\s*[=:]\s*\\?"?([a-z0-9_]+)\\?"?/i.exec(errorDetail)
  const format = match?.[1]?.toLowerCase()
  if (!format || format === 'mp3') return undefined
  return format
}

/** カタログの話者一覧に照らして話者を決定する。一覧が無いモデルは指定をそのまま通す。 */
export function resolveVoice(
  modelId: string,
  requested: string | undefined,
  supportedVoices: readonly string[]
): string | undefined {
  const voice = requested && requested.trim() !== '' ? requested.trim() : undefined
  if (supportedVoices.length === 0) return voice || PREFERRED_VOICES[modelId]?.female
  if (voice && supportedVoices.includes(voice)) return voice

  // 「female」「woman」は「male」「man」を含むため、女性を示す語を先に判定する。
  const lowered = voice?.toLowerCase() || ''
  const isFemaleGuess = /female|woman|girl|lady|queen|^[azj]f_/.test(lowered)
  const isMaleGuess = !isFemaleGuess && /john|yun|male|man|boy|gentleman|onyx|echo|^[azj]m_/.test(lowered)
  const preferred = PREFERRED_VOICES[modelId]
  const candidate = isMaleGuess ? preferred?.male : preferred?.female
  if (candidate && supportedVoices.includes(candidate)) return candidate
  return supportedVoices[0]
}

/**
 * OpenRouterで音声出力できるモデルの一覧。
 * 検証モードのモデル選択と話者プリセットの生成元になる。
 */
ttsRoute.get('/tts/models', async (c) => {
  const models = await fetchSpeechModels(resolveApiKey(c))
  if (!models) {
    return c.json(
      {
        models: FALLBACK_TTS_MODEL_IDS.map((id) => ({
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

ttsRoute.post('/tts', async (c) => {
  let body: TtsRequestBody
  try {
    body = await c.req.json<TtsRequestBody>()
  } catch {
    return c.json({ error: 'リクエストボディが有効な JSON ではありません。' }, 400)
  }

  const { text, voice, speed = 1.0, apiKey, model, format } = body

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return c.json({ error: 'text は必須の文字列です。' }, 400)
  }
  if (Array.from(text).length > MAX_TTS_CHARACTERS) {
    return c.json({ error: `text は${MAX_TTS_CHARACTERS}文字以内にしてください。` }, 400)
  }

  // APIキーの解決（リクエスト指定 > ヘッダー > 環境変数）
  const resolvedApiKey = resolveApiKey(c, apiKey)

  if (!resolvedApiKey) {
    return c.json(
      {
        error:
          'OpenRouter APIキーが見つかりません。設定画面でOpenRouter APIキーを設定するか、ブラウザ標準音声をご利用ください。',
      },
      401
    )
  }

  const targetModel = model || DEFAULT_TTS_MODEL

  // 対応モデルはOpenRouterのカタログを正とし、取得できないときのみ既知の一覧で判定する。
  const catalog = await fetchSpeechModels(resolvedApiKey)
  let catalogEntry: SpeechModel | undefined
  if (catalog) {
    catalogEntry = catalog.find((entry) => entry.id === targetModel)
    if (!catalogEntry) {
      return c.json({ error: `許可されていないTTSモデルです: ${targetModel}（音声出力に対応していません）` }, 400)
    }
  } else if (!FALLBACK_TTS_MODEL_IDS.includes(targetModel) || !MODEL_ID_PATTERN.test(targetModel)) {
    return c.json({ error: `許可されていないTTSモデルです: ${targetModel}` }, 400)
  }

  const selectedVoice = resolveVoice(targetModel, voice, catalogEntry?.supportedVoices || [])

  const clampedSpeed = targetModel.startsWith('microsoft/mai-voice')
    ? Math.max(0.5, Math.min(2.0, Number(speed) || 1.0))
    : Math.max(0.25, Math.min(4.0, Number(speed) || 1.0))
  const sendsSpeed = !matches(NO_SPEED_MODELS, targetModel)

  const requestUpstream = (responseFormat: string) =>
    fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        input: text.trim(),
        ...(selectedVoice ? { voice: selectedVoice } : {}),
        ...(sendsSpeed ? { speed: clampedSpeed } : {}),
        response_format: responseFormat,
      }),
      signal: c.req.raw.signal,
    })

  const readError = async (response: Response): Promise<string> => {
    try {
      return JSON.stringify(await response.json())
    } catch {
      return await response.text()
    }
  }

  try {
    let responseFormat = resolveResponseFormat(targetModel, format)
    let ttsRes = await requestUpstream(responseFormat)

    if (!ttsRes.ok) {
      let errDetail = await readError(ttsRes)
      // 形式が合わないだけの場合は、上流が指定してきた形式で1回だけ再試行する。
      const requiredFormat = ttsRes.status === 400 ? extractRequiredFormat(errDetail) : undefined
      if (requiredFormat && requiredFormat !== responseFormat) {
        responseFormat = requiredFormat
        ttsRes = await requestUpstream(responseFormat)
        if (!ttsRes.ok) errDetail = await readError(ttsRes)
      }
      if (!ttsRes.ok) {
        return new Response(
          JSON.stringify({ error: `OpenRouter TTS API エラー (${ttsRes.status}): ${errDetail.slice(0, 2000)}` }),
          { status: ttsRes.status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } }
        )
      }
    }

    if (!ttsRes.body) return c.json({ error: 'OpenRouterから空の音声応答が返されました。' }, 502)

    const isPcm = responseFormat === 'pcm'
    const upstreamType = ttsRes.headers.get('Content-Type')
    const responseHeaders = new Headers({
      // PCMはヘッダーを持たない生データのため、クライアント側でWAV化して再生する。
      'Content-Type': upstreamType || (isPcm ? 'audio/pcm' : 'audio/mpeg'),
      'Cache-Control': 'private, no-store',
      'X-TTS-Model': targetModel,
      'X-TTS-Format': responseFormat,
    })
    if (isPcm) {
      responseHeaders.set('X-TTS-Sample-Rate', String(resolvePcmSampleRate(targetModel)))
      responseHeaders.set('X-TTS-Bit-Depth', '16')
      responseHeaders.set('X-TTS-Channels', '1')
    }
    const generationId = ttsRes.headers.get('X-Generation-Id')
    if (generationId) responseHeaders.set('X-Generation-Id', generationId)
    if (selectedVoice) responseHeaders.set('X-TTS-Voice', selectedVoice)

    return new Response(ttsRes.body, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenRouter TTS通信エラーが発生しました'
    return c.json({ error: msg }, 500)
  }
})

export default ttsRoute
