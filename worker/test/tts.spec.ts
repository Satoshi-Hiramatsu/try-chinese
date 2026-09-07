import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import worker from '../src'

describe('TTS API (/api/tts)', () => {
  it('textが空の場合は400エラーを返す', async () => {
    const request = new Request('http://example.com/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    })
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(400)
    const json = (await response.json()) as { error: string }
    expect(json.error).toContain('text は必須')
  })

  it('APIキーがない場合は401エラーを返す', async () => {
    const request = new Request('http://example.com/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '你好' }),
    })
    const ctx = createExecutionContext()
    const response = await worker.fetch(
      request,
      { ...env, OPENROUTER_API_KEY: undefined, OPENAI_API_KEY: undefined },
      ctx
    )
    await waitOnExecutionContext(ctx)

    expect(response.status).toBe(401)
    const json = (await response.json()) as { error: string }
    expect(json.error).toContain('OpenRouter APIキーが見つかりません')
  })
})
