import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

app.get('/', (c) => {
  return c.text('しゃべチャイナ API Worker')
})

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default app
