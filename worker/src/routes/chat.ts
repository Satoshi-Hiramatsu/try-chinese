import { Hono } from 'hono'
import type { ChatRequest, ChatResponse } from '../types'
import { callChatLLM } from '../lib/llm'

export interface ChatEnv {
  OPENROUTER_API_KEY?: string
  OPENAI_API_KEY?: string
}

const chatRoute = new Hono<{ Bindings: ChatEnv }>()

chatRoute.post('/chat', async (c) => {
  let body: ChatRequest
  try {
    body = await c.req.json<ChatRequest>()
  } catch {
    return c.json({ error: 'リクエストボディが有効な JSON ではありません。' }, 400)
  }

  const { message, friend, hskLevel, history, config } = body

  // 1. バリデーション
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return c.json({ error: 'message は必須の文字列です。' }, 400)
  }

  if (!friend || typeof friend !== 'object' || !friend.name) {
    return c.json({ error: 'friend (名前を含むオブジェクト) は必須です。' }, 400)
  }

  const levelNum = Number(hskLevel)
  if (isNaN(levelNum) || levelNum < 1 || levelNum > 6) {
    return c.json({ error: 'hskLevel は 1 から 6 の数値である必要があります。' }, 400)
  }

  // 2. API キーの取得（BYO-AI: リクエストヘッダー/ボディ優先、次に Workers 環境変数）
  const headerKey = c.req.header('x-api-key') || c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
  const configKey = config?.llm?.apiKey
  const envKey = c.env?.OPENROUTER_API_KEY || c.env?.OPENAI_API_KEY

  const resolvedApiKey = headerKey || configKey || envKey

  if (!resolvedApiKey) {
    return c.json({
      error: 'APIキーが見つかりません。リクエストの config.llm.apiKey、x-api-key ヘッダー、または環境変数を設定してください。',
    }, 401)
  }

  const model = config?.llm?.model

  // 3. LLM 呼び出し
  try {
    const result: ChatResponse = await callChatLLM({
      message,
      friend,
      hskLevel: levelNum,
      history,
      apiKey: resolvedApiKey,
      model,
    })

    return c.json(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '予期せぬエラーが発生しました。'
    return c.json({ error: errorMessage }, 500)
  }
})

export default chatRoute
