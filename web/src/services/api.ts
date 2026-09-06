import type { Friend, ChatMessage, BilingualReply, Correction, HobbyVocabulary } from '../types'

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

  const data = (await response.json()) as SendMessageResponse
  return data
}
