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

/**
 * 1つの音声モデルに対する話者IDと調整値の組。
 *
 * 話者IDはモデルごとに体系が異なるため（Kokoro の zf_xiaoxiao、Fish Audio の reference_id など）、
 * モデルを切り替えても前のモデルで作り込んだ設定を失わないようモデルIDごとに覚えておく。
 */
export interface VoiceModelBinding {
  /** そのモデルでの話者ID。 */
  voiceModel?: string
  /** そのモデルでの声の調整値。 */
  voiceTuning?: TtsVoiceTuning
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
  /** 話者一覧を持たないモデルで声を安定させるための調整値。 */
  voiceTuning?: TtsVoiceTuning
  /**
   * モデルIDごとの話者ID・調整値。選択中モデルの値は voiceModel / voiceTuning にも入る。
   * 既存の保存データには存在しないため、読み出し側は未定義を許容する。
   */
  voiceByModel?: Record<string, VoiceModelBinding>
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
  /** 音声入力を打ち切るまでの無音許容時間(ms) */
  silenceTimeoutMs?: number
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
  schema?: LlmSchemaCheckResult
  completionTokens?: number
  costUsd?: number
  errorMessage?: string
}

export interface LlmDebugResult {
  modelId: string
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

export interface LlmDebugRun {
  id: string
  createdAt: string
  message: string
  friendId?: string
  hskLevel: number
  iterations?: number
  modelIds: string[]
  results: LlmDebugResult[]
}
