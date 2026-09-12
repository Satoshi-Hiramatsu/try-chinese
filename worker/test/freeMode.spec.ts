import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, it, expect, vi } from 'vitest'
import worker from '../src'
import { isFreeModel, isModelAllowedForKey, parseFreeModelList, resolveApiKey } from '../src/lib/apiKey'
import { resetSpeechModelCache } from '../src/services/openRouterCatalog'

/**
 * 無料モード（利用者キー無し・所有者キーで代行）のガード。
 * 所有者キーは無料モデルにしか使わせない。
 */

const mockFriend = { name: '陈美玲', personality: '明るい', hobbies: ['映画'] }

const chatPayload = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          reply: { zh: '我也很喜欢。', ja: '私も好きです。', hskLevel: 2 },
          correction: { hasCorrection: false },
          vocabulary: [],
          expression: 'smile',
        }),
      },
    },
  ],
}

/** 会話・音声・カタログをまとめてスタブし、上流へ送った本文を記録する。 */
function stubUpstream(options: {
  chat?: (body: Record<string, unknown>, callIndex: number) => Response
  speech?: () => Response
}) {
  const chatCalls: Record<string, unknown>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/chat/completions')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        chatCalls.push(body)
        return options.chat ? options.chat(body, chatCalls.length - 1) : Response.json(chatPayload)
      }
      if (url.includes('/audio/speech')) {
        return options.speech
          ? options.speech()
          : new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/mpeg' } })
      }
      // カタログは取得失敗にして既知一覧で判定させる（無料版 Fish は既知一覧に含まれる）。
      return new Response('unavailable', { status: 503 })
    })
  )
  return chatCalls
}

const ownerEnv = {
  OPENROUTER_API_KEY: 'owner-free-key',
  OPENROUTER_FREE_MODELS: 'nvidia/nemotron-3-super-120b-a12b:free, nex-agi/nex-n2.5-pro:free',
}

async function send(path: string, body: Record<string, unknown>, headers: Record<string, string> = {}, env = ownerEnv) {
  const request = new Request(`http://example.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const ctx = createExecutionContext()
  const response = await worker.fetch(request, env as never, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe('lib/apiKey', () => {
  const reader = (headers: Record<string, string>, env?: Record<string, string>) => ({
    req: { header: (name: string) => headers[name.toLowerCase()] },
    env,
  })

  it('利用者のキーがあれば user、無ければ環境変数の env、どちらも無ければ undefined', () => {
    expect(resolveApiKey(reader({ 'x-api-key': 'u' }, { OPENROUTER_API_KEY: 'o' }))).toEqual({ key: 'u', source: 'user' })
    expect(resolveApiKey(reader({}, { OPENROUTER_API_KEY: 'o' }))).toEqual({ key: 'o', source: 'env' })
    expect(resolveApiKey(reader({}, { OPENROUTER_API_KEY: '  ' }))).toBeUndefined()
    expect(resolveApiKey(reader({}), 'body')).toEqual({ key: 'body', source: 'user' })
  })

  it(':free で終わるモデルだけを無料とみなす', () => {
    expect(isFreeModel('fish-audio/s2.1-pro-free:free')).toBe(true)
    expect(isFreeModel('fish-audio/s2.1-pro')).toBe(false)
    expect(isFreeModel('fish-audio/s2.1-pro-free')).toBe(false)
  })

  it('所有者キーでは無料モデルだけ、利用者キーでは何でも通す', () => {
    expect(isModelAllowedForKey('fish-audio/s2.1-pro', { key: 'k', source: 'env' })).toBe(false)
    expect(isModelAllowedForKey('fish-audio/s2.1-pro-free:free', { key: 'k', source: 'env' })).toBe(true)
    expect(isModelAllowedForKey('fish-audio/s2.1-pro', { key: 'k', source: 'user' })).toBe(true)
  })

  it('無料 LLM の一覧は空白を除き、無料でないものは捨てる', () => {
    expect(parseFreeModelList(' a/b:free ,c/d, ,e/f:free')).toEqual(['a/b:free', 'e/f:free'])
    expect(parseFreeModelList(undefined)).toEqual([])
  })
})

describe('無料モード: /api/chat', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('利用者キーが無ければ無料 LLM に固定し、リクエストのモデル指定は無視する', async () => {
    const calls = stubUpstream({})
    const response = await send('/api/chat', {
      message: '你好',
      friend: mockFriend,
      hskLevel: 2,
      config: { llm: { model: 'openai/gpt-4o' } },
    })
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].model).toBe('nvidia/nemotron-3-super-120b-a12b:free')
  })

  it('利用者キーがあればそのモデルを使う', async () => {
    const calls = stubUpstream({})
    const response = await send(
      '/api/chat',
      { message: '你好', friend: mockFriend, hskLevel: 2, config: { llm: { model: 'openai/gpt-4o' } } },
      { 'x-api-key': 'user-key' }
    )
    expect(response.status).toBe(200)
    expect(calls[0].model).toBe('openai/gpt-4o')
  })

  it('無料 LLM が未設定なら 402 で案内する', async () => {
    stubUpstream({})
    const response = await send('/api/chat', { message: '你好', friend: mockFriend, hskLevel: 2 }, {}, {
      OPENROUTER_API_KEY: 'owner-free-key',
    } as typeof ownerEnv)
    expect(response.status).toBe(402)
  })

  it('先頭の無料 LLM が混雑していれば次の候補を試す', async () => {
    const calls = stubUpstream({
      chat: (_body, index) => (index === 0 ? new Response('busy', { status: 429 }) : Response.json(chatPayload)),
    })
    const response = await send('/api/chat', { message: '你好', friend: mockFriend, hskLevel: 2 })
    expect(response.status).toBe(200)
    expect(calls.map((call) => call.model)).toEqual([
      'nvidia/nemotron-3-super-120b-a12b:free',
      'nex-agi/nex-n2.5-pro:free',
    ])
  })

  it('全候補が混雑していれば 429 をそのまま返す', async () => {
    stubUpstream({ chat: () => new Response('busy', { status: 429 }) })
    const response = await send('/api/chat', { message: '你好', friend: mockFriend, hskLevel: 2 })
    expect(response.status).toBe(429)
  })

  it('利用者キーの残高切れ(402)はそのまま 402 で返す', async () => {
    const calls = stubUpstream({ chat: () => new Response('insufficient credits', { status: 402 }) })
    const response = await send(
      '/api/chat',
      { message: '你好', friend: mockFriend, hskLevel: 2 },
      { 'x-api-key': 'user-key' }
    )
    expect(response.status).toBe(402)
    expect(calls).toHaveLength(1)
  })
})

describe('無料モード: /api/tts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetSpeechModelCache()
  })

  it('利用者キーが無く有料モデルなら 402 で止め、上流へは送らない', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await send('/api/tts', { text: '你好', model: 'fish-audio/s2.1-pro', voice: 'abc' })
    expect(response.status).toBe(402)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('利用者キーが無くても無料モデルなら通す', async () => {
    stubUpstream({})
    const response = await send('/api/tts', { text: '你好', model: 'fish-audio/s2.1-pro-free:free', voice: 'abc' })
    expect(response.status).toBe(200)
  })

  it('利用者キーがあれば有料モデルも通す', async () => {
    stubUpstream({})
    const response = await send(
      '/api/tts',
      { text: '你好', model: 'fish-audio/s2.1-pro', voice: 'abc' },
      { 'x-api-key': 'user-key' }
    )
    expect(response.status).toBe(200)
  })
})

describe('無料モード: /api/stt', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('利用者キーが無く有料モデルなら 402 で止める', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const response = await send('/api/stt', { audio: 'AAAA', model: 'qwen/qwen3-asr-flash-2026-02-10' })
    expect(response.status).toBe(402)
  })
})
