import type { ChatHistoryItem, ChatResponse, Friend } from '../types'
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

const DEFAULT_MODEL = 'google/gemini-2.5-flash'
const DEFAULT_API_BASE = 'https://openrouter.ai/api/v1'

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

  return {
    reply,
    correction,
    vocabulary: vocabList,
  }
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

  const response = await fetch(url, {
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
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`LLMプロバイダへのリクエストに失敗しました (Status: ${response.status}): ${errorText.slice(0, 300)}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLMから有効なメッセージ応答が返されませんでした。')
  }

  return parseChatResponse(content)
}
