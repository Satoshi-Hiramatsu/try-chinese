/**
 * フロントエンド用ドメイン型定義
 * 用語定義書.md および 要件定義書.md に準拠
 */

export interface Voice {
  quality: 'standard' | 'natural' | 'high'
  gender: 'male' | 'female'
  voiceName?: string // ブラウザ/Edge音声名 (例: Microsoft Yunxi Online (Natural))
  voiceModel?: string // 話者キャラクターID (例: longanhuan_v3.6, loongjohn, zf_xiaobei, zm_yunxi 等)
  ttsProvider?: 'browser' | 'openrouter'
  ttsModel?: string
  rate?: number
  pitch?: number
}

export interface Friend {
  id?: string
  name: string
  avatar: string
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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content?: string // user 発話の場合のテキスト
  reply?: BilingualReply // assistant 返答の場合
  correction?: Correction // 添削情報
  vocabulary?: HobbyVocabulary[] // 趣味語彙
  timestamp: number
}

export interface VocabularyItem {
  id: string
  term: string
  pinyin: string
  ja: string
  hskLevel?: number
  source?: 'chat_vocabulary' | 'chat_correction' | 'manual'
  friendId?: string
  mastered?: boolean
  notes?: string
  createdAt: number
}

export interface AppConfig {
  apiKey?: string
  model?: string
  ttsModel?: string
  ttsProvider?: 'browser' | 'openrouter'
  autoPlayTts?: boolean
  speechInputLang?: 'zh-CN' | 'ja-JP'
  toneColoring?: boolean
}
