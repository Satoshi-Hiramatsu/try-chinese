/**
 * フロントエンド用ドメイン型定義
 * 用語定義書.md および 要件定義書.md に準拠
 */

export interface Friend {
  id?: string
  name: string
  avatar: string
  personality: string
  hobbies: string[]
  tone?: string
  initialMessage?: {
    zh: string
    ja: string
    pinyin: string
    vocabulary?: HobbyVocabulary[]
  }
}

export interface BilingualReply {
  zh: string
  ja: string
  pinyin: string
  hskLevel: number
}

export interface Correction {
  hasCorrection: boolean
  original?: string
  suggested?: string
  pinyin?: string
  ja?: string
}

export interface HobbyVocabulary {
  term: string
  pinyin: string
  ja: string
  hskLevel?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content?: string // user 発話の場合のテキスト
  reply?: BilingualReply // assistant 返答の場合
  correction?: Correction // 添削情報
  vocabulary?: HobbyVocabulary[] // 趣味語彙
  timestamp: number
}

export interface AppConfig {
  apiKey?: string
  model?: string
}
