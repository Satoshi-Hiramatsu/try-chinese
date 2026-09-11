/**
 * 音声モデルごとの話者ID・調整値の退避と復元。
 *
 * 話者IDの体系はモデルごとに異なるため、モデルを切り替えるたびに値を捨てると
 * 聴き比べのために往復しただけで作り込んだ設定が消えてしまう。
 * ここではモデルIDをキーに設定を覚えておき、戻ってきたときに復元する。
 *
 * 副作用を持たない純粋関数だけを置く（web/test から単体で読めるようにするため）。
 */

import type { TtsVoiceTuning, Voice, VoiceModelBinding } from '../types'

/**
 * 同じ声を指す別モデルID。
 *
 * Fish Audio の有料版と無料版は同じ話者ID(reference_id)を受け取る
 * 同一の声で、違うのは課金と混雑だけ。モデルIDで設定を分けて持つと、
 * 聴き比べのために往復しただけで作り込んだ設定が消えてしまう。
 */
const MODEL_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ['fish-audio/s2.1-pro', 'fish-audio/s2.1-pro-free:free'],
]

/** 別名をまとめるための代表ID。グループの先頭を代表とする。 */
export function canonicalVoiceModelId(modelId: string): string {
  const group = MODEL_ALIAS_GROUPS.find((ids) => ids.includes(modelId))
  return group ? group[0] : modelId
}

/** 空の調整値を落とす。保存データを無意味に膨らませないため。 */
function compactTuning(tuning?: TtsVoiceTuning): TtsVoiceTuning | undefined {
  if (!tuning) return undefined
  const entries = Object.entries(tuning).filter(([, value]) => {
    if (value === undefined || value === '') return false
    if (typeof value === 'object') return Object.keys(value as object).length > 0
    return true
  })
  return entries.length > 0 ? (Object.fromEntries(entries) as TtsVoiceTuning) : undefined
}

/** 中身が空の割り当てか。空の割り当ては保存しない。 */
function isEmptyBinding(binding: VoiceModelBinding): boolean {
  return (binding.voiceModel === undefined || binding.voiceModel === '') && binding.voiceTuning === undefined
}

/**
 * そのモデルに覚えてある割り当てを返す。
 * 代表IDで引き、見つからなければ元のIDでも引く（別名統合より前の保存データ向け）。
 */
export function readBinding(voice: Voice | undefined, modelId: string): VoiceModelBinding | undefined {
  if (!voice?.voiceByModel) return undefined
  return voice.voiceByModel[canonicalVoiceModelId(modelId)] ?? voice.voiceByModel[modelId]
}

/** 割り当てを1件書き込んだ新しいテーブルを返す。 */
export function writeBinding(
  voiceByModel: Record<string, VoiceModelBinding> | undefined,
  modelId: string,
  binding: VoiceModelBinding
): Record<string, VoiceModelBinding> {
  const next = { ...(voiceByModel || {}) }
  const key = canonicalVoiceModelId(modelId)
  const compacted: VoiceModelBinding = {
    ...(binding.voiceModel ? { voiceModel: binding.voiceModel } : {}),
    ...(compactTuning(binding.voiceTuning) ? { voiceTuning: compactTuning(binding.voiceTuning) } : {}),
  }
  // 別名で保存された古いエントリは、代表IDへ書き直すときに畳む。
  if (key !== modelId) delete next[modelId]
  if (isEmptyBinding(compacted)) {
    delete next[key]
    return next
  }
  next[key] = compacted
  return next
}

/** 選択中モデルの話者ID・調整値を voiceByModel へ退避した Voice を返す。 */
export function rememberCurrentBinding(voice: Voice): Voice {
  if (!voice.ttsModel) return voice
  const voiceByModel = writeBinding(voice.voiceByModel, voice.ttsModel, {
    voiceModel: voice.voiceModel,
    voiceTuning: voice.voiceTuning,
  })
  return Object.keys(voiceByModel).length > 0 ? { ...voice, voiceByModel } : { ...voice, voiceByModel: undefined }
}

/**
 * 音声モデルを切り替える。
 *
 * 現在の設定を退避してから、切替先に覚えている設定を復元する。
 * 覚えていない場合は fallbackVoiceModel（声質キャラクターから解決した既定話者）を使い、
 * それも無ければ話者未指定にして、モデル側の既定話者に任せる。
 */
export function switchVoiceModel(voice: Voice, nextModelId: string, fallbackVoiceModel?: string): Voice {
  const saved = rememberCurrentBinding(voice)
  const restored = readBinding(saved, nextModelId)
  return {
    ...saved,
    ttsModel: nextModelId,
    voiceModel: restored?.voiceModel ?? fallbackVoiceModel,
    voiceTuning: restored?.voiceTuning,
  }
}

/** 話者の重複判定に使うキー。モデルが違えば同じ話者IDでも別の声になる。 */
export function voiceAssignmentKey(voice?: Voice): string | undefined {
  if (!voice?.voiceModel || voice.voiceModel.trim() === '') return undefined
  // 有料版と無料版は同じ声なので、同じキーに畳んで重複として検出する。
  return `${canonicalVoiceModelId(voice.ttsModel || '')}::${voice.voiceModel.trim()}`
}

/**
 * 同じモデルで同じ話者IDを使っているキャラクターのIDを返す。
 * 20人に別々の声を割り当てる運用で、取り違えに気付けるようにする。
 */
export function findDuplicateAssignments(
  friends: readonly { id?: string; voice?: Voice }[]
): Set<string> {
  const byKey = new Map<string, string[]>()
  for (const friend of friends) {
    const key = voiceAssignmentKey(friend.voice)
    if (!key || !friend.id) continue
    byKey.set(key, [...(byKey.get(key) || []), friend.id])
  }
  const duplicated = new Set<string>()
  for (const ids of byKey.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicated.add(id))
  }
  return duplicated
}
