import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import worker from '../src'
import { resetSpeechModelCache } from '../src/services/openRouterCatalog'
import {
  DEFAULT_STT_MODEL,
  normalizeAudioFormat,
  normalizeLanguage,
  normalizeTranscription,
} from '../src/routes/stt'

const CATALOG_URL = 'https://openrouter.ai/api/v1/models'
const TRANSCRIPTION_URL = 'https://openrouter.ai/api/v1/audio/transcriptions'

interface CatalogEntry {
  id: string
  name?: string
}

/** カタログ取得と文字起こしをまとめてスタブし、文字起こしのリクエストだけを記録する。 */
function stubOpenRouter(options: {
  catalog?: CatalogEntry[] | 'unavailable'
  transcribe?: (body: Record<string, unknown>) => Response
}) {
  const calls: Record<string, unknown>[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(CATALOG_URL)) {
      if (options.catalog === 'unavailable') return new Response('unavailable', { status: 503 })
      return Response.json({
        data: (options.catalog || []).map((entry) => ({
          pricing: { prompt: '0.000035', completion: '0' },
          name: entry.id,
          ...entry,
        })),
      })
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    calls.push(body)
    const respond = options.transcribe || (() => Response.json({ text: '你好', usage: { seconds: 1.2, cost: 0.000001 } }))
    return respond(body)
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

function sttRequest(body: Record<string, unknown>): Request {
  return new Request('http://example.com/api/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OpenRouter-Key': 'test-key' },
    body: JSON.stringify(body),
  })
}

async function send(request: Request) {
  const ctx = createExecutionContext()
  const response = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe('音声形式の正規化', () => {
  it('未指定なら MediaRecorder の既定である webm を使う', () => {
    expect(normalizeAudioFormat(undefined)).toBe('webm')
    expect(normalizeAudioFormat('')).toBe('webm')
  })

  it('MIMEタイプで渡されても形式名だけを取り出す', () => {
    expect(normalizeAudioFormat('audio/webm;codecs=opus')).toBe('webm')
    expect(normalizeAudioFormat('AUDIO/WAV')).toBe('wav')
  })

  it('対応していない形式は undefined を返す', () => {
    expect(normalizeAudioFormat('aiff')).toBeUndefined()
    expect(normalizeAudioFormat(42)).toBeUndefined()
  })
})

describe('言語指定の正規化', () => {
  it('ISO-639-1 の2文字だけを通す', () => {
    expect(normalizeLanguage('zh')).toBe('zh')
    expect(normalizeLanguage(' JA ')).toBe('ja')
  })

  it('不正な値は自動判定として扱う', () => {
    expect(normalizeLanguage('zh-CN')).toBeUndefined()
    expect(normalizeLanguage('')).toBeUndefined()
    expect(normalizeLanguage(undefined)).toBeUndefined()
  })
})

describe('転写応答の正規化', () => {
  it('text と usage から必要な項目だけを取り出す', () => {
    const result = normalizeTranscription({
      text: '我喜欢看电影',
      language: 'zh',
      duration: 4.2,
      usage: { seconds: 4.2, cost: 0.0000012 },
    })
    expect(result).toEqual({ text: '我喜欢看电影', language: 'zh', durationSeconds: 4.2, costUsd: 0.0000012 })
  })

  it('duration が無ければ usage.seconds で補う', () => {
    expect(normalizeTranscription({ text: 'a', usage: { seconds: 3 } })?.durationSeconds).toBe(3)
  })

  it('text が無い応答は受け付けない', () => {
    expect(normalizeTranscription({ usage: {} })).toBeUndefined()
    expect(normalizeTranscription(null)).toBeUndefined()
  })
})

describe('STT API (/api/stt)', () => {
  beforeEach(() => resetSpeechModelCache())
  afterEach(() => {
    vi.unstubAllGlobals()
    resetSpeechModelCache()
  })

  it('audioが空の場合は400エラーを返す', async () => {
    const response = await send(sttRequest({ audio: '' }))
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain('audio')
  })

  it('対応していない音声形式は400エラーを返す', async () => {
    const response = await send(sttRequest({ audio: 'AAAA', format: 'aiff' }))
    expect(response.status).toBe(400)
  })

  it('APIキーが無い場合は401エラーを返す', async () => {
    const request = new Request('http://example.com/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: 'AAAA' }),
    })
    // .dev.vars の有無に関わらず、キーの無い env で 401 を検証
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, { ...env, OPENROUTER_API_KEY: undefined, OPENAI_API_KEY: undefined }, ctx)
    await waitOnExecutionContext(ctx)
    expect(response.status).toBe(401)
  })

  it('既定モデルで転写し、正規化した結果を返す', async () => {
    const calls = stubOpenRouter({ catalog: [{ id: DEFAULT_STT_MODEL }] })
    const response = await send(sttRequest({ audio: 'AAAA' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      text: '你好',
      durationSeconds: 1.2,
      costUsd: 0.000001,
      model: DEFAULT_STT_MODEL,
    })
    expect(calls[0].model).toBe(DEFAULT_STT_MODEL)
    expect(calls[0].input_audio).toEqual({ data: 'AAAA', format: 'webm' })
  })

  it('language を指定しなければ上流へ送らず自動判定に任せる', async () => {
    const calls = stubOpenRouter({ catalog: [{ id: DEFAULT_STT_MODEL }] })
    await send(sttRequest({ audio: 'AAAA' }))
    expect(calls[0]).not.toHaveProperty('language')
  })

  it('language を指定した場合だけ上流へ渡す', async () => {
    const calls = stubOpenRouter({ catalog: [{ id: DEFAULT_STT_MODEL }] })
    await send(sttRequest({ audio: 'AAAA', language: 'zh' }))
    expect(calls[0].language).toBe('zh')
  })

  it('カタログに無いモデルは400で弾く', async () => {
    stubOpenRouter({ catalog: [{ id: DEFAULT_STT_MODEL }] })
    const response = await send(sttRequest({ audio: 'AAAA', model: 'acme/not-a-real-model' }))
    expect(response.status).toBe(400)
  })

  it('カタログを取得できないときは既知の一覧で判定する', async () => {
    stubOpenRouter({ catalog: 'unavailable' })
    const allowed = await send(sttRequest({ audio: 'AAAA', model: 'openai/whisper-1' }))
    expect(allowed.status).toBe(200)

    resetSpeechModelCache()
    stubOpenRouter({ catalog: 'unavailable' })
    const rejected = await send(sttRequest({ audio: 'AAAA', model: 'acme/unknown' }))
    expect(rejected.status).toBe(400)
  })

  it('上流のエラーは本文を添えてそのままの状態で返す', async () => {
    stubOpenRouter({
      catalog: [{ id: DEFAULT_STT_MODEL }],
      transcribe: () => Response.json({ error: { message: 'bad audio' } }, { status: 422 }),
    })
    const response = await send(sttRequest({ audio: 'AAAA' }))
    expect(response.status).toBe(422)
    expect(((await response.json()) as { error: string }).error).toContain('bad audio')
  })

  it('text を含まない応答は502として扱う', async () => {
    stubOpenRouter({
      catalog: [{ id: DEFAULT_STT_MODEL }],
      transcribe: () => Response.json({ usage: {} }),
    })
    const response = await send(sttRequest({ audio: 'AAAA' }))
    expect(response.status).toBe(502)
  })

  it('モデル一覧を返す', async () => {
    stubOpenRouter({ catalog: [{ id: DEFAULT_STT_MODEL }, { id: 'openai/whisper-1' }] })
    const response = await send(new Request('http://example.com/api/stt/models', {
      headers: { 'X-OpenRouter-Key': 'test-key' },
    }))
    const payload = (await response.json()) as { models: { id: string }[]; stale: boolean }
    expect(payload.stale).toBe(false)
    expect(payload.models.map((model) => model.id)).toContain(DEFAULT_STT_MODEL)
  })

  it('カタログを取得できないときはフォールバック一覧を stale として返す', async () => {
    stubOpenRouter({ catalog: 'unavailable' })
    const response = await send(new Request('http://example.com/api/stt/models', {
      headers: { 'X-OpenRouter-Key': 'test-key' },
    }))
    const payload = (await response.json()) as { models: { id: string }[]; stale: boolean }
    expect(payload.stale).toBe(true)
    expect(payload.models.length).toBeGreaterThan(0)
  })
})
