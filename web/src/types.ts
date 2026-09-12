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

/**
 * 話者プリセットを持たないモデル向けの声の作り込み設定。
 *
 * Fish Audio のように話者を指定しないと生成ごとに音色が変わるモデルがあるため、
 * 揺らぎの抑制（temperature / topP）や話し方の指定をモデル横断の形で保持する。
 * どの項目が実際に効くかはモデルごとに異なり、data/ttsVoiceTuning.ts が対応表を持つ。
 */
export interface TtsVoiceTuning {
  /** 生成の揺らぎ。低いほど毎回の音色・抑揚が揃う。 */
  temperature?: number
  /** 候補語彙の広さ。低いほど無難で安定した読み上げになる。 */
  topP?: number
  /** 同じ音の繰り返しを抑える強さ。 */
  repetitionPenalty?: number
  /** 音量調整(dB)。 */
  volume?: number
  /** 遅延と品質のどちらを優先するか。 */
  latency?: 'normal' | 'balanced' | 'low'
  /** 話し方の自然言語指定。 */
  instructions?: string
  /** 感情スタイル名と強さ。 */
  style?: string
  styleDegree?: number
  /** 上級者向け。provider.options へそのまま渡す値。 */
  providerOptions?: Record<string, unknown>
}

/** 声の高さ（再生側で作る）の下限・上限・標準値。 */
export const MIN_VOICE_PITCH = 0.85
export const MAX_VOICE_PITCH = 1.2
export const DEFAULT_VOICE_PITCH = 1.0

/**
 * 友達の声。Fish Audio S2.1 Pro（OpenRouter 経由）専用。
 *
 * 話者は voiceModel（Fish の reference_id）で決まり、指定しないと生成のたびに声が変わる。
 * 利用者が触れるのは pitch だけで、それ以外は開発者モードで作り込む。
 */
export interface Voice {
  gender: 'male' | 'female'
  /** Fish Audio の話者ID (reference_id)。空なら未設定で、読み上げはエラーになる。 */
  voiceModel: string
  /** 話す速さ。Fish の speed にそのまま渡す。 */
  rate?: number
  /** 声の高さ。MIN_VOICE_PITCH〜MAX_VOICE_PITCH。再生速度で音程を変え、speed で速さを打ち消して作る。 */
  pitch?: number
  /** 話者IDだけでは揃わない揺らぎを抑える調整値。 */
  voiceTuning?: TtsVoiceTuning
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
  /** 会話内容へ反映する、画面上のプロフィールとは分離された開発者向け設定。 */
  conversationPolicy?: FriendConversationPolicy
  voice?: Voice
  initialMessage?: {
    zh: string
    ja: string
    pinyin: string
    vocabulary?: HobbyVocabulary[]
  }
}

export type HobbyTopicInitiative = 'minimal' | 'contextual' | 'proactive'
export type MatureTopicComfort = 'avoid' | 'medical' | 'candid' | 'open'

export interface FriendConversationPolicy {
  /** Friend 側から趣味の話へ持っていく強さ。 */
  hobbyTopicInitiative: HobbyTopicInitiative
  /** 成人向けの冗談・相談・話題に対する会話上の許容範囲。 */
  matureTopicComfort: MatureTopicComfort
  /** 利用者には表示せず、人物の振る舞いにだけ使う補足。 */
  privateNotes?: string
}

export interface BilingualReply {
  zh: string
  ja: string
  pinyin: string
  hskLevel: number
  /**
   * 読み上げ専用の中国語。画面には出さない。
   * zh に感情マーカーと漢数字化を施したもので、
   * zh をそのまま読ませると算用数字が一桁ずつ読まれることがあるため分ける。
   */
  speech?: string
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

export type SampleReplyStyle = 'simple' | 'natural' | 'expand'

/** Friend の直前の返答に対して、学習者がそのまま発話できる中国語例。 */
export interface SampleReply {
  style: SampleReplyStyle
  zh: string
  pinyin: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content?: string // user 発話の場合のテキスト
  reply?: BilingualReply // assistant 返答の場合
  expression?: Expression // 返答時の立ち絵の表情
  correction?: Correction // 添削情報
  vocabulary?: HobbyVocabulary[] // 趣味語彙
  sampleReplies?: SampleReply[] // 相手へのサンプル回答（シャドーイング用）
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
  autoPlayTts?: boolean
  speechInputLang?: 'zh-CN' | 'ja-JP'
  /** 音声入力を打ち切るまでの無音許容時間(ms) */
  silenceTimeoutMs?: number
  toneColoring?: boolean
  sampleReplyMode?: boolean
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

/** 1回分の生成の計測値。連続生成の1回目・2回目…をそれぞれ保持する。 */
export interface TtsDebugAttempt {
  /** 1始まりの試行番号。 */
  index: number
  status: TtsDebugStatus
  httpStatus?: number
  contentType?: string
  generationId?: string
  /** 実際に使われた応答形式（mp3 / pcm など）。 */
  responseFormat?: string
  timing: TtsDebugTiming
  metrics: {
    requestToHeadersMs?: number
    requestToFirstChunkMs?: number
    requestToPlaybackMs?: number
    requestToCompleteMs?: number
    audioDurationMs?: number
  }
  /** セッション内だけで使う一時URL。永続化時は除外する。 */
  audioUrl?: string
  errorMessage?: string
}

export interface TtsDebugResult {
  modelId: string
  voiceId?: string
  /** 実行時に適用した声の調整値。比較のため結果と一緒に残す。 */
  tuning?: TtsVoiceTuning
  generationId?: string
  status: TtsDebugStatus
  httpStatus?: number
  contentType?: string
  responseFormat?: string
  /** 1回目の試行のタイミング。既存の履歴との互換のため残す。 */
  timing: TtsDebugTiming
  metrics: {
    /** 以下4つは1回目の試行の値。 */
    requestToHeadersMs?: number
    requestToFirstChunkMs?: number
    requestToPlaybackMs?: number
    requestToCompleteMs?: number
    audioDurationMs?: number
    inputCharacterCount: number
    inputUtf8ByteCount: number
    estimatedCostUsd?: number
    /** 連続生成の実行回数と、成功した試行だけの平均値。 */
    attemptCount?: number
    successCount?: number
    averageRequestToHeadersMs?: number
    averageRequestToFirstChunkMs?: number
    averageRequestToCompleteMs?: number
    /** 2回目以降だけの平均。ウォームアップの影響を除いて比較するために使う。 */
    warmAverageRequestToFirstChunkMs?: number
  }
  /** 連続生成の各回。1回だけの実行でも1件入る。 */
  attempts?: TtsDebugAttempt[]
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
  /** モデルごとに1回の実行で行った連続生成の回数。 */
  iterations?: number
  /** モデルIDごとに指定した話者。 */
  voiceIds?: Record<string, string>
  /** モデルIDごとに指定した声の調整値。 */
  tunings?: Record<string, TtsVoiceTuning>
  results: TtsDebugResult[]
}

/** 1回分の文字起こしの計測値。 */
export interface SttDebugAttempt {
  index: number
  status: TtsDebugStatus
  httpStatus?: number
  timing: TtsDebugTiming
  metrics: {
    requestToHeadersMs?: number
    requestToFirstChunkMs?: number
    requestToCompleteMs?: number
  }
  /** 転写されたテキスト。 */
  text?: string
  /** 上流が自動判定した言語。手動トグルを廃止できるかの判断材料にする。 */
  detectedLanguage?: string
  audioDurationSeconds?: number
  /** 上流が返した実費。カタログは単価だけで課金単位を返さないため、こちらを正とする。 */
  costUsd?: number
  errorMessage?: string
}

export interface SttDebugResult {
  modelId: string
  status: TtsDebugStatus
  httpStatus?: number
  text?: string
  detectedLanguage?: string
  timing: TtsDebugTiming
  metrics: {
    requestToCompleteMs?: number
    audioDurationSeconds?: number
    costUsd?: number
    /** 文字誤り率。正解テキストが未入力なら undefined。 */
    characterErrorRate?: number
    attemptCount?: number
    successCount?: number
    averageRequestToHeadersMs?: number
    averageRequestToFirstChunkMs?: number
    averageRequestToCompleteMs?: number
    warmAverageRequestToFirstChunkMs?: number
  }
  attempts?: SttDebugAttempt[]
  errorMessage?: string
  memo?: string
}

export interface SttDebugRun {
  id: string
  createdAt: string
  /** 比較の基準にした正解テキスト。 */
  referenceText: string
  /** 上流へ指定した言語。未指定は自動判定。 */
  language?: string
  audioDurationMs?: number
  iterations?: number
  modelIds: string[]
  results: SttDebugResult[]
}

/** LLM が報告した消費量。開発者モードの比較でのみ使う。 */
export interface LlmUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsd?: number
}

/** 返答が守るべき約束を満たしているかの検査結果。 */
export interface LlmSchemaCheckResult {
  hasRequiredFields: boolean
  zhIsChineseOnly: boolean
  expressionIsValid: boolean
}

export type LlmTopicLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'P4'

export type LlmReplyClassification = 'refuse' | 'deflect' | 'comply-soft' | 'comply' | 'broken'

/** 1回分の会話生成の計測値。 */
export interface LlmDebugAttempt {
  index: number
  status: TtsDebugStatus
  httpStatus?: number
  timing: TtsDebugTiming
  metrics: {
    requestToHeadersMs?: number
    requestToFirstChunkMs?: number
    requestToCompleteMs?: number
  }
  zh?: string
  ja?: string
  pinyin?: string
  expression?: string
  hasCorrection?: boolean
  vocabularyCount?: number
  correction?: Correction
  vocabulary?: HobbyVocabulary[]
  schema?: LlmSchemaCheckResult
  autoClassification?: LlmReplyClassification
  manualClassification?: LlmReplyClassification
  completionTokens?: number
  costUsd?: number
  errorMessage?: string
}

export interface LlmDebugResult {
  modelId: string
  friendId: string
  friendName: string
  status: TtsDebugStatus
  httpStatus?: number
  zh?: string
  ja?: string
  pinyin?: string
  expression?: string
  hasCorrection?: boolean
  vocabularyCount?: number
  schema?: LlmSchemaCheckResult
  timing: TtsDebugTiming
  metrics: {
    requestToCompleteMs?: number
    completionTokens?: number
    costUsd?: number
    attemptCount?: number
    successCount?: number
    averageRequestToHeadersMs?: number
    averageRequestToFirstChunkMs?: number
    averageRequestToCompleteMs?: number
    warmAverageRequestToFirstChunkMs?: number
  }
  attempts?: LlmDebugAttempt[]
  errorMessage?: string
}

/** IndexedDBへ保存するLLM試行。入力・回答本文を意図的に持たない。 */
export interface LlmDebugStoredAttempt {
  index: number
  status: TtsDebugStatus
  httpStatus?: number
  responseLength?: number
  requestToCompleteMs?: number
  completionTokens?: number
  costUsd?: number
  schema?: LlmSchemaCheckResult
  autoClassification?: LlmReplyClassification
  manualClassification?: LlmReplyClassification
}

/** IndexedDBへ保存するFriend×モデル単位の集計。 */
export interface LlmDebugStoredResult {
  modelId: string
  friendId: string
  friendName: string
  status: TtsDebugStatus
  attempts: LlmDebugStoredAttempt[]
}

export interface LlmDebugRun {
  id: string
  createdAt: string
  topicLevel: LlmTopicLevel
  friendIds: string[]
  hskLevel: number
  iterations?: number
  modelIds: string[]
  results: LlmDebugStoredResult[]
}
