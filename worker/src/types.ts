/**
 * ドメイン用語および API 型定義
 * 用語定義書.md および 要件定義書.md に準拠
 */

/** 立ち絵の表情パターン（喜怒哀楽ほか計10種） */
export const EXPRESSIONS = [
  'neutral',
  'smile',
  'joy',
  'laugh',
  'shy',
  'surprised',
  'sad',
  'angry',
  'thinking',
  'wink',
] as const

export type Expression = (typeof EXPRESSIONS)[number]

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
  portraitId?: string
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

/**
 * LLM プロバイダが報告した消費量。
 * 開発者モードでモデルを比較するときの費用・出力量の根拠にする。
 * 返さないプロバイダもあるため、すべて省略可能とする。
 */
export interface LlmUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  /** OpenRouter が算出した実費(USD)。 */
  costUsd?: number
}

export interface ChatResponse {
  reply: BilingualReply
  correction: Correction
  vocabulary: HobbyVocabulary[]
  /** 返答時の Friend の表情（立ち絵切り替え用） */
  expression: Expression
  /** 消費量。本体の会話では使わず、開発者モードの比較でのみ参照する。 */
  usage?: LlmUsage
}
