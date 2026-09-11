import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, it, expect, vi } from 'vitest'
import worker from '../src'
import { normalizeKeyInfo } from '../src/routes/openRouterKey'

const KEY_INFO_URL = 'https://openrouter.ai/api/v1/key'

function stubUpstream(handler: (init?: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url !== KEY_INFO_URL) return new Response('unexpected', { status: 500 })
    return handler(init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function keyRequest(apiKey?: string): Request {
  const headers: Record<string, string> = {}
  if (apiKey) headers['x-api-key'] = apiKey
  return new Request('http://example.com/api/openrouter/key', { headers })
}

async function run(request: Request) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(request, { ...env, OPENROUTER_API_KEY: 'owner-key' }, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe('normalizeKeyInfo', () => {
  it('label と limit_remaining を取り出す', () => {
    expect(normalizeKeyInfo({ data: { label: 'my key', limit_remaining: 1.5, usage: 3 } })).toEqual({
      valid: true,
      label: 'my key',
      limitRemaining: 1.5,
      exhausted: false,
    })
  })

  it('上限なしのキーは limitRemaining が null で exhausted にならない', () => {
    expect(normalizeKeyInfo({ data: { label: '', limit_remaining: null } })).toEqual({
      valid: true,
      label: undefined,
      limitRemaining: null,
      exhausted: false,
    })
  })

  it('上限を使い切っていれば exhausted になる', () => {
    expect(normalizeKeyInfo({ data: { limit_remaining: 0 } }).exhausted).toBe(true)
    expect(normalizeKeyInfo({ data: { limit_remaining: -0.01 } }).exhausted).toBe(true)
  })

  it('壊れた応答でも valid だけは返す', () => {
    expect(normalizeKeyInfo(undefined)).toEqual({ valid: true, label: undefined, limitRemaining: null, exhausted: false })
  })
})

describe('GET /api/openrouter/key', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('キーが無ければ 400 を返し、環境変数のキーへは落ちない', async () => {
    const fetchMock = stubUpstream(() => Response.json({ data: { label: 'owner' } }))
    const response = await run(keyRequest())
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('利用者のキーを Bearer で上流へ渡す', async () => {
    const fetchMock = stubUpstream(() => Response.json({ data: { label: 'user', limit_remaining: 2 } }))
    const response = await run(keyRequest('sk-or-v1-user'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-v1-user')
    expect(await response.json()).toEqual({ valid: true, label: 'user', limitRemaining: 2, exhausted: false })
  })

  it('上流が 401 なら無効なキーとして 200 で返す', async () => {
    stubUpstream(() => new Response('unauthorized', { status: 401 }))
    const response = await run(keyRequest('sk-or-v1-bad'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ valid: false })
  })

  it('上流が 5xx なら 502 を返す', async () => {
    stubUpstream(() => new Response('down', { status: 503 }))
    const response = await run(keyRequest('sk-or-v1-user'))
    expect(response.status).toBe(502)
  })

  it('上流へ届かなければ 502 を返す', async () => {
    stubUpstream(() => {
      throw new TypeError('network')
    })
    const response = await run(keyRequest('sk-or-v1-user'))
    expect(response.status).toBe(502)
  })
})
