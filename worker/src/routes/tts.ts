import { Hono } from 'hono'

export interface TtsEnv {
  OPENAI_API_KEY?: string
}

interface TtsRequestBody {
  text: string
  voice?: string
  speed?: number
  apiKey?: string
}

const ttsRoute = new Hono<{ Bindings: TtsEnv }>()

ttsRoute.post('/tts', async (c) => {
  let body: TtsRequestBody
  try {
    body = await c.req.json<TtsRequestBody>()
  } catch {
    return c.json({ error: 'リクエストボディが有効な JSON ではありません。' }, 400)
  }

  const { text, voice = 'alloy', speed = 1.0, apiKey } = body

  if (!text || typeof text !== 'string' || text.trim() === '') {
    return c.json({ error: 'text は必須の文字列です。' }, 400)
  }

  // APIキーの解決（リクエスト指定 > ヘッダー > 環境変数）
  const headerKey =
    c.req.header('x-openai-key') ||
    c.req.header('x-api-key') ||
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')

  const resolvedApiKey = apiKey || headerKey || c.env?.OPENAI_API_KEY

  if (!resolvedApiKey) {
    return c.json(
      {
        error:
          'OpenAI APIキーが見つかりません。設定画面でOpenAI APIキーを設定するか、ブラウザ標準音声をご利用ください。',
      },
      401
    )
  }

  // 有効な声質モデル
  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
  const selectedVoice = validVoices.includes(voice.toLowerCase()) ? voice.toLowerCase() : 'alloy'

  const clampedSpeed = Math.max(0.25, Math.min(4.0, Number(speed) || 1.0))

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text.trim(),
        voice: selectedVoice,
        speed: clampedSpeed,
        response_format: 'mp3',
      }),
    })

    if (!openaiRes.ok) {
      let errDetail = ''
      try {
        const errJson = await openaiRes.json()
        errDetail = JSON.stringify(errJson)
      } catch {
        errDetail = await openaiRes.text()
      }
      return c.json(
        {
          error: `OpenAI TTS API エラー (${openaiRes.status}): ${errDetail}`,
        },
        openaiRes.status as any
      )
    }

    // 音声バイナリ (audio/mpeg) をクライアントへストリーミング返却
    const audioBuffer = await openaiRes.arrayBuffer()
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenAI TTS通信エラーが発生しました'
    return c.json({ error: msg }, 500)
  }
})

export default ttsRoute
