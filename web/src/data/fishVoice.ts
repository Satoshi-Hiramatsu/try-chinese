/**
 * Fish Audio 専用の声まわりの決まりごと。
 *
 * 音声モデルは OpenRouter 経由の Fish Audio S2.1 Pro に固定し、利用者にも開発者にも切り替えさせない。
 * ここには保存データの正規化とプリセットの声の貸し出しなど、副作用を持たない純粋関数だけを置く
 * （web/test から単体で読めるようにするため）。
 */

import {
  DEFAULT_VOICE_PITCH,
  MAX_VOICE_PITCH,
  MIN_VOICE_PITCH,
  type Friend,
  type TtsVoiceTuning,
  type Voice,
} from '../types'

/** 会話画面の読み上げに使う唯一の音声モデル。 */
export const FIXED_TTS_MODEL = 'fish-audio/s2.1-pro'

/** Fish Audio の話者ID (reference_id) の形。32桁の16進数。 */
const FISH_REFERENCE_ID = /^[0-9a-f]{32}$/i

export function isFishReferenceId(value: unknown): value is string {
  return typeof value === 'string' && FISH_REFERENCE_ID.test(value.trim())
}

/** 声の高さを許容範囲に収める。数値でなければ標準値。 */
export function clampVoicePitch(value: unknown): number {
  const pitch = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_VOICE_PITCH
  return Math.min(MAX_VOICE_PITCH, Math.max(MIN_VOICE_PITCH, Math.round(pitch * 100) / 100))
}

/** 旧形式の保存データが持っていたモデル別の退避テーブル。Fish の話者だけ拾う。 */
interface LegacyVoiceShape {
  gender?: unknown
  voiceModel?: unknown
  rate?: unknown
  pitch?: unknown
  voiceTuning?: unknown
  ttsModel?: unknown
  voiceByModel?: Record<string, { voiceModel?: unknown; voiceTuning?: unknown } | undefined>
}

const LEGACY_FISH_MODEL_IDS = ['fish-audio/s2.1-pro', 'fish-audio/s2.1-pro-free:free']

/**
 * localStorage やプリセットから読んだ声を、いまの Voice の形に揃える。
 *
 * Kokoro・ブラウザ音声の時代に保存された上書きには ttsProvider / voiceName / voiceByModel が残っている。
 * Fish の話者IDが見つかればそれを使い、見つからなければ null（＝上書きを捨ててプリセットに戻る）。
 * ピッチはブラウザ音声用の値（0.7 など）が残っていることがあるため許容範囲に丸める。
 */
export function normalizeStoredVoice(raw: unknown): Voice | null {
  if (!raw || typeof raw !== 'object') return null
  const legacy = raw as LegacyVoiceShape

  let voiceModel = isFishReferenceId(legacy.voiceModel) ? legacy.voiceModel.trim() : ''
  let voiceTuning = isTuning(legacy.voiceTuning) ? legacy.voiceTuning : undefined
  const selectedModel = typeof legacy.ttsModel === 'string' ? legacy.ttsModel : FIXED_TTS_MODEL

  // 選択中のモデルが Fish 以外（Kokoro など）だった上書きは、退避してあった Fish の話者へ戻す。
  if (!voiceModel || !LEGACY_FISH_MODEL_IDS.includes(selectedModel)) {
    const remembered = LEGACY_FISH_MODEL_IDS.map((id) => legacy.voiceByModel?.[id]).find((binding) =>
      isFishReferenceId(binding?.voiceModel)
    )
    if (remembered && isFishReferenceId(remembered.voiceModel)) {
      voiceModel = remembered.voiceModel.trim()
      voiceTuning = isTuning(remembered.voiceTuning) ? remembered.voiceTuning : undefined
    } else if (!voiceModel) {
      return null
    }
  }

  const voice: Voice = {
    gender: legacy.gender === 'male' ? 'male' : 'female',
    voiceModel,
    pitch: clampVoicePitch(legacy.pitch),
  }
  if (typeof legacy.rate === 'number' && Number.isFinite(legacy.rate)) voice.rate = legacy.rate
  if (voiceTuning) voice.voiceTuning = voiceTuning
  return voice
}

function isTuning(value: unknown): value is TtsVoiceTuning {
  return Boolean(value) && typeof value === 'object' && Object.keys(value as object).length > 0
}

/** カスタム友達に貸し出せるプリセットの声。 */
export interface PresetVoiceChoice {
  friendId: string
  friendName: string
  voice: Voice
}

/**
 * 同じ性別のプリセット友達のうち、話者IDが決まっているものを声の選択肢として返す。
 * カスタム友達は自分で Fish の話者を用意できないため、既存の友達の声を借りる。
 */
export function presetVoiceChoices(friends: readonly Friend[], gender: Voice['gender']): PresetVoiceChoice[] {
  const choices: PresetVoiceChoice[] = []
  for (const friend of friends) {
    if (!friend.id || !friend.voice || friend.voice.gender !== gender) continue
    if (!isFishReferenceId(friend.voice.voiceModel)) continue
    choices.push({ friendId: friend.id, friendName: friend.name, voice: friend.voice })
  }
  return choices
}

/** 借りた声を新しい友達用に複製する。高さは標準に戻す（本人が後から変えられる）。 */
export function borrowVoice(source: Voice): Voice {
  const voice: Voice = { gender: source.gender, voiceModel: source.voiceModel, pitch: DEFAULT_VOICE_PITCH }
  if (source.rate !== undefined) voice.rate = source.rate
  if (source.voiceTuning) voice.voiceTuning = { ...source.voiceTuning }
  return voice
}

/**
 * 同じ話者IDを使っている友達のIDを集める。
 * 別々の友達が同じ声で話すと区別がつかないため、管理画面で警告する。話者ID未設定は数えない。
 */
export function findDuplicateAssignments(friends: readonly { id?: string; voice?: Voice }[]): Set<string> {
  const byVoice = new Map<string, string[]>()
  for (const friend of friends) {
    const voiceModel = friend.voice?.voiceModel?.trim().toLowerCase()
    if (!voiceModel || !friend.id) continue
    byVoice.set(voiceModel, [...(byVoice.get(voiceModel) || []), friend.id])
  }
  const duplicated = new Set<string>()
  for (const ids of byVoice.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicated.add(id))
  }
  return duplicated
}
