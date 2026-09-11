import type { Friend, ChatMessage, BilingualReply, Correction, Expression, HobbyVocabulary } from '../types'
import { resolveExpression } from './expression'
import { fillPinyin } from './pinyin'

export interface SendMessageOptions {
  message: string
  friend: Friend
  hskLevel: number
  history: ChatMessage[]
  apiKey?: string
  model?: string
}

export interface SendMessageResponse {
  reply: BilingualReply
  correction: Correction
  vocabulary: HobbyVocabulary[]
  /** 立ち絵の表情。API が返さない場合は返答テキストから推定する。 */
  expression: Expression
}

/**
 * /api/chat にメッセージを送信し、構造化返答を取得する
 */
export async function sendMessageToChatApi(options: SendMessageOptions): Promise<SendMessageResponse> {
  const { message, friend, hskLevel, history, apiKey, model } = options

  // 直近6件程度の履歴をフォーマット
  const recentHistory = history
    .slice(-6)
    .map((item) => {
      if (item.role === 'user') {
        return { role: 'user' as const, content: item.content || '' }
      } else {
        return { role: 'assistant' as const, content: item.reply?.zh || '' }
      }
    })
    .filter((item) => item.content.trim() !== '')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers['x-api-key'] = apiKey
  }

  const payload = {
    message,
    friend,
    hskLevel,
    history: recentHistory,
    config: (apiKey || model)
      ? {
          llm: {
            apiKey: apiKey || undefined,
            model: model || undefined,
          },
        }
      : undefined,
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string }
    const errorMsg = errorData.error || `リクエストエラー (ステータス: ${response.status})`
    throw new Error(errorMsg)
  }

  const data = (await response.json()) as Omit<SendMessageResponse, 'expression'> & {
    expression?: unknown
  }

  // ピンインは辞書で作る。LLM に作らせると多音字が揺れるうえ、
  // 出力トークンの3分の1を占めて返答そのものを待たせていた。
  // 辞書は読み込み済みなので、3経路をまとめて解決しても待ち時間は増えない。
  const [replyPinyin, correctionPinyin, vocabularyPinyin] = await Promise.all([
    fillPinyin(data.reply?.zh || '', data.reply?.pinyin),
    fillPinyin(data.correction?.suggested || '', data.correction?.pinyin),
    Promise.all((data.vocabulary || []).map((item) => fillPinyin(item.term, item.pinyin))),
  ])

  return {
    ...data,
    reply: { ...data.reply, pinyin: replyPinyin },
    correction: { ...data.correction, pinyin: correctionPinyin },
    vocabulary: (data.vocabulary || []).map((item, index) => ({
      ...item,
      pinyin: vocabularyPinyin[index],
    })),
    expression: resolveExpression(data.expression, data.reply?.zh || '', data.reply?.ja || ''),
  }
}
