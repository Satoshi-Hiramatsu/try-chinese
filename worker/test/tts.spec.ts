import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, it, expect, vi } from 'vitest'
import worker from '../src'

describe('TTS API (/api/tts)', () => {
  afterEach(() => vi.unstubAllGlobals())

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

  it('許可されていないモデルを既定モデルへ置き換えず400を返す', async () => {
    const request = new Request('http://example.com/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OpenRouter-Key': 'test-key' },
      body: JSON.stringify({ text: '你好', model: 'unknown/provider-model' }),
    })
    const response = await worker.fetch(request, env, createExecutionContext())

    expect(response.status).toBe(400)
    const json = (await response.json()) as { error: string }
    expect(json.error).toContain('許可されていないTTSモデルです')
    expect(json.error).toContain('unknown/provider-model')
  })

  it('上流の音声ストリームと診断ヘッダーをそのまま返す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'audio/wav', 'X-Generation-Id': 'gen-test' },
    })))
    const request = new Request('http://example.com/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OpenRouter-Key': 'test-key' },
      body: JSON.stringify({ text: '你好', model: 'google/gemini-3.1-flash-tts-preview' }),
    })
    const response = await worker.fetch(request, env, createExecutionContext())

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Generation-Id')).toBe('gen-test')
    expect(response.headers.get('X-TTS-Model')).toBe('google/gemini-3.1-flash-tts-preview')
    expect(response.headers.get('X-TTS-Voice')).toBe('Kore')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
  })
})
