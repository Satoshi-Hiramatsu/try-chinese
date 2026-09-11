import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

/**
 * キャラクターモードのプロフィール上書き（friendProfile.ts）のテスト。
 * - 上書きは指定した項目だけを差し替え、残りは元の値を保つこと
 * - プリセットと同じ内容なら差分なしと判定されること
 * - 書き出しは差分のある友達・項目だけを含むこと
 */

function load(relativePath) {
  const source = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(source, { exports, Object, JSON, Number, String, Map, Set, Array })
  return exports
}

const { applyProfile, diffProfile, pickProfile, formatProfileExport } = load('../src/data/friendProfile.ts')

const preset = {
  id: 'friend-nuan',
  name: '周暖 (Zhou Nuan)',
  portraitId: 'pt-nuan',
  personality: 'お菓子作りが好きな杭州のパティシエ。',
  hobbies: ['お菓子作り', 'カフェ巡り'],
  tone: 'やわらかい敬語混じり',
  voice: { quality: 'natural', gender: 'female' },
  initialMessage: { zh: '你好！', ja: 'こんにちは！', pinyin: 'Nǐ hǎo!', vocabulary: [{ term: '你好', pinyin: 'nǐ hǎo', ja: 'こんにちは', hskLevel: 1 }] },
}

test('applyProfile は指定した項目だけを差し替え、立ち絵と声は触らない', () => {
  const next = applyProfile(preset, { personality: '甘いもの談義が止まらない。', hobbies: ['お菓子作り'] })
  assert.equal(next.personality, '甘いもの談義が止まらない。')
  assert.deepEqual([...next.hobbies], ['お菓子作り'])
  assert.equal(next.name, preset.name)
  assert.equal(next.tone, preset.tone)
  assert.equal(next.portraitId, 'pt-nuan')
  assert.deepEqual(next.voice, preset.voice)
  assert.deepEqual(next.initialMessage, preset.initialMessage)
  // 元のオブジェクトは変更しない
  assert.equal(preset.personality, 'お菓子作りが好きな杭州のパティシエ。')
})

test('applyProfile は null / undefined を渡すと元の Friend をそのまま返す', () => {
  assert.equal(applyProfile(preset, null), preset)
  assert.equal(applyProfile(preset, undefined), preset)
})

test('diffProfile は内容が同じなら空、違う項目だけを名前で返す', () => {
  // vm 側の Array と外側の Array はプロトタイプが違うため、中身だけを比べる
  assert.equal(diffProfile(pickProfile(preset), pickProfile({ ...preset, hobbies: [...preset.hobbies] })).length, 0)
  const changed = applyProfile(preset, { tone: 'ため口', initialMessage: { zh: '嗨！', ja: 'やあ！', pinyin: 'Hāi!' } })
  assert.deepEqual([...diffProfile(pickProfile(changed), pickProfile(preset))], ['tone', 'initialMessage'])
})

test('formatProfileExport は差分のあるプリセットの、変わった項目だけを書き出す', () => {
  const other = { id: 'friend-meiling', name: '陈美玲 (Chen Meiling)', personality: 'p', hobbies: ['a'] }
  const friends = [applyProfile(preset, { tone: 'ため口' }), other]
  const text = formatProfileExport(friends, [preset, other], '2026-09-11T00:00:00.000Z')
  assert.match(text, /EXPORTED_PROFILES/)
  assert.match(text, /'friend-nuan': \{\n\s+"tone": "ため口"\n\s+\}/)
  assert.doesNotMatch(text, /personality/)
  assert.doesNotMatch(text, /friend-meiling/)
})

test('formatProfileExport は上書きが無ければその旨だけを出し、カスタム友達は飛ばす', () => {
  const custom = { id: 'custom-1', name: 'カスタム', personality: 'x', hobbies: [] }
  const text = formatProfileExport([preset, custom], [preset], '2026-09-11T00:00:00.000Z')
  assert.match(text, /上書きされたプロフィールはありません/)
  assert.doesNotMatch(text, /custom-1/)
})
