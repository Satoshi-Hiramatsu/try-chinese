import type { ChatHistoryItem, ChatResponse, Expression, Friend, LlmUsage } from '../types'
import { EXPRESSIONS } from '../types'
import { buildChatSystemPrompt } from './prompt'

export interface CallLLMOptions {
  message: string
  friend: Friend
  hskLevel: number
  history?: ChatHistoryItem[]
  apiKey: string
  model?: string
  apiBaseUrl?: string
}

const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash'
const DEFAULT_API_BASE = 'https://openrouter.ai/api/v1'

/**
 * 出力の上限。
 *
 * ピンインを辞書生成へ移した(T-70)ぶん出力は短くなったが、
 * 途中で切れると JSON 全体が読めなくなり会話が止まる。
 * 課金は実際に使ったトークンのみなので、余裕を持たせておく。
 */
const MAX_OUTPUT_TOKENS = 1500

/**
 * 返答の構造。
 *
 * これまでは「純粋なJSONだけを返せ」とプロンプトで頼み、
 * 前後に付いたコードブロック記法を剥がしてからパースしていた。
 * スキーマで縛れるモデルではその綱渡りが要らなくなる。
 *
 * strict では省略可能な項目を作れないため、
 * 値が無い場合は null を許す形にして required には全て並べる。
 */
const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'object',
      properties: {
        zh: { type: 'string', description: '中国語（簡体字）の返答本文。日本語を混ぜない。' },
        ja: { type: 'string', description: '返答の自然な日本語訳。' },
        hskLevel: { type: 'integer', description: '返答が想定しているHSK級。1〜6。' },
      },
      required: ['zh', 'ja', 'hskLevel'],
      additionalProperties: false,
    },
    correction: {
      type: 'object',
      properties: {
        hasCorrection: { type: 'boolean' },
        original: { type: ['string', 'null'], description: '学習者の元の発話のうち直す部分。' },
        suggested: { type: ['string', 'null'], description: 'より自然な中国語表現。' },
        ja: { type: ['string', 'null'], description: 'なぜそう直すかの日本語の解説。' },
      },
      required: ['hasCorrection', 'original', 'suggested', 'ja'],
      additionalProperties: false,
    },
    vocabulary: {
      type: 'array',
      description: '覚えると役に立つ語を1〜3個。',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          ja: { type: 'string' },
          hskLevel: { type: 'integer' },
        },
        required: ['term', 'ja', 'hskLevel'],
        additionalProperties: false,
      },
    },
    expression: { type: 'string', enum: [...EXPRESSIONS] },
  },
  required: ['reply', 'correction', 'vocabulary', 'expression'],
  additionalProperties: false,
} as const

/** スキーマで縛れないモデル向けの指定。JSONであることだけを求める。 */
const JSON_OBJECT_FORMAT = { type: 'json_object' } as const

const JSON_SCHEMA_FORMAT = {
  type: 'json_schema',
  json_schema: { name: 'shabe_china_reply', strict: true, schema: CHAT_RESPONSE_SCHEMA },
} as const

/**
 * スキーマ指定が拒否されたかどうか。
 *
 * 対応状況はモデルと提供元の組み合わせで決まり、事前には分からない。
 * 拒否されたときだけ緩い指定で1回やり直せるよう、原因を見分ける。
 */
export function isUnsupportedResponseFormat(status: number, detail: string): boolean {
  if (status !== 400 && status !== 404 && status !== 422) return false
  return /json[_\s-]?schema|response_format|structured[_\s-]?output/i.test(detail)
}

/**
 * LLM からの応答テキストから JSON 部分を抽出してパースする
 */
export function parseChatResponse(content: string): ChatResponse {
  let cleaned = content.trim()

  // Markdown code block (```json ... ``` または ``` ... ```) を除去
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '')
    cleaned = cleaned.replace(/\s*```$/, '')
  }
  cleaned = cleaned.trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    throw new Error(`LLMレスポンスのJSONパースに失敗しました: ${err instanceof Error ? err.message : String(err)}\n受領内容: ${cleaned.slice(0, 200)}...`)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLMレスポンスがオブジェクト形式ではありません。')
  }

  const res = parsed as Record<string, unknown>

  // reply の検証
  if (!res.reply || typeof res.reply !== 'object') {
    throw new Error('LLMレスポンスに reply オブジェクトが存在しません。')
  }
  const replyObj = res.reply as Record<string, unknown>
  const reply = {
    zh: String(replyObj.zh || ''),
    ja: String(replyObj.ja || ''),
    pinyin: String(replyObj.pinyin || ''),
    hskLevel: Number(replyObj.hskLevel || 1),
  }

  // correction の検証
  const corrObj = (res.correction && typeof res.correction === 'object') ? (res.correction as Record<string, unknown>) : {}
  const correction = {
    hasCorrection: Boolean(corrObj.hasCorrection),
    original: corrObj.original ? String(corrObj.original) : undefined,
    suggested: corrObj.suggested ? String(corrObj.suggested) : undefined,
    pinyin: corrObj.pinyin ? String(corrObj.pinyin) : undefined,
    ja: corrObj.ja ? String(corrObj.ja) : undefined,
  }

  // vocabulary の検証
  const vocabList: ChatResponse['vocabulary'] = []
  if (Array.isArray(res.vocabulary)) {
    for (const item of res.vocabulary) {
      if (item && typeof item === 'object') {
        const v = item as Record<string, unknown>
        if (v.term) {
          vocabList.push({
            term: String(v.term),
            pinyin: String(v.pinyin || ''),
            ja: String(v.ja || ''),
            hskLevel: v.hskLevel ? Number(v.hskLevel) : undefined,
          })
        }
      }
    }
  }

  // expression の検証（許可された10種以外は neutral にフォールバック）
  const rawExpression = res.expression
  const expression: Expression =
    typeof rawExpression === 'string' && (EXPRESSIONS as readonly string[]).includes(rawExpression)
      ? (rawExpression as Expression)
      : 'neutral'

  return {
    reply,
    correction,
    vocabulary: vocabList,
    expression,
  }
}

/**
 * プロバイダが返した消費量を、モデル比較で使える形に揃える。
 * 項目名も有無もプロバイダで異なるため、取れたものだけを拾う。
 */
export function normalizeUsage(raw: unknown): LlmUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const usage = raw as Record<string, unknown>
  const num = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  const normalized: LlmUsage = {
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    totalTokens: num(usage.total_tokens),
    costUsd: num(usage.cost),
  }
  return Object.values(normalized).some((value) => value !== undefined) ? normalized : undefined
}

/**
 * OpenRouter / OpenAI 互換の Chat Completions API を呼び出す
 */
export async function callChatLLM(options: CallLLMOptions): Promise<ChatResponse> {
  const {
    message,
    friend,
    hskLevel,
    history = [],
    apiKey,
    model = DEFAULT_MODEL,
    apiBaseUrl = DEFAULT_API_BASE,
  } = options

  if (!apiKey) {
    throw new Error('APIキーが指定されていません。')
  }

  const systemPrompt = buildChatSystemPrompt(friend, hskLevel)

  // メッセージ履歴の組み立て
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ]

  for (const item of history) {
    messages.push({
      role: item.role,
      content: item.content,
    })
  }

  messages.push({
    role: 'user',
    content: message,
  })

  const url = `${apiBaseUrl.replace(/\/$/, '')}/chat/completions`

  const request = (responseFormat: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://shabe-china.pages.dev',
        'X-Title': 'ShabeChina',
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: responseFormat,
        temperature: 0.7,
        max_tokens: MAX_OUTPUT_TOKENS,
        // 推論を止める。会話の返答に思考は要らず、走らせると最初の一文字までが遅くなり、
        // 出力上限も推論に食われて JSON が途中で切れる。
        // exclude では推論自体は走るため、effort: 'none' で計算ごと止める。
        reasoning: { effort: 'none' },
        // 実費を応答に含めてもらう。カタログの単価だけではモデル比較の根拠にならない。
        usage: { include: true },
      }),
    })

  let response = await request(JSON_SCHEMA_FORMAT)

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    // スキーマ対応はモデルと提供元の組み合わせで決まり、事前には分からない。
    // 拒否されたときだけ、JSONであることだけを求める指定で1回やり直す。
    if (isUnsupportedResponseFormat(response.status, errorText)) {
      response = await request(JSON_OBJECT_FORMAT)
    }
    if (!response.ok) {
      const detail = response.bodyUsed ? errorText : await response.text().catch(() => errorText)
      throw new Error(`LLMプロバイダへのリクエストに失敗しました (Status: ${response.status}): ${detail.slice(0, 300)}`)
    }
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: unknown
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLMから有効なメッセージ応答が返されませんでした。')
  }

  const parsed = parseChatResponse(content)
  const usage = normalizeUsage(data.usage)
  return usage ? { ...parsed, usage } : parsed
}
