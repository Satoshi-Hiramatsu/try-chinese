import { Hono } from 'hono'

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
}

const MAX_TTS_CHARACTERS = 1000
const ALLOWED_TTS_MODELS = new Set([
  'qwen/qwen-audio-3.0-tts-flash',
  'qwen/qwen-audio-3.0-tts-plus',
  'hexgrad/kokoro-82m',
  'fish-audio/s2.1-pro-free:free',
  'fish-audio/s2.1-pro',
  'fish-audio/s2-pro',
  'google/gemini-3.1-flash-tts-preview',
  'minimax/speech-2.8-turbo',
  'microsoft/mai-voice-2',
])
const DEFAULT_TTS_MODEL = 'qwen/qwen-audio-3.0-tts-flash'

const ttsRoute = new Hono<{ Bindings: TtsEnv }>()

ttsRoute.post('/tts', async (c) => {
  let body: TtsRequestBody
  try {
    body = await c.req.json<TtsRequestBody>()
  } catch {
    return c.json({ error: 'リクエストボディが有効な JSON ではありません。' }, 400)
  }

  const { text, voice, speed = 1.0, apiKey, model } = body

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return c.json({ error: 'text は必須の文字列です。' }, 400)
  }
  if (Array.from(text).length > MAX_TTS_CHARACTERS) {
    return c.json({ error: `text は${MAX_TTS_CHARACTERS}文字以内にしてください。` }, 400)
  }

  // APIキーの解決（リクエスト指定 > ヘッダー > 環境変数）
  const headerKey =
    c.req.header('x-openrouter-key') ||
    c.req.header('x-api-key') ||
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')

  const resolvedApiKey = apiKey || headerKey || c.env?.OPENROUTER_API_KEY || c.env?.OPENAI_API_KEY

  if (!resolvedApiKey) {
    return c.json(
      {
        error:
          'OpenRouter APIキーが見つかりません。設定画面でOpenRouter APIキーを設定するか、ブラウザ標準音声をご利用ください。',
      },
      401
    )
  }

  if (model && !ALLOWED_TTS_MODELS.has(model)) {
    return c.json({ error: `許可されていないTTSモデルです: ${model}` }, 400)
  }
  const targetModel = model || DEFAULT_TTS_MODEL

  // モデルごとの有効話者リストと自動フォールバック
  const isMaleGuess = (v?: string) =>
    v && (v.includes('john') || v.includes('yun') || v.includes('male') || v.includes('onyx') || v.includes('echo'))

  let selectedVoice = voice && voice.trim() !== '' ? voice.trim() : undefined

  if (targetModel === 'qwen/qwen-audio-3.0-tts-flash') {
    const validQwenVoices = ['loongjohn', 'longanhuan_v3.6']
    if (!selectedVoice || !validQwenVoices.includes(selectedVoice)) {
      selectedVoice = isMaleGuess(selectedVoice) ? 'loongjohn' : 'longanhuan_v3.6'
    }
  } else if (targetModel === 'qwen/qwen-audio-3.0-tts-plus') {
    const validPlusVoices = ['longanlingxin', 'longanlufeng']
    if (!selectedVoice || !validPlusVoices.includes(selectedVoice)) {
      selectedVoice = isMaleGuess(selectedVoice) ? 'longanlufeng' : 'longanlingxin'
    }
  } else if (targetModel.includes('kokoro')) {
    const validKokoroZhVoices = [
      'zf_xiaobei',
      'zf_xiaoni',
      'zf_xiaoxiao',
      'zf_xiaoyi',
      'zm_yunjian',
      'zm_yunxi',
      'zm_yunxia',
      'zm_yunyang',
    ]
    if (!selectedVoice || !validKokoroZhVoices.includes(selectedVoice)) {
      selectedVoice = isMaleGuess(selectedVoice) ? 'zm_yunxi' : 'zf_xiaoxiao'
    }
  } else if (targetModel === 'google/gemini-3.1-flash-tts-preview' && !selectedVoice) {
    selectedVoice = 'Kore'
  } else if (targetModel === 'minimax/speech-2.8-turbo' && !selectedVoice) {
    selectedVoice = 'English_radiant_girl'
  } else if (targetModel === 'microsoft/mai-voice-2' && !selectedVoice) {
    selectedVoice = 'en-US-Harper:MAI-Voice-2'
  }

  const clampedSpeed = targetModel === 'microsoft/mai-voice-2'
    ? Math.max(0.5, Math.min(2.0, Number(speed) || 1.0))
    : Math.max(0.25, Math.min(4.0, Number(speed) || 1.0))

  try {
    const ttsRes = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        input: text.trim(),
        ...(selectedVoice ? { voice: selectedVoice } : {}),
        speed: clampedSpeed,
        response_format: 'mp3',
      }),
      signal: c.req.raw.signal,
    })

    if (!ttsRes.ok) {
      let errDetail = ''
      try {
        const errJson = await ttsRes.json()
        errDetail = JSON.stringify(errJson)
      } catch {
        errDetail = await ttsRes.text()
      }
      return new Response(
        JSON.stringify({ error: `OpenRouter TTS API エラー (${ttsRes.status}): ${errDetail.slice(0, 2000)}` }),
        { status: ttsRes.status, headers: { 'Content-Type': 'application/json; charset=UTF-8' } }
      )
    }

    if (!ttsRes.body) return c.json({ error: 'OpenRouterから空の音声応答が返されました。' }, 502)

    const responseHeaders = new Headers({
      'Content-Type': ttsRes.headers.get('Content-Type') || 'audio/mpeg',
      'Cache-Control': 'private, no-store',
      'X-TTS-Model': targetModel,
    })
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
