import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SELF, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from '../src'
import { parseChatResponse } from '../src/lib/llm'
import { buildChatSystemPrompt } from '../src/lib/prompt'
import type { Friend } from '../src/types'

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

    it('完全な中国語返答の徹底（日本語混入禁止）の指示が含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 2)
      expect(prompt).toContain('完全な中国語返答')
      expect(prompt).toContain('100%中国語（簡体字）のみ')
      expect(prompt).toContain('日本語（ひらがな、カタカナ、和製表現）は絶対に混ぜてはいけません')
    })

    it('学習者が日本語で話しかけた場合の2段階対話指示と添削ルールが含まれること', () => {
      const prompt = buildChatSystemPrompt(mockFriend, 2)
      expect(prompt).toContain('2段階対話')
      expect(prompt).toContain('ステップ1（内容への回答）')
      expect(prompt).toContain('ステップ2（中国語表現の案内・促し）')
      expect(prompt).toContain('必ず "hasCorrection": true')
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
