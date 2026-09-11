import { Hono } from 'hono'
import { cors } from 'hono/cors'
import chatRoute, { type ChatEnv } from './routes/chat'
import sttRoute, { type SttEnv } from './routes/stt'
import ttsRoute, { type TtsEnv } from './routes/tts'
import openRouterKeyRoute from './routes/openRouterKey'

export interface AppBindings extends Env, ChatEnv, TtsEnv, SttEnv {
  ASSETS?: Fetcher
}

const app = new Hono<{ Bindings: AppBindings }>()

// 音声検証モードはレスポンスヘッダーの診断情報を読むため、明示的に公開する。
app.use(
  '/api/*',
  cors({
    origin: '*',
    exposeHeaders: [
      'X-Generation-Id',
      'X-TTS-Model',
      'X-TTS-Voice',
      'X-TTS-Format',
      'X-TTS-Sample-Rate',
      'X-TTS-Bit-Depth',
      'X-TTS-Channels',
    ],
  })
)

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// チャットAPIマウント (/api/chat)
app.route('/api', chatRoute)

// TTS音声合成APIマウント (/api/tts)
app.route('/api', ttsRoute)

// STT文字起こしAPIマウント (/api/stt)
app.route('/api', sttRoute)

// 利用者のAPIキー検査 (/api/openrouter/key)
app.route('/api', openRouterKeyRoute)

// 静的アセット (SPA) へのフォールバック
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw)
  }
  return c.text('Not Found', 404)
})

export default app

