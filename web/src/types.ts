/**
 * フロントエンド用ドメイン型定義
 * 用語定義書.md および 要件定義書.md に準拠
 */

/**
 * 立ち絵の表情パターン（喜怒哀楽ほか計10種）
 * LLM の返答に付与され、会話内容に合わせて立ち絵を切り替えるために使用する。
 */
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

export function isExpression(value: unknown): value is Expression {
  return typeof value === 'string' && (EXPRESSIONS as readonly string[]).includes(value)
}

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
  /** アイコン画像のパス（立ち絵未設定のカスタム友達向けの後方互換フィールド） */
  avatar?: string
  /** 立ち絵パラメータのID（PORTRAITS のキー）。設定時は avatar より優先される。 */
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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content?: string // user 発話の場合のテキスト
  reply?: BilingualReply // assistant 返答の場合
  expression?: Expression // 返答時の立ち絵の表情
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

export type TtsDebugLanguage = 'zh' | 'ja' | 'mixed'
export type TtsDebugStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'

export interface TtsDebugTiming {
  requestStartedAt: number
  responseHeadersAt?: number
  firstChunkAt?: number
  playbackStartedAt?: number
  responseCompletedAt?: number
  playbackEndedAt?: number
}

export interface TtsDebugRatings {
  pronunciation?: number
  naturalness?: number
  characterConsistency?: number
  jaZhConsistency?: number
}

export interface TtsDebugResult {
  modelId: string
  voiceId?: string
  generationId?: string
  status: TtsDebugStatus
  httpStatus?: number
  contentType?: string
  timing: TtsDebugTiming
  metrics: {
    requestToHeadersMs?: number
    requestToFirstChunkMs?: number
    requestToPlaybackMs?: number
    requestToCompleteMs?: number
    audioDurationMs?: number
    inputCharacterCount: number
    inputUtf8ByteCount: number
    estimatedCostUsd?: number
  }
  /** セッション内だけで使う一時URL。永続化時は除外する。 */
  audioUrl?: string
  audioCacheKey?: string
  errorMessage?: string
  ratings?: TtsDebugRatings
  memo?: string
}

export interface TtsDebugRun {
  id: string
  createdAt: string
  inputText: string
  language: TtsDebugLanguage
  speed: number
  modelIds: string[]
  results: TtsDebugResult[]
}
