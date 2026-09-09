/**
 * OpenRouter TTSモデルの補足情報（オーバーレイ）。
 *
 * モデル一覧・話者一覧・価格は OpenRouter の `/api/tts/models` から実行時に取得する。
 * ここではAPIが返さない情報（課金単位・対応言語の所感・中国語学習向けの推奨話者）だけを持ち、
 * 未登録のモデルでもカタログ側の情報だけで扱えるようにする。
 */

export type TtsBillingUnit = 'character' | 'utf8-byte' | 'audio-token'

export interface TtsVoicePreset {
  id: string
  label: string
}

export interface TtsModelOverlay {
  /** 課金単位。OpenRouterのAPIは単価だけを返し、単位は返さない。 */
  billingUnit?: TtsBillingUnit
  languages?: readonly string[]
  note?: string
  recommendedUse?: string
  /** 中国語会話に適した話者。カタログに存在するものだけが既定候補になる。 */
  preferredVoices?: readonly string[]
  /** 話者セレクトの先頭に出す推奨プリセット。 */
  voicePresets?: readonly TtsVoicePreset[]
}

const KOKORO_PRESETS: readonly TtsVoicePreset[] = [
  { id: 'zf_xiaoxiao', label: '中国語 女性 xiaoxiao' },
  { id: 'zf_xiaobei', label: '中国語 女性 xiaobei' },
  { id: 'zf_xiaoni', label: '中国語 女性 xiaoni' },
  { id: 'zf_xiaoyi', label: '中国語 女性 xiaoyi' },
  { id: 'zm_yunxi', label: '中国語 男性 yunxi' },
  { id: 'zm_yunjian', label: '中国語 男性 yunjian' },
  { id: 'zm_yunxia', label: '中国語 男性 yunxia' },
  { id: 'zm_yunyang', label: '中国語 男性 yunyang' },
  { id: 'jf_alpha', label: '日本語 女性 alpha' },
  { id: 'jm_kumo', label: '日本語 男性 kumo' },
]

export const TTS_MODEL_OVERLAY: Readonly<Record<string, TtsModelOverlay>> = {
  'hexgrad/kokoro-82m': {
    billingUnit: 'character',
    languages: ['zh', 'ja'],
    note: '軽量で低コスト。中国語・日本語それぞれ専用の話者を持つ。',
    recommendedUse: '既定モデルと短文の使い回し',
    preferredVoices: ['zf_xiaoxiao', 'zm_yunxi'],
    voicePresets: KOKORO_PRESETS,
  },
  'qwen/qwen-audio-3.0-tts-flash': {
    billingUnit: 'character',
    languages: ['zh', 'ja'],
    note: '中国語話者が中心。速度重視の構成。',
    recommendedUse: '低遅延の中国語比較',
    preferredVoices: ['longanhuan_v3.6', 'loongjohn'],
    voicePresets: [
      { id: 'longanhuan_v3.6', label: '中国語 女性 longanhuan' },
      { id: 'loongjohn', label: '中国語 男性 loongjohn' },
    ],
  },
  'qwen/qwen-audio-3.0-tts-plus': {
    billingUnit: 'character',
    languages: ['zh', 'ja'],
    note: 'Flashより品質寄りのQwen構成。',
    recommendedUse: 'Flashとの品質比較',
    preferredVoices: ['longanlingxin', 'longanlufeng'],
    voicePresets: [
      { id: 'longanlingxin', label: '中国語 女性 lingxin' },
      { id: 'longanlufeng', label: '中国語 男性 lufeng' },
    ],
  },
  'fish-audio/s1': {
    billingUnit: 'utf8-byte',
    languages: ['zh', 'ja'],
    note: 'UTF-8バイト課金のため、中国語・日本語は1文字あたりの費用が高くなる。',
    recommendedUse: '感情表現の比較',
  },
  'fish-audio/s2-pro': {
    billingUnit: 'utf8-byte',
    languages: ['zh', 'ja'],
    note: 'UTF-8バイト課金。多話者と自然言語による話し方の指定に対応。',
    recommendedUse: '表現力の比較',
  },
  'fish-audio/s2.1-pro': {
    billingUnit: 'utf8-byte',
    languages: ['zh', 'ja'],
    note: 'UTF-8バイト課金。S2 Proの後継。',
    recommendedUse: '表現力の比較',
  },
  'fish-audio/s2.1-pro-free:free': {
    billingUnit: 'utf8-byte',
    languages: ['zh', 'ja'],
    note: '無料プレビュー。混雑状況で遅延が変わるため速度比較には向かない。',
    recommendedUse: '音質の試聴のみ',
  },
  'google/gemini-3.1-flash-tts-preview': {
    billingUnit: 'audio-token',
    languages: ['zh', 'ja'],
    note: 'mp3を受け付けずPCMのみを返すため、受信後にWAVへ変換して再生する。音声トークン課金のため文字数から費用を確定できない。',
    recommendedUse: '多話者・表現の実験',
    preferredVoices: ['Kore', 'Puck'],
    voicePresets: [
      { id: 'Kore', label: '女性 Kore（落ち着き）' },
      { id: 'Aoede', label: '女性 Aoede（明るい）' },
      { id: 'Leda', label: '女性 Leda（若い）' },
      { id: 'Puck', label: '男性 Puck（軽快）' },
      { id: 'Charon', label: '男性 Charon（低め）' },
      { id: 'Fenrir', label: '男性 Fenrir（力強い）' },
    ],
  },
  'minimax/speech-2.8-turbo': {
    billingUnit: 'character',
    languages: ['zh', 'ja'],
    note: '話者IDは英語名だが多言語に対応する。低遅延をうたう構成。',
    recommendedUse: '低遅延の対話比較',
    preferredVoices: ['English_radiant_girl', 'English_magnetic_voiced_man'],
    voicePresets: [
      { id: 'English_radiant_girl', label: '女性 radiant girl' },
      { id: 'English_Kind-heartedGirl', label: '女性 kind-hearted' },
      { id: 'English_CalmWoman', label: '女性 calm' },
      { id: 'English_magnetic_voiced_man', label: '男性 magnetic' },
      { id: 'English_Gentle-voiced_man', label: '男性 gentle' },
      { id: 'English_DecentYoungMan', label: '男性 young' },
    ],
  },
  'minimax/speech-2.8-hd': {
    billingUnit: 'character',
    languages: ['zh', 'ja'],
    note: 'Turboより品質寄り。単価は高い。',
    recommendedUse: 'Turboとの品質比較',
    preferredVoices: ['English_radiant_girl', 'English_magnetic_voiced_man'],
  },
  'microsoft/mai-voice-2': {
    billingUnit: 'character',
    languages: ['zh', 'ja'],
    note: '話者は4種類のみ。音声クローンは別途承認が必要。',
    recommendedUse: 'Microsoft系の比較',
    preferredVoices: ['en-US-Harper:MAI-Voice-2'],
  },
  'microsoft/mai-voice-2-flash': {
    billingUnit: 'character',
    languages: ['zh', 'ja'],
    note: 'MAI-Voice-2の速度重視版。',
    recommendedUse: '速度比較',
    preferredVoices: ['en-US-Harper:MAI-Voice-2'],
  },
  'x-ai/grok-voice-tts-1.0': {
    billingUnit: 'character',
    languages: ['zh', 'ja'],
    note: '話者は5種類。会話向けの自然さを重視した構成。',
    recommendedUse: '会話調の比較',
  },
  'deepgram/aura-2': {
    billingUnit: 'character',
    languages: ['ja'],
    note: '英語中心で日本語話者も持つが、中国語話者は公開されていない。',
    recommendedUse: '日本語側の読み上げ比較',
    preferredVoices: ['aura-2-ama-ja'],
  },
  'deepgram/flux-tts:free': {
    billingUnit: 'character',
    languages: [],
    note: '英語専用。中国語学習用途には向かない。',
    recommendedUse: '応答速度の基準測定',
  },
  'mistralai/voxtral-mini-tts-2603': {
    billingUnit: 'character',
    languages: [],
    note: '話者IDに感情が含まれる英語中心のモデル。',
    recommendedUse: '感情指定の比較',
  },
  'canopylabs/orpheus-3b-0.1-ft': {
    billingUnit: 'character',
    languages: [],
    note: '英語中心の軽量モデル。',
    recommendedUse: '応答速度の基準測定',
  },
  'sesame/csm-1b': {
    billingUnit: 'character',
    languages: [],
    note: '英語中心の会話音声モデル。',
    recommendedUse: '応答速度の基準測定',
  },
}

/** 未登録モデルの課金単位を推定する。音声トークン課金は文字数から費用を確定できない。 */
export function inferBillingUnit(modelId: string, audioTokenPriceUsd: number): TtsBillingUnit {
  const overlay = TTS_MODEL_OVERLAY[modelId]
  if (overlay?.billingUnit) return overlay.billingUnit
  if (audioTokenPriceUsd > 0) return 'audio-token'
  if (modelId.startsWith('fish-audio/')) return 'utf8-byte'
  return 'character'
}

export function getTtsModelOverlay(modelId: string): TtsModelOverlay | undefined {
  return TTS_MODEL_OVERLAY[modelId]
}
