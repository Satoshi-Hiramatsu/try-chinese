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

// 許可する高品質・高コスパTTSモデル（高額なMiniMax等は除外）
const ALLOWED_TTS_MODELS = [
  'qwen/qwen-audio-3.0-tts-flash',
  'qwen/qwen-audio-3.0-tts-plus',
  'hexgrad/kokoro-82m',
  'fish-audio/s2.1-pro-free:free',
  'fish-audio/s2.1-pro',
]
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

  // 使用モデルの検証（許可リスト外または未指定の場合は高コスパなデフォルトを使用）
  const targetModel = model && ALLOWED_TTS_MODELS.includes(model) ? model : DEFAULT_TTS_MODEL

  // モデルごとの有効話者リストと自動フォールバック
  const isMaleGuess = (v?: string) =>
    v && (v.includes('john') || v.includes('yun') || v.includes('male') || v.includes('onyx') || v.includes('echo'))

  let selectedVoice = voice && voice.trim() !== '' ? voice.trim() : ''

  if (targetModel === 'qwen/qwen-audio-3.0-tts-flash') {
    const validQwenVoices = ['loongjohn', 'longanhuan_v3.6']
    if (!validQwenVoices.includes(selectedVoice)) {
      selectedVoice = isMaleGuess(selectedVoice) ? 'loongjohn' : 'longanhuan_v3.6'
    }
  } else if (targetModel === 'qwen/qwen-audio-3.0-tts-plus') {
    const validPlusVoices = ['longanlingxin', 'longanlufeng']
    if (!validPlusVoices.includes(selectedVoice)) {
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
    if (!selectedVoice || !selectedVoice.startsWith('z')) {
      selectedVoice = isMaleGuess(selectedVoice) ? 'zm_yunxi' : 'zf_xiaoxiao'
    }
  } else if (!selectedVoice) {
    selectedVoice = 'alloy'
  }

  const clampedSpeed = Math.max(0.25, Math.min(4.0, Number(speed) || 1.0))

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
        voice: selectedVoice,
        speed: clampedSpeed,
        response_format: 'mp3',
      }),
    })

    if (!ttsRes.ok) {
      let errDetail = ''
      try {
        const errJson = await ttsRes.json()
        errDetail = JSON.stringify(errJson)
      } catch {
        errDetail = await ttsRes.text()
      }
      return c.json(
        {
          error: `OpenRouter TTS API エラー (${ttsRes.status}): ${errDetail}`,
        },
        ttsRes.status as any
      )
    }

    // 音声バイナリ (audio/mpeg) をクライアントへストリーミング返却
    const audioBuffer = await ttsRes.arrayBuffer()
    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenRouter TTS通信エラーが発生しました'
    return c.json({ error: msg }, 500)
  }
})

export default ttsRoute

