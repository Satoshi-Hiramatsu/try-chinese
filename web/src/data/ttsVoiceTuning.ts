/**
 * 話者プリセットを持たないモデルで「声を固定する／作り込む」ための設定表。
 *
 * OpenRouter の音声APIは共通パラメータ（voice / speed）のほかに、
 * プロバイダごとの追加パラメータを `provider.options.<スラッグ>` で受け付ける。
 * ここではモデルIDから「どの調整項目が効くか」を引き当て、UIとWorkerで共有する。
 *
 * 参考:
 * - OpenRouter TTS: provider.options によるプロバイダ固有指定（openai の instructions、azure の style など）
 * - Fish Audio: temperature / top_p / repetition_penalty は本文直下、prosody / latency は provider.options
 *   声そのものは `voice`（Fish の reference_id）で指定しない限り生成ごとに変わる。
 */

import type { TtsVoiceTuning } from '../types'

export type TtsTuningNumberKey = 'temperature' | 'topP' | 'repetitionPenalty' | 'volume' | 'styleDegree'
export type TtsTuningTextKey = 'instructions' | 'style'

export interface TtsTuningNumberField {
  key: TtsTuningNumberKey
  label: string
  min: number
  max: number
  step: number
  /** 未指定時にプロバイダが使う値。スライダーの初期位置にも使う。 */
  fallback: number
  help: string
}

export interface TtsTuningTextField {
  key: TtsTuningTextKey
  label: string
  placeholder: string
  help: string
  multiline?: boolean
}

export interface TtsTuningPreset {
  id: string
  label: string
  description: string
  tuning: TtsVoiceTuning
}

export interface TtsTuningVoiceIdField {
  label: string
  placeholder: string
  help: string
  docsUrl?: string
}

export interface TtsTuningCapability {
  /** provider.options のキー。Workerが同じ値で組み立てる。 */
  providerSlug: string
  /** 調整で何が変わるかの要約。設定画面の説明文に出す。 */
  summary: string
  numbers: readonly TtsTuningNumberField[]
  texts: readonly TtsTuningTextField[]
  /** 遅延と品質のトレードオフ指定に対応するモデルだけ true。 */
  hasLatency: boolean
  presets: readonly TtsTuningPreset[]
  /** 話者一覧を公開せず、IDの自由入力で声を固定するモデルの案内。 */
  voiceIdField?: TtsTuningVoiceIdField
}

const FISH_NUMBERS: readonly TtsTuningNumberField[] = [
  {
    key: 'temperature',
    label: '揺らぎ (temperature)',
    min: 0,
    max: 1,
    step: 0.05,
    fallback: 0.7,
    help: '低いほど毎回の音色・抑揚が揃う。声のランダム性を抑えたいときは下げる。',
  },
  {
    key: 'topP',
    label: '候補の広さ (top_p)',
    min: 0,
    max: 1,
    step: 0.05,
    fallback: 0.7,
    help: '低いほど無難な読み方に寄り、突飛な発声が出にくくなる。',
  },
  {
    key: 'repetitionPenalty',
    label: '繰り返し抑制 (repetition_penalty)',
    min: 1,
    max: 2,
    step: 0.05,
    fallback: 1.2,
    help: '同じ音の繰り返しを避ける強さ。上げすぎると発音が崩れる。',
  },
  { key: 'volume', label: '音量 (dB)', min: -20, max: 20, step: 1, fallback: 0, help: '出力音量の増減。' },
]

const FISH_PRESETS: readonly TtsTuningPreset[] = [
  {
    id: 'fish-stable',
    label: '固定重視',
    description: '揺らぎを最小にして、連続生成の声質差を抑える。',
    tuning: { temperature: 0.1, topP: 0.3, repetitionPenalty: 1.2 },
  },
  {
    id: 'fish-default',
    label: '標準',
    description: 'プロバイダ既定と同じ値。',
    tuning: { temperature: 0.7, topP: 0.7, repetitionPenalty: 1.2 },
  },
  {
    id: 'fish-expressive',
    label: '表現重視',
    description: '揺らぎを上げて感情表現の幅を見る。声質のばらつきは大きくなる。',
    tuning: { temperature: 0.9, topP: 0.9, repetitionPenalty: 1.2 },
  },
]

const FISH_VOICE_ID: TtsTuningVoiceIdField = {
  label: '声を固定する話者ID (reference_id)',
  placeholder: '例: 7f92f8afb8ec43bf81429cc1c9199cb1',
  help:
    '空欄だと生成ごとに音色が変わる。Fish Audio のボイス一覧で気に入った声のIDを貼ると同じ声に固定できる。揺らぎの数値だけでは音色そのものは固定できない。',
  docsUrl: 'https://fish.audio/discovery/',
}

const AZURE_STYLE_TEXT: TtsTuningTextField = {
  key: 'style',
  label: '感情スタイル (style)',
  placeholder: '例: cheerful / sad / angry / excited',
  help: 'Azure の話し方スタイル名。モデルが対応していない名前を送ると無視されるか失敗する。',
}

const INSTRUCTIONS_TEXT: TtsTuningTextField = {
  key: 'instructions',
  label: '話し方の指示 (instructions)',
  placeholder: '例: 落ち着いた声で、ゆっくり丁寧に話してください。',
  help: '自然言語で話し方を指定する。声そのものは voice で決まる。',
  multiline: true,
}

/** モデルIDの前方一致で対応表を引く。長い接頭辞を先に置く。 */
const CAPABILITIES: readonly { prefix: string; capability: TtsTuningCapability }[] = [
  {
    prefix: 'fish-audio/',
    capability: {
      providerSlug: 'fish-audio',
      summary:
        '話者IDを指定しないと生成のたびに違う声になる。話者IDで音色を固定し、揺らぎの数値で読み方のばらつきを抑える。',
      numbers: FISH_NUMBERS,
      texts: [],
      hasLatency: true,
      presets: FISH_PRESETS,
      voiceIdField: FISH_VOICE_ID,
    },
  },
  {
    prefix: 'microsoft/mai-voice',
    capability: {
      providerSlug: 'azure',
      summary: '話者は固定されており、感情スタイルとその強さで表現を変える。',
      numbers: [
        {
          key: 'styleDegree',
          label: 'スタイルの強さ (styledegree)',
          min: 0.01,
          max: 2,
          step: 0.05,
          fallback: 1,
          help: '感情スタイルの効き具合。1.0が既定。',
        },
      ],
      texts: [AZURE_STYLE_TEXT],
      hasLatency: false,
      presets: [],
    },
  },
  {
    prefix: 'openai/',
    capability: {
      providerSlug: 'openai',
      summary: '自然言語で話し方を指示できる。声の種類は話者で決まる。',
      numbers: [],
      texts: [INSTRUCTIONS_TEXT],
      hasLatency: false,
      presets: [],
    },
  },
]

/**
 * モデルの調整項目を返す。
 * 対応表に無いモデルは、provider.options への自由入力だけを持つ最小構成を返す。
 * OpenRouter は未対応のオプションを黙って捨てるため、未知のモデルでも試せるようにしておく。
 */
export function getTtsTuningCapability(modelId: string): TtsTuningCapability {
  const matched = CAPABILITIES.find((entry) => modelId.startsWith(entry.prefix))
  if (matched) return matched.capability
  return {
    providerSlug: modelId.split('/')[0] || 'unknown',
    summary: '既知の調整項目はない。プロバイダ固有の指定を試すときは詳細設定のJSONを使う。',
    numbers: [],
    texts: [],
    hasLatency: false,
    presets: [],
  }
}

/** 調整項目を1つでも持つか。持たないモデルではパネルを既定で畳んでおく。 */
export function hasTuningControls(capability: TtsTuningCapability): boolean {
  return (
    capability.numbers.length > 0 ||
    capability.texts.length > 0 ||
    capability.hasLatency ||
    capability.voiceIdField !== undefined
  )
}

const LATENCY_LABELS: Record<NonNullable<TtsVoiceTuning['latency']>, string> = {
  normal: '品質優先',
  balanced: 'バランス',
  low: '低遅延',
}

export const TTS_LATENCY_OPTIONS: readonly { value: NonNullable<TtsVoiceTuning['latency']>; label: string }[] = (
  ['normal', 'balanced', 'low'] as const
).map((value) => ({ value, label: LATENCY_LABELS[value] }))

/** 未設定（すべて空）かどうか。空の調整はリクエストにも履歴にも載せない。 */
export function isEmptyTuning(tuning?: TtsVoiceTuning): boolean {
  if (!tuning) return true
  return Object.entries(tuning).every(([, value]) => {
    if (value === undefined || value === '') return true
    if (typeof value === 'object') return Object.keys(value as object).length === 0
    return false
  })
}

/** 空の項目を落とした調整値を返す。空になれば undefined。 */
export function normalizeTuning(tuning?: TtsVoiceTuning): TtsVoiceTuning | undefined {
  if (!tuning) return undefined
  const next: TtsVoiceTuning = {}
  for (const [key, value] of Object.entries(tuning)) {
    if (value === undefined || value === '') continue
    if (typeof value === 'object' && Object.keys(value as object).length === 0) continue
    Object.assign(next, { [key]: value })
  }
  return isEmptyTuning(next) ? undefined : next
}

/** 結果カードや履歴に出す1行の要約。 */
export function describeTuning(tuning?: TtsVoiceTuning): string {
  const normalized = normalizeTuning(tuning)
  if (!normalized) return ''
  const parts: string[] = []
  if (normalized.temperature !== undefined) parts.push('temp ' + normalized.temperature)
  if (normalized.topP !== undefined) parts.push('top_p ' + normalized.topP)
  if (normalized.repetitionPenalty !== undefined) parts.push('rep ' + normalized.repetitionPenalty)
  if (normalized.volume !== undefined) parts.push('音量 ' + normalized.volume + 'dB')
  if (normalized.latency) parts.push(LATENCY_LABELS[normalized.latency])
  if (normalized.style) parts.push('style ' + normalized.style)
  if (normalized.styleDegree !== undefined) parts.push('強さ ' + normalized.styleDegree)
  if (normalized.instructions) parts.push('指示あり')
  if (normalized.providerOptions) parts.push('詳細JSONあり')
  return parts.join(' / ')
}
