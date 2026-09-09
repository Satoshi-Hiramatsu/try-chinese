/**
 * OpenRouterで利用できるTTSモデルの比較データ。
 *
 * 料金・提供状況・レイテンシは変動するため、実行時の請求計算や
 * モデルの利用可否判定には使用せず、音声テストモードの候補一覧と
 * 設定画面の比較表示に使用する。
 */

export type TtsAvailability = 'available' | 'free-preview' | 'preview'
export type TtsLatencyClass = 'very-fast' | 'fast' | 'unknown'
export type TtsBillingUnit = 'character' | 'utf8-byte' | 'audio-token'

export interface OpenRouterTtsModel {
  id: string
  displayName: string
  provider: string
  availability: TtsAvailability
  languages: string[]
  voiceCount?: string
  voiceFeatures: string[]
  billingUnit: TtsBillingUnit
  priceUsdPerMillionUnit?: number
  priceNote: string
  latencyClass: TtsLatencyClass
  latencyNote: string
  streaming: 'supported' | 'unknown'
  responseNote: string
  supportsVoiceClone: boolean
  supportsStyleControl: boolean
  recommendedUse: string
  sourceUrl: string
  defaultVoice?: string
  supportedVoices?: readonly string[]
  supportsSpeed: boolean
}

/**
 * 2026年9月に調査したOpenRouter TTS候補。
 * priceUsdPerMillionUnit は各モデルのbillingUnit単位での価格。
 */
export const OPENROUTER_TTS_MODELS: readonly OpenRouterTtsModel[] = [
  {
    id: 'hexgrad/kokoro-82m',
    displayName: 'Kokoro 82M',
    provider: 'hexgrad',
    availability: 'available',
    languages: ['ja', 'zh'],
    voiceCount: '54 preset voices',
    voiceFeatures: ['language-specific voices', 'gender presets'],
    billingUnit: 'character',
    priceUsdPerMillionUnit: 0.62,
    priceNote: '$0.62 / 1M characters',
    latencyClass: 'very-fast',
    latencyNote: 'lightweight model; provider latency varies',
    streaming: 'unknown',
    responseNote: 'best low-cost baseline for short utterances',
    supportsVoiceClone: false,
    supportsStyleControl: false,
    recommendedUse: 'current default and cached short replies',
    sourceUrl: 'https://openrouter.ai/hexgrad/kokoro-82m/providers',
    defaultVoice: 'zf_xiaoxiao',
    supportedVoices: ['zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang'],
    supportsSpeed: false,
  },
  {
    id: 'fish-audio/s2.1-pro-free:free',
    displayName: 'Fish Audio S2.1 Pro Free',
    provider: 'fish-audio',
    availability: 'free-preview',
    languages: ['ja', 'zh'],
    voiceFeatures: ['emotion tags', 'natural-language style control'],
    billingUnit: 'character',
    priceUsdPerMillionUnit: 0,
    priceNote: 'free preview; no production availability guarantee',
    latencyClass: 'unknown',
    latencyNote: 'free route is load-dependent',
    streaming: 'supported',
    responseNote: 'use for comparative testing only',
    supportsVoiceClone: true,
    supportsStyleControl: true,
    recommendedUse: 'debug mode and quality audition',
    sourceUrl: 'https://openrouter.ai/fish-audio/s2.1-pro-free:free',
    supportsSpeed: false,
  },
  {
    id: 'fish-audio/s2-pro',
    displayName: 'Fish Audio S2 Pro',
    provider: 'fish-audio',
    availability: 'available',
    languages: ['ja', 'zh'],
    voiceFeatures: ['emotion tags', 'natural-language style control', 'multi-speaker'],
    billingUnit: 'utf8-byte',
    priceUsdPerMillionUnit: 15,
    priceNote: '$15 / 1M UTF-8 bytes; CJK text costs more per character',
    latencyClass: 'fast',
    latencyNote: 'OpenRouter P50 latency was about 0.48s during research',
    streaming: 'supported',
    responseNote: 'strong expressive output; measure CJK byte billing',
    supportsVoiceClone: true,
    supportsStyleControl: true,
    recommendedUse: 'expressive voice comparison',
    sourceUrl: 'https://openrouter.ai/fish-audio/s2-pro',
    supportsSpeed: false,
  },
  {
    id: 'qwen/qwen-audio-3.0-tts-flash',
    displayName: 'Qwen-Audio-3.0-TTS Flash',
    provider: 'qwen',
    availability: 'available',
    languages: ['ja', 'zh'],
    voiceFeatures: ['preset voices', 'style control'],
    billingUnit: 'character',
    priceUsdPerMillionUnit: 15,
    priceNote: '$15 / 1M characters',
    latencyClass: 'fast',
    latencyNote: 'OpenRouter latency was not published in the research snapshot',
    streaming: 'supported',
    responseNote: 'test separately from self-hosted Qwen3-TTS',
    supportsVoiceClone: false,
    supportsStyleControl: true,
    recommendedUse: 'hosted Qwen comparison',
    sourceUrl: 'https://openrouter.ai/qwen/qwen-audio-3.0-tts-flash',
    defaultVoice: 'longanhuan_v3.6',
    supportedVoices: ['loongjohn', 'longanhuan_v3.6'],
    supportsSpeed: false,
  },
  {
    id: 'qwen/qwen-audio-3.0-tts-plus',
    displayName: 'Qwen-Audio-3.0-TTS Plus',
    provider: 'qwen',
    availability: 'available',
    languages: ['ja', 'zh'],
    voiceFeatures: ['preset voices', 'style control'],
    billingUnit: 'character',
    priceUsdPerMillionUnit: 20,
    priceNote: '$20 / 1M characters',
    latencyClass: 'unknown',
    latencyNote: 'OpenRouter latency was not published in the research snapshot',
    streaming: 'supported',
    responseNote: 'quality-oriented Qwen hosted option',
    supportsVoiceClone: false,
    supportsStyleControl: true,
    recommendedUse: 'quality comparison against Flash',
    sourceUrl: 'https://openrouter.ai/qwen/qwen-audio-3.0-tts-plus',
    defaultVoice: 'longanlingxin',
    supportedVoices: ['longanlingxin', 'longanlufeng'],
    supportsSpeed: false,
  },
  {
    id: 'google/gemini-3.1-flash-tts-preview',
    displayName: 'Gemini 3.1 Flash TTS Preview',
    provider: 'google',
    availability: 'preview',
    languages: ['ja', 'zh'],
    voiceCount: 'up to 2 speakers per request',
    voiceFeatures: ['200+ inline audio tags', 'per-speaker style control'],
    billingUnit: 'audio-token',
    priceUsdPerMillionUnit: 20,
    priceNote: '$1 / 1M text tokens + $20 / 1M audio tokens',
    latencyClass: 'unknown',
    latencyNote: 'OpenRouter provider latency varies; token billing is not character billing',
    streaming: 'supported',
    responseNote: 'strong multi-speaker and expression test candidate',
    supportsVoiceClone: false,
    supportsStyleControl: true,
    recommendedUse: 'multi-speaker and expression experiments',
    sourceUrl: 'https://openrouter.ai/google/gemini-3.1-flash-tts-preview',
    defaultVoice: 'Kore',
    supportedVoices: ['Kore', 'Puck', 'Aoede', 'Charon'],
    supportsSpeed: false,
  },
  {
    id: 'minimax/speech-2.8-turbo',
    displayName: 'MiniMax Speech 2.8 Turbo',
    provider: 'minimax',
    availability: 'available',
    languages: ['ja', 'zh'],
    voiceCount: '45 voices on OpenRouter',
    voiceFeatures: ['emotion control', 'sound tags', 'voice IDs'],
    billingUnit: 'character',
    priceUsdPerMillionUnit: 60,
    priceNote: '$60 / 1M characters',
    latencyClass: 'very-fast',
    latencyNote: 'provider claims sub-200ms TTFB; verify from Japan',
    streaming: 'supported',
    responseNote: 'real-time-oriented hosted option',
    supportsVoiceClone: true,
    supportsStyleControl: true,
    recommendedUse: 'low-latency voice interaction comparison',
    sourceUrl: 'https://openrouter.ai/minimax/speech-2.8-turbo',
    defaultVoice: 'English_radiant_girl',
    supportedVoices: ['English_radiant_girl', 'English_magnetic_voiced_man', 'English_CalmWoman'],
    supportsSpeed: false,
  },
  {
    id: 'microsoft/mai-voice-2',
    displayName: 'Microsoft MAI-Voice-2',
    provider: 'microsoft',
    availability: 'available',
    languages: ['ja', 'zh'],
    voiceFeatures: ['expressive speech', 'voice prompting'],
    billingUnit: 'character',
    priceUsdPerMillionUnit: 22,
    priceNote: '$22 / 1M characters',
    latencyClass: 'unknown',
    latencyNote: 'provider latency varies; voice prompting requires approval',
    streaming: 'supported',
    responseNote: 'requires access and consent checks for cloning features',
    supportsVoiceClone: true,
    supportsStyleControl: true,
    recommendedUse: 'Microsoft hosted voice comparison',
    sourceUrl: 'https://openrouter.ai/microsoft/mai-voice-2',
    defaultVoice: 'en-US-Harper:MAI-Voice-2',
    supportedVoices: ['en-US-Harper:MAI-Voice-2', 'es-MX-Valeria:MAI-Voice-2', 'fr-FR-Soleil:MAI-Voice-2', 'de-DE-Klaus:MAI-Voice-2'],
    supportsSpeed: true,
  },
]

export function getOpenRouterTtsModel(modelId: string): OpenRouterTtsModel | undefined {
  return OPENROUTER_TTS_MODELS.find((model) => model.id === modelId)
}
