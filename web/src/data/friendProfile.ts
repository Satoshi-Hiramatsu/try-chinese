/**
 * Friend のプロフィール（名前・性格・趣味・口調・最初のメッセージ）の上書き。
 *
 * プリセットの友達は presetFriends.ts に固定されているため、キャラクターモードで
 * 調整した内容は localStorage にしか残らない。声設定（voiceExport.ts）と同じく、
 * 上書きを presetFriends.ts へ持ち帰れる TypeScript 断片に整形する。
 *
 * 副作用を持たない純粋関数だけを置く（web/test から単体で読めるようにするため）。
 */

import type { Friend } from '../types'

/** キャラクターモードから編集できる項目。立ち絵・声は別の仕組みで管理する。 */
export type FriendProfile = Pick<Friend, 'name' | 'personality' | 'hobbies' | 'tone' | 'initialMessage'>

export const PROFILE_KEYS = ['name', 'personality', 'hobbies', 'tone', 'initialMessage'] as const

/** Friend からプロフィール部分だけを取り出す。 */
export function pickProfile(friend: Friend): FriendProfile {
  return {
    name: friend.name,
    personality: friend.personality,
    hobbies: [...friend.hobbies],
    tone: friend.tone,
    initialMessage: friend.initialMessage ? { ...friend.initialMessage } : undefined,
  }
}

/** 上書きを Friend に重ねる。undefined の項目は元の値を残す。 */
export function applyProfile(friend: Friend, profile: Partial<FriendProfile> | null | undefined): Friend {
  if (!profile) return friend
  const next: Friend = { ...friend }
  if (profile.name !== undefined) next.name = profile.name
  if (profile.personality !== undefined) next.personality = profile.personality
  if (profile.hobbies !== undefined) next.hobbies = [...profile.hobbies]
  if (profile.tone !== undefined) next.tone = profile.tone
  if (profile.initialMessage !== undefined) next.initialMessage = { ...profile.initialMessage }
  return next
}

function normalize(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/** プロフィールが元の値と異なる項目名を返す。空なら上書き無し。 */
export function diffProfile(current: FriendProfile, base: FriendProfile): (typeof PROFILE_KEYS)[number][] {
  return PROFILE_KEYS.filter((key) => normalize(current[key]) !== normalize(base[key]))
}

/** 2行目以降を字下げする。JSON.stringify の複数行出力をオブジェクト内へ収めるため。 */
function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text.split('\n').join(`\n${pad}`)
}

/**
 * プリセットと異なるプロフィールだけを、presetFriends.ts へ転記できる TypeScript 断片にする。
 * `presets` に無い（＝カスタムの）友達は customFriends に丸ごと保存済みなので飛ばす。
 */
export function formatProfileExport(
  friends: readonly Friend[],
  presets: readonly Friend[],
  exportedAt: string,
): string {
  const presetById = new Map(presets.filter((p) => p.id).map((p) => [p.id as string, p]))
  const lines: string[] = [
    `// しゃべチャイナ プロフィール上書きの書き出し ${exportedAt}`,
    '// friendId → 変更のあった項目だけ。presetFriends.ts の該当フィールドに転記する。',
    'export const EXPORTED_PROFILES: Record<string, Partial<Friend>> = {',
  ]
  let count = 0
  for (const friend of friends) {
    const preset = friend.id ? presetById.get(friend.id) : undefined
    if (!friend.id || !preset) continue
    const changed = diffProfile(pickProfile(friend), pickProfile(preset))
    if (changed.length === 0) continue
    count += 1
    const patch = Object.fromEntries(changed.map((key) => [key, friend[key]]))
    lines.push(`  // ${friend.name}`)
    lines.push(`  '${friend.id}': ${indent(JSON.stringify(patch, null, 2), 2)},`)
  }
  if (count === 0) lines.push('  // 上書きされたプロフィールはありません')
  lines.push('}')
  return lines.join('\n')
}
