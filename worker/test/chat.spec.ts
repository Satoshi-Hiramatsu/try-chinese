import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SELF, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../src'
import { parseChatResponse } from '../src/lib/llm'
import { buildChatSystemPrompt } from '../src/lib/prompt'
import type { Friend } from '../src/types'
import { EXPRESSIONS } from '../src/types'

const mockFriend: Friend = {
  name: '陈美玲',
  personality: '明るく好奇心旺盛な上海の大学生',
  hobbies: ['三国志', '映画鑑賞'],
}

describe('T-01: POST /api/chat 実装テスト', () => {
  describe('buildChatSystemPrompt (T-02: HSK 級別制御)', () => {
    it('HSKレベルとフレンドの情報がプロンプトに含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 2)
      expect(prompt).toContain('陈美玲')
      expect(prompt).toContain('HSK 2 級')
      expect(prompt).toContain('三国志')
      expect(prompt).toContain('バイリンガル返答')
      expect(prompt).toContain('発話添削')
      expect(prompt).toContain('趣味語彙の例外')
    })

    it('HSK 1級の場合、超基本文型と約150語の制御指示が含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 1)
      expect(prompt).toContain('HSK 1 級')
      expect(prompt).toContain('約150語')
      expect(prompt).toContain('基本語順（SVO）')
    })

    it('HSK 4級の場合、把構文や受身文などの複文制御指示が含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 4)
      expect(prompt).toContain('HSK 4 級')
      expect(prompt).toContain('約1200語')
      expect(prompt).toContain('把構文')
    })

    it('HSK 6級の場合、高度な表現や成語の制御指示が含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 6)
      expect(prompt).toContain('HSK 6 級')
      expect(prompt).toContain('5000語以上')
      expect(prompt).toContain('成語・故事')
    })

    it('範囲外のHSKレベルが指定された場合、1〜6の範囲に正規化されること', () => {
      const promptLow = buildChatSystemPrompt(mockFriend, 0)
      expect(promptLow).toContain('HSK 1 級')

      const promptHigh = buildChatSystemPrompt(mockFriend, 99)
      expect(promptHigh).toContain('HSK 6 級')
    })

    it('中国語本文と日中バイリンガル返答の指示が含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 2)
      expect(prompt).toContain('日中バイリンガル返答')
      expect(prompt).toContain('100%中国語（簡体字）のみ')
      expect(prompt).toContain('日本語（ひらがな、カタカナ、和製表現）は絶対に混ぜてはいけません')
      expect(prompt).toContain('你好 は日本語で『こんにちは』という意味だよ')
    })

    it('日本語・中国語の混在入力に対する2段階対話と添削ルールが含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 2)
      expect(prompt).toContain('2段階対話')
      expect(prompt).toContain('ステップ1（内容への回答）')
      expect(prompt).toContain('ステップ2（中国語表現の案内・促し）')
      expect(prompt).toContain('えっと 你好って日本語で什么意思でしたっけ？')
      expect(prompt).toContain('発話全体を誤り扱いしたりしない')
      expect(prompt).toContain('意味を尋ねている中国語')
      expect(prompt).toContain('意図的なコードスイッチング')
      expect(prompt).toContain('自然な学習質問なら、質問したこと自体を添削せず "hasCorrection": false')
      expect(prompt).toContain('"correction.hasCorrection" は false')
    })
  })

  describe('parseChatResponse', () => {
    it('純粋な JSON 応答を正しくパースできること', () => {
      const rawJson = JSON.stringify({
        reply: {
          zh: '你好！很高兴认识你。',
          ja: 'こんにちは！はじめまして。',
          pinyin: 'Nǐ hǎo! Hěn gāoxìng rènshi nǐ.',
          hskLevel: 1,
        },
        correction: {
          hasCorrection: false,
        },
        vocabulary: [
          { term: '高兴', pinyin: 'gāoxìng', ja: 'うれしい', hskLevel: 1 },
        ],
      })

      const parsed = parseChatResponse(rawJson)
      expect(parsed.reply.zh).toBe('你好！很高兴认识你。')
      expect(parsed.reply.pinyin).toBe('Nǐ hǎo! Hěn gāoxìng rènshi nǐ.')
      expect(parsed.correction.hasCorrection).toBe(false)
      expect(parsed.vocabulary).toHaveLength(1)
      expect(parsed.vocabulary[0].term).toBe('高兴')
    })

    it('マークダウンコードブロック付きの JSON を正しくパースできること', () => {
      const markdownJson = `\`\`\`json
{
  "reply": {
    "zh": "我也喜欢三国！",
    "ja": "私も三国志が好きです！",
    "pinyin": "Wǒ yě xǐhuan Sānguó!",
    "hskLevel": 2
  },
  "correction": {
    "hasCorrection": true,
    "original": "私好き三国志",
    "suggested": "我喜欢三国志",
    "pinyin": "Wǒ xǐhuan Sānguózhì",
    "ja": "主語を「我」にし、「喜欢」の後に目的語を置きます。"
  },
  "vocabulary": [
    { "term": "三国", "pinyin": "Sānguó", "ja": "三国志", "hskLevel": 2 }
  ]
}
\`\`\``

      const parsed = parseChatResponse(markdownJson)
      expect(parsed.reply.zh).toBe('我也喜欢三国！')
      expect(parsed.correction.hasCorrection).toBe(true)
      expect(parsed.correction.suggested).toBe('我喜欢三国志')
    })

    it('無効な JSON の場合はエラーを投げること', () => {
      expect(() => parseChatResponse('invalid json')).toThrow(/JSONパースに失敗/)
    })
  })

  describe('T-31: 表情 (Expression) の解決', () => {
    const withExpression = (expression: unknown) =>
      JSON.stringify({
        reply: { zh: '好啊！', ja: 'いいよ！', pinyin: 'Hǎo a!', hskLevel: 2 },
        correction: { hasCorrection: false },
        vocabulary: [],
        expression,
      })

    it('許可された10種の表情がそのまま保持されること', () => {
      for (const expression of EXPRESSIONS) {
        expect(parseChatResponse(withExpression(expression)).expression).toBe(expression)
      }
    })

    it('未知の表情が指定された場合は neutral にフォールバックすること', () => {
      expect(parseChatResponse(withExpression('excited')).expression).toBe('neutral')
      expect(parseChatResponse(withExpression(42)).expression).toBe('neutral')
    })

    it('expression が欠落している場合も neutral になること', () => {
      const raw = JSON.stringify({
        reply: { zh: '你好', ja: 'こんにちは', pinyin: 'Nǐ hǎo', hskLevel: 1 },
        correction: { hasCorrection: false },
        vocabulary: [],
      })
      expect(parseChatResponse(raw).expression).toBe('neutral')
    })

    it('システムプロンプトに10種の表情と指定ルールが含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 2)
      expect(prompt).toContain('表情の指定')
      for (const expression of EXPRESSIONS) {
        expect(prompt).toContain(`"${expression}"`)
      }
    })
  })

  describe('API バリデーション & 認証', () => {
    it('message が欠落している場合は 400 を返すこと', async () => {
      const res = await SELF.fetch('http://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friend: mockFriend,
          hskLevel: 2,
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as { error: string }
      expect(data.error).toContain('message は必須')
    })

    it('friend が欠落している場合は 400 を返すこと', async () => {
      const res = await SELF.fetch('http://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '你好',
          hskLevel: 2,
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as { error: string }
      expect(data.error).toContain('friend')
    })

    it('hskLevel が範囲外の場合は 400 を返すこと', async () => {
      const res = await SELF.fetch('http://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '你好',
          friend: mockFriend,
          hskLevel: 7,
        }),
      })

      expect(res.status).toBe(400)
      const data = (await res.json()) as { error: string }
      expect(data.error).toContain('hskLevel')
    })

    it('APIキーが存在しない場合は 401 を返すこと', async () => {
      const request = new Request('http://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '你好',
          friend: mockFriend,
          hskLevel: 2,
        }),
      })

      // .dev.vars の有無に関わらず、空の env で 401 を検証
      const ctx = createExecutionContext()
      const res = await worker.fetch(request, {} as unknown as Parameters<typeof worker.fetch>[1], ctx)
      await waitOnExecutionContext(ctx)

      expect(res.status).toBe(401)
      const data = (await res.json()) as { error: string }
      expect(data.error).toContain('APIキー')
    })
  })

  describe('POST /api/chat 正常系モック統合テスト', () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
      const mockLlmResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: {
                  zh: '你好！我也喜欢三国演义。',
                  ja: 'こんにちは！私も三国志演義が好きです。',
                  pinyin: 'Nǐ hǎo! Wǒ yě xǐhuan Sānguó yǎnyì.',
                  hskLevel: 2,
                },
                correction: {
                  hasCorrection: true,
                  original: '三国好き',
                  suggested: '我喜欢三国演义',
                  pinyin: 'Wǒ xǐhuan Sānguó yǎnyì',
                  ja: '主語「我」を補うと自然な文になります。',
                },
                vocabulary: [
                  {
                    term: '三国演义',
                    pinyin: 'Sānguó yǎnyì',
                    ja: '三国志演義',
                    hskLevel: 4,
                  },
                ],
              }),
            },
          },
        ],
      }

      globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
        const urlStr = url.toString()
        if (urlStr.includes('openrouter.ai') || urlStr.includes('chat/completions')) {
          return new Response(JSON.stringify(mockLlmResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return originalFetch(url)
      })
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('有効なキーとパラメータを送信した場合、200 OK と構造化 JSON を返すこと', async () => {
      const res = await SELF.fetch('http://example.com/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-openrouter-key',
        },
        body: JSON.stringify({
          message: '三国好き',
          friend: mockFriend,
          hskLevel: 2,
        }),
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        reply: { zh: string; ja: string; pinyin: string; hskLevel: number }
        correction: { hasCorrection: boolean; suggested?: string; ja?: string }
        vocabulary: Array<{ term: string; pinyin: string; ja: string }>
      }

      expect(data.reply.zh).toBe('你好！我也喜欢三国演义。')
      expect(data.reply.pinyin).toBe('Nǐ hǎo! Wǒ yě xǐhuan Sānguó yǎnyì.')
      expect(data.correction.hasCorrection).toBe(true)
      expect(data.correction.suggested).toBe('我喜欢三国演义')
      expect(data.vocabulary).toHaveLength(1)
      expect(data.vocabulary[0].term).toBe('三国演义')
    })
  })
})

describe('T-75: DeepSeek 移行と構造化出力', () => {
  const okPayload = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            reply: { zh: '我也很喜欢。', ja: '私も好きです。', hskLevel: 2 },
            correction: { hasCorrection: false, original: null, suggested: null, ja: null },
            vocabulary: [{ term: '电影', ja: '映画', hskLevel: 1 }],
            expression: 'smile',
          }),
        },
      },
    ],
    usage: { prompt_tokens: 1200, completion_tokens: 90, total_tokens: 1290, cost: 0.00012 },
  }

  const chatRequest = (body: Record<string, unknown> = {}) =>
    new Request('http://example.com/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' },
      body: JSON.stringify({ message: '你好', friend: mockFriend, hskLevel: 2, ...body }),
    })

  const send = async (request: Request) => {
    const ctx = createExecutionContext()
    const response = await worker.fetch(request, {} as never, ctx)
    await waitOnExecutionContext(ctx)
    return response
  }

  afterEach(() => vi.unstubAllGlobals())

  it('推論を止め、スキーマで縛って呼び出す', async () => {
    const calls: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json(okPayload)
    }))

    const response = await send(chatRequest())
    expect(response.status).toBe(200)

    // 推論が走ると最初の一文字までが遅くなり、出力上限も食われる。
    expect(calls[0].reasoning).toEqual({ effort: 'none' })
    const format = calls[0].response_format as { type: string; json_schema?: { strict: boolean } }
    expect(format.type).toBe('json_schema')
    expect(format.json_schema?.strict).toBe(true)
  })

  it('モデル未指定なら DeepSeek V4.1 Flash を使う', async () => {
    const calls: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json(okPayload)
    }))

    await send(chatRequest())
    expect(calls[0].model).toBe('deepseek/deepseek-v4.1-flash')
  })

  it('スキーマ指定を拒否されたらJSON指定で1回だけやり直す', async () => {
    const formats: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      formats.push((body.response_format as { type: string }).type)
      if (formats.length === 1) {
        return Response.json({ error: { message: 'response_format json_schema is not supported' } }, { status: 400 })
      }
      return Response.json(okPayload)
    }))

    const response = await send(chatRequest())
    expect(response.status).toBe(200)
    expect(formats).toEqual(['json_schema', 'json_object'])
  })

  it('スキーマと無関係なエラーではやり直さない', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: { message: 'insufficient credits' } }, { status: 402 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await send(chatRequest())
    // 残高切れ(402)は画面が無料モードへ切り替える合図なので、番号をそのまま返す
    expect(response.status).toBe(402)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('消費量を応答に添える', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(okPayload)))
    const response = await send(chatRequest())
    const payload = (await response.json()) as { usage?: { completionTokens?: number; costUsd?: number } }
    expect(payload.usage?.completionTokens).toBe(90)
    expect(payload.usage?.costUsd).toBe(0.00012)
  })

  it('ピンインを求めないプロンプトになっている', () => {
    const prompt = buildChatSystemPrompt(mockFriend, 2)
    expect(prompt).toContain('ピンインは出力しないでください')
    expect(prompt).not.toContain('"pinyin"')
  })
})

describe('T-77: クリティカルパス分離', () => {
  const replyContent = JSON.stringify({
    reply: { zh: '我也很喜欢。', speech: '我也很喜欢。', ja: '私も好きです。', hskLevel: 2 },
    expression: 'smile',
  })
  const supportContent = JSON.stringify({
    correction: { hasCorrection: true, original: '我很喜欢电影', suggested: '我很喜欢看电影', ja: '看を足すと自然です' },
    vocabulary: [{ term: '电影', ja: '映画', hskLevel: 1 }],
  })

  const send = async (part?: string) => {
    const ctx = createExecutionContext()
    const response = await worker.fetch(
      new Request('http://example.com/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-key' },
        body: JSON.stringify({ message: '我很喜欢电影', friend: mockFriend, hskLevel: 2, ...(part ? { part } : {}) }),
      }),
      {} as never,
      ctx
    )
    await waitOnExecutionContext(ctx)
    return response
  }

  const stub = (content: string) => {
    const calls: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? '{}')))
      return Response.json({ choices: [{ message: { content } }] })
    }))
    return calls
  }

  afterEach(() => vi.unstubAllGlobals())

  it('reply の呼び出しは返答と表情だけを求める', async () => {
    const calls = stub(replyContent)
    const response = await send('reply')
    expect(response.status).toBe(200)

    const schema = (calls[0].response_format as { json_schema: { schema: { required: string[] } } }).json_schema.schema
    expect(schema.required).toEqual(['reply', 'expression'])
  })

  it('support の呼び出しは添削と語彙だけを求める', async () => {
    const calls = stub(supportContent)
    const response = await send('support')
    expect(response.status).toBe(200)

    const schema = (calls[0].response_format as { json_schema: { schema: { required: string[] } } }).json_schema.schema
    expect(schema.required).toEqual(['correction', 'vocabulary'])

    const payload = (await response.json()) as { correction: { hasCorrection: boolean }; vocabulary: unknown[] }
    expect(payload.correction.hasCorrection).toBe(true)
    expect(payload.vocabulary).toHaveLength(1)
  })

  it('返答が無くても support の応答はエラーにしない', async () => {
    // 添削だけを作らせた回に reply が無いのは当然で、失敗ではない。
    stub(supportContent)
    const response = await send('support')
    expect(response.status).toBe(200)
  })

  it('部位を指定しない従来の呼び出しは全部を1回で作る', async () => {
    const calls = stub(JSON.stringify({
      reply: { zh: '你好', speech: '你好', ja: 'こんにちは', hskLevel: 1 },
      correction: { hasCorrection: false },
      vocabulary: [],
      expression: 'smile',
    }))
    const response = await send()
    expect(response.status).toBe(200)

    const schema = (calls[0].response_format as { json_schema: { schema: { required: string[] } } }).json_schema.schema
    expect(schema.required).toEqual(['reply', 'correction', 'vocabulary', 'expression'])
  })

  it('基本プロンプトは部位で変えず、指示は別メッセージにする', async () => {
    // 先頭が一字一句同じでなければプロンプトキャッシュが効かない。
    const replyCalls = stub(replyContent)
    await send('reply')
    const base = (replyCalls[0].messages as { role: string; content: string }[])[0]

    vi.unstubAllGlobals()
    const supportCalls = stub(supportContent)
    await send('support')
    const supportMessages = supportCalls[0].messages as { role: string; content: string }[]

    expect(supportMessages[0].content).toBe(base.content)
    expect(supportMessages[1].role).toBe('system')
    expect(supportMessages[1].content).toContain('correction')
  })
})
