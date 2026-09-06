import { Hono } from 'hono'
import { cors } from 'hono/cors'
import chatRoute, { type ChatEnv } from './routes/chat'

export type AppBindings = Env & ChatEnv

const app = new Hono<{ Bindings: AppBindings }>()

app.use('*', cors())

app.get('/', (c) => {
  return c.text('しゃべチャイナ API Worker')
})

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// チャットAPIマウント (/api/chat)
app.route('/api', chatRoute)

export default app

