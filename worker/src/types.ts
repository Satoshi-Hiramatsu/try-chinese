/**
 * ドメイン用語および API 型定義
 * 用語定義書.md および 要件定義書.md に準拠
 */

export interface Voice {
  quality: 'standard' | 'natural' | 'high'
  gender: 'male' | 'female'
  voiceName?: string
  rate?: number
  pitch?: number
}

export interface Friend {
  id?: string
  name: string
  avatar?: string
  personality: string
  hobbies: string[]
  tone?: string
  voice?: Voice
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

export interface ChatHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface AppConfig {
  llm?: {
    provider?: string
    model?: string
    apiKey?: string
  }
}

export interface ChatRequest {
  message: string
  friend: Friend
  hskLevel: number
  history?: ChatHistoryItem[]
  config?: AppConfig
}

export interface ChatResponse {
  reply: BilingualReply
  correction: Correction
  vocabulary: HobbyVocabulary[]
}
