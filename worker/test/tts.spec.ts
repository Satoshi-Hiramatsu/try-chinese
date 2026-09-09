import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import worker from '../src'
import { resetSpeechModelCache } from '../src/services/openRouterCatalog'

const CATALOG_URL = 'https://openrouter.ai/api/v1/models'
const SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech'

interface CatalogEntry {
  id: string
  name?: string
  supported_voices?: string[] | null
  pricing?: { prompt: string; completion: string }
}

/** カタログ取得と音声生成をまとめてスタブし、音声生成のリクエストだけを記録する。 */
function stubOpenRouter(options: {
  catalog?: CatalogEntry[] | 'unavailable'
  speech: (body: Record<string, unknown>, callIndex: number) => Response
}) {
  const speechCalls: Record<string, unknown>[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(CATALOG_URL)) {
      if (options.catalog === 'unavailable') return new Response('unavailable', { status: 503 })
      return Response.json({
        data: (options.catalog || []).map((entry) => ({
          pricing: { prompt: '0.000015', completion: '0' },
          name: entry.id,
          ...entry,
        })),
      })
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    speechCalls.push(body)
    return options.speech(body, speechCalls.length - 1)
  })
  vi.stubGlobal('fetch', fetchMock)
  return speechCalls
}

function ttsRequest(body: Record<string, unknown>): Request {
  return new Request('http://example.com/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-OpenRouter-Key': 'test-key' },
    body: JSON.stringify(body),
  })
}

const audioResponse = () =>
  new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })

describe('TTS API (/api/tts)', () => {
  beforeEach(() => resetSpeechModelCache())
  afterEach(() => {
    vi.unstubAllGlobals()
    resetSpeechModelCache()
  })

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
    stubOpenRouter({
      catalog: [{ id: 'google/gemini-3.1-flash-tts-preview', supported_voices: ['Kore', 'Puck'] }],
      speech: () => new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'audio/wav', 'X-Generation-Id': 'gen-test' },
      }),
    })
    const request = ttsRequest({ text: '你好', model: 'google/gemini-3.1-flash-tts-preview' })
    const response = await worker.fetch(request, env, createExecutionContext())

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Generation-Id')).toBe('gen-test')
    expect(response.headers.get('X-TTS-Model')).toBe('google/gemini-3.1-flash-tts-preview')
    expect(response.headers.get('X-TTS-Voice')).toBe('Kore')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('カタログを取得できない場合も既知のモデル以外は400にする', async () => {
    stubOpenRouter({ catalog: 'unavailable', speech: () => audioResponse() })
    const response = await worker.fetch(ttsRequest({ text: '你好', model: 'unknown/provider-model' }), env, createExecutionContext())

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: string }).error).toContain('許可されていないTTSモデルです')
  })

  it('カタログを取得できなくても既知のモデルなら生成できる', async () => {
    const calls = stubOpenRouter({ catalog: 'unavailable', speech: () => audioResponse() })
    const response = await worker.fetch(ttsRequest({ text: '你好', model: 'hexgrad/kokoro-82m' }), env, createExecutionContext())

    expect(response.status).toBe(200)
    expect(calls[0].model).toBe('hexgrad/kokoro-82m')
  })

  it('カタログに載っていれば未知のプロバイダのモデルも生成できる', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'acme/brand-new-tts', supported_voices: ['nova'] }],
      speech: () => audioResponse(),
    })
    const response = await worker.fetch(ttsRequest({ text: '你好', model: 'acme/brand-new-tts' }), env, createExecutionContext())

    expect(response.status).toBe(200)
    expect(calls[0].model).toBe('acme/brand-new-tts')
    // 話者未指定でもカタログの先頭話者に解決する。
    expect(calls[0].voice).toBe('nova')
    expect(response.headers.get('X-TTS-Voice')).toBe('nova')
  })

  it('Gemini TTS には mp3 ではなく pcm を要求し、speed を送らない', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'google/gemini-3.1-flash-tts-preview', supported_voices: ['Kore', 'Puck'] }],
      speech: () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'Content-Type': 'audio/pcm' } }),
    })
    const response = await worker.fetch(
      ttsRequest({ text: '你好', model: 'google/gemini-3.1-flash-tts-preview', speed: 1.5 }),
      env,
      createExecutionContext()
    )

    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].response_format).toBe('pcm')
    expect(calls[0].speed).toBeUndefined()
    // クライアントがWAV化できるようPCMの諸元を返す。
    expect(response.headers.get('X-TTS-Format')).toBe('pcm')
    expect(response.headers.get('X-TTS-Sample-Rate')).toBe('24000')
    expect(response.headers.get('X-TTS-Bit-Depth')).toBe('16')
    expect(response.headers.get('X-TTS-Channels')).toBe('1')
  })

  it('形式が合わない旨の400なら、指定された形式で1回だけ再試行する', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'acme/pcm-only-tts' }],
      speech: (_body, index) =>
        index === 0
          ? Response.json(
              { error: { message: 'Acme TTS only supports response_format="pcm". Got "mp3".', code: 400 } },
              { status: 400 }
            )
          : new Response(new Uint8Array([9]), { status: 200, headers: { 'Content-Type': 'audio/pcm' } }),
    })
    const response = await worker.fetch(ttsRequest({ text: '你好', model: 'acme/pcm-only-tts' }), env, createExecutionContext())

    expect(response.status).toBe(200)
    expect(calls).toHaveLength(2)
    expect(calls[0].response_format).toBe('mp3')
    expect(calls[1].response_format).toBe('pcm')
    expect(response.headers.get('X-TTS-Format')).toBe('pcm')
  })

  it('形式以外の400は再試行せずそのままエラーを返す', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'hexgrad/kokoro-82m' }],
      speech: () => Response.json({ error: { message: 'invalid voice', code: 400 } }, { status: 400 }),
    })
    const response = await worker.fetch(ttsRequest({ text: '你好', model: 'hexgrad/kokoro-82m' }), env, createExecutionContext())

    expect(response.status).toBe(400)
    expect(calls).toHaveLength(1)
    expect(((await response.json()) as { error: string }).error).toContain('invalid voice')
  })

  it('カタログにない話者は中国語向けの既定話者へ差し替える', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'hexgrad/kokoro-82m', supported_voices: ['af_bella', 'zf_xiaoxiao', 'zm_yunxi'] }],
      speech: () => audioResponse(),
    })
    await worker.fetch(ttsRequest({ text: '你好', model: 'hexgrad/kokoro-82m', voice: 'not-a-voice' }), env, createExecutionContext())
    // 男性を示す指定は男性の既定話者へ寄せる。
    await worker.fetch(ttsRequest({ text: '你好', model: 'hexgrad/kokoro-82m', voice: 'zm_unknown_male' }), env, createExecutionContext())
    // カタログに存在する話者はそのまま使う。
    await worker.fetch(ttsRequest({ text: '你好', model: 'hexgrad/kokoro-82m', voice: 'af_bella' }), env, createExecutionContext())

    expect(calls.map((call) => call.voice)).toEqual(['zf_xiaoxiao', 'zm_yunxi', 'af_bella'])
  })

  it('female や woman を male / man と取り違えずに既定話者を選ぶ', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'minimax/speech-2.8-turbo', supported_voices: ['English_radiant_girl', 'English_magnetic_voiced_man'] }],
      speech: () => audioResponse(),
    })
    // 「Woman」は man を含むが女性なので、女性の既定話者に寄せる。
    await worker.fetch(ttsRequest({ text: '你好', model: 'minimax/speech-2.8-turbo', voice: 'Unknown_CalmWoman' }), env, createExecutionContext())
    await worker.fetch(ttsRequest({ text: '你好', model: 'minimax/speech-2.8-turbo', voice: 'Unknown_female_1' }), env, createExecutionContext())
    await worker.fetch(ttsRequest({ text: '你好', model: 'minimax/speech-2.8-turbo', voice: 'Unknown_DeepVoicedMan' }), env, createExecutionContext())

    expect(calls.map((call) => call.voice)).toEqual([
      'English_radiant_girl',
      'English_radiant_girl',
      'English_magnetic_voiced_man',
    ])
  })

  it('Fish Audio の調整値は本文直下とprovider.optionsへ振り分ける', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'fish-audio/s1', supported_voices: [] }],
      speech: () => audioResponse(),
    })
    await worker.fetch(
      ttsRequest({
        text: '你好',
        model: 'fish-audio/s1',
        voice: 'ref-voice-1',
        tuning: { temperature: 0.1, topP: 0.3, repetitionPenalty: 1.2, volume: -3, latency: 'balanced' },
      }),
      env,
      createExecutionContext()
    )

    // 話者IDを指定しないと生成のたびに音色が変わるため、指定はそのまま通す。
    expect(calls[0].voice).toBe('ref-voice-1')
    expect(calls[0].temperature).toBe(0.1)
    expect(calls[0].top_p).toBe(0.3)
    expect(calls[0].repetition_penalty).toBe(1.2)
    expect(calls[0].provider).toEqual({ options: { 'fish-audio': { prosody: { volume: -3 }, latency: 'balanced' } } })
  })

  it('範囲外の調整値は丸め、対応しない項目は送らない', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'fish-audio/s1', supported_voices: [] }],
      speech: () => audioResponse(),
    })
    await worker.fetch(
      ttsRequest({
        text: '你好',
        model: 'fish-audio/s1',
        tuning: { temperature: 5, volume: -99, latency: 'turbo', style: 'cheerful' },
      }),
      env,
      createExecutionContext()
    )

    expect(calls[0].temperature).toBe(1)
    expect(calls[0].provider).toEqual({ options: { 'fish-audio': { prosody: { volume: -20 } } } })
    // style は Azure 系だけの項目なので Fish には送らない。
    expect(JSON.stringify(calls[0])).not.toContain('cheerful')
  })

  it('MAI-Voice の感情スタイルは azure の provider.options へ送る', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'microsoft/mai-voice-2', supported_voices: ['en-US-Harper:MAI-Voice-2'] }],
      speech: () => audioResponse(),
    })
    await worker.fetch(
      ttsRequest({
        text: '你好',
        model: 'microsoft/mai-voice-2',
        tuning: { style: 'cheerful', styleDegree: 1.4, temperature: 0.2 },
      }),
      env,
      createExecutionContext()
    )

    expect(calls[0].provider).toEqual({ options: { azure: { style: 'cheerful', styledegree: 1.4 } } })
    // temperature は Fish 系だけの項目。
    expect(calls[0].temperature).toBeUndefined()
  })

  it('未知のモデルでも providerOptions はそのまま素通しする', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'minimax/speech-2.8-turbo', supported_voices: ['English_radiant_girl'] }],
      speech: () => audioResponse(),
    })
    await worker.fetch(
      ttsRequest({
        text: '你好',
        model: 'minimax/speech-2.8-turbo',
        tuning: { providerOptions: { emotion: 'happy' } },
      }),
      env,
      createExecutionContext()
    )

    expect(calls[0].provider).toEqual({ options: { minimax: { emotion: 'happy' } } })
  })

  it('調整値がなければ従来どおりのリクエストのままにする', async () => {
    const calls = stubOpenRouter({
      catalog: [{ id: 'hexgrad/kokoro-82m', supported_voices: ['zf_xiaoxiao'] }],
      speech: () => audioResponse(),
    })
    await worker.fetch(ttsRequest({ text: '你好', model: 'hexgrad/kokoro-82m' }), env, createExecutionContext())

    expect(calls[0].provider).toBeUndefined()
    expect(calls[0].temperature).toBeUndefined()
  })
})

describe('TTSモデル一覧 (/api/tts/models)', () => {
  beforeEach(() => resetSpeechModelCache())
  afterEach(() => {
    vi.unstubAllGlobals()
    resetSpeechModelCache()
  })

  it('OpenRouterの音声出力モデルを話者・価格とともに返す', async () => {
    stubOpenRouter({
      catalog: [
        { id: 'minimax/speech-2.8-turbo', name: 'MiniMax: Speech 2.8 Turbo', supported_voices: ['English_radiant_girl'], pricing: { prompt: '0.00006', completion: '0' } },
        { id: 'google/gemini-3.1-flash-tts-preview', supported_voices: ['Kore'], pricing: { prompt: '0.000001', completion: '0.00002' } },
      ],
      speech: () => audioResponse(),
    })
    const response = await worker.fetch(new Request('http://example.com/api/tts/models'), env, createExecutionContext())
    const json = (await response.json()) as {
      models: { id: string; supportedVoices: string[]; pricing: { prompt: number; completion: number } }[]
      stale: boolean
    }

    expect(response.status).toBe(200)
    expect(json.stale).toBe(false)
    expect(json.models).toHaveLength(2)
    expect(json.models[0].supportedVoices).toEqual(['English_radiant_girl'])
    expect(json.models[0].pricing.prompt).toBeCloseTo(0.00006)
    expect(json.models[1].pricing.completion).toBeCloseTo(0.00002)
  })

  it('OpenRouterへ到達できない場合は既知のモデルをstaleとして返す', async () => {
    stubOpenRouter({ catalog: 'unavailable', speech: () => audioResponse() })
    const response = await worker.fetch(new Request('http://example.com/api/tts/models'), env, createExecutionContext())
    const json = (await response.json()) as { models: { id: string }[]; stale: boolean }

    expect(response.status).toBe(200)
    expect(json.stale).toBe(true)
    expect(json.models.map((model) => model.id)).toContain('hexgrad/kokoro-82m')
  })
})
