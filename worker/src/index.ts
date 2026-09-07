import { Hono } from 'hono'
import { cors } from 'hono/cors'
import chatRoute, { type ChatEnv } from './routes/chat'

export interface AppBindings extends Env, ChatEnv {
  ASSETS?: Fetcher
}

const app = new Hono<{ Bindings: AppBindings }>()

app.use('/api/*', cors())

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// チャットAPIマウント (/api/chat)
app.route('/api', chatRoute)

// 静的アセット (SPA) へのフォールバック
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw)
  }
  return c.text('Not Found', 404)
})

export default app

