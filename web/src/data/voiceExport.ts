/**
 * 声設定をコードとして書き出す。
 *
 * 本番環境の管理ダッシュボードで作り込んだ割り当ては localStorage にしか残らない。
 * それを presetFriends.ts のデフォルトへ持ち帰れるよう、貼り付け可能な
 * TypeScript 断片（friendId → Voice）に整形する。
 *
 * 副作用を持たない純粋関数だけを置く（web/test から単体で読めるようにするため）。
 */

import type { Friend, Voice } from '../types'

/** 保存データに紛れた undefined / 空文字を落とし、キー順を固定する。 */
function compactVoice(voice: Voice): Record<string, unknown> {
  const entries = Object.entries(voice)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
  return Object.fromEntries(entries)
}

/** 2行目以降を字下げする。JSON.stringify の複数行出力をオブジェクト内へ収めるため。 */
function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text.split('\n').join(`\n${pad}`)
}

/**
 * 全員分の声設定を、presetFriends.ts へ転記できる TypeScript 断片にする。
 * id を持たない友達は行き先がないため飛ばす。
 */
export function formatVoiceExport(friends: readonly Friend[], exportedAt: string): string {
  const lines: string[] = [
    `// しゃべチャイナ 声設定の書き出し ${exportedAt}`,
    '// friendId → Voice。presetFriends.ts の各 voice に転記する。',
    'export const EXPORTED_VOICES: Record<string, Voice> = {',
  ]
  for (const friend of friends) {
    if (!friend.id) continue
    lines.push(`  // ${friend.name}`)
    if (!friend.voice) {
      lines.push(`  // '${friend.id}': 未設定`)
      continue
    }
    const json = JSON.stringify(compactVoice(friend.voice), null, 2)
    lines.push(`  '${friend.id}': ${indent(json, 2)},`)
  }
  lines.push('}')
  return lines.join('\n')
}
