import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(relativePath) {
  const source = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    Object, JSON, Number, String, Map, Set, Array, Math, Boolean,
    // types.ts の定数だけを使う
    require: () => ({ MIN_VOICE_PITCH: 0.85, MAX_VOICE_PITCH: 1.2, DEFAULT_VOICE_PITCH: 1.0 }),
  })
  return exports
}

const fish = load('../src/data/fishVoice.ts')
/** vm の中で作られた値は外の Object と prototype が違うため、比較は JSON に落としてから行う。 */
const plain = (value) => JSON.parse(JSON.stringify(value))
const REF = '4d9ea3a384294fe39dc9e235f7052ede'
const REF2 = '4f5d1e5c63fd41cfae6c2e4525962b48'

test('話者IDは32桁の16進数だけを認める', () => {
  assert.equal(fish.isFishReferenceId(REF), true)
  assert.equal(fish.isFishReferenceId(` ${REF.toUpperCase()} `), true)
  assert.equal(fish.isFishReferenceId('zf_xiaoxiao'), false)
  assert.equal(fish.isFishReferenceId(''), false)
  assert.equal(fish.isFishReferenceId(undefined), false)
})

test('声の高さは 0.85〜1.20 に丸め、数値でなければ標準', () => {
  assert.equal(fish.clampVoicePitch(0.7), 0.85)
  assert.equal(fish.clampVoicePitch(1.5), 1.2)
  assert.equal(fish.clampVoicePitch(1.049), 1.05)
  assert.equal(fish.clampVoicePitch(undefined), 1)
  assert.equal(fish.clampVoicePitch(Number.NaN), 1)
})

test('いまの形の保存データはそのまま通し、余計なフィールドは落とす', () => {
  const voice = fish.normalizeStoredVoice({
    gender: 'male', voiceModel: REF, rate: 0.9, pitch: 1.1, voiceTuning: { temperature: 0.8 }, ttsProvider: 'openrouter', voiceName: 'x',
  })
  assert.deepEqual(plain(voice), { gender: 'male', voiceModel: REF, pitch: 1.1, rate: 0.9, voiceTuning: { temperature: 0.8 } })
})

test('Kokoro を選択中だった旧データは、退避してあった Fish の話者へ戻す', () => {
  const voice = fish.normalizeStoredVoice({
    quality: 'natural', gender: 'female', ttsModel: 'hexgrad/kokoro-82m', voiceModel: 'zf_xiaoxiao', pitch: 0.7,
    voiceByModel: {
      'hexgrad/kokoro-82m': { voiceModel: 'zf_xiaoxiao' },
      'fish-audio/s2.1-pro': { voiceModel: REF, voiceTuning: { topP: 0.9 } },
    },
  })
  assert.deepEqual(plain(voice), { gender: 'female', voiceModel: REF, pitch: 0.85, voiceTuning: { topP: 0.9 } })
})

test('無料版 Fish を選択中だった旧データも同じ話者として通す', () => {
  const voice = fish.normalizeStoredVoice({ gender: 'female', ttsModel: 'fish-audio/s2.1-pro-free:free', voiceModel: REF })
  assert.equal(voice?.voiceModel, REF)
})

test('Fish の話者がどこにも無い旧データは捨てる', () => {
  assert.equal(fish.normalizeStoredVoice({ gender: 'male', ttsModel: 'hexgrad/kokoro-82m', voiceModel: 'zm_yunxi' }), null)
  assert.equal(fish.normalizeStoredVoice({ gender: 'male', ttsProvider: 'browser', voiceName: 'Microsoft Yunxi' }), null)
  assert.equal(fish.normalizeStoredVoice(null), null)
  assert.equal(fish.normalizeStoredVoice('text'), null)
})

test('同性で話者IDが決まっているプリセットだけを声の選択肢にする', () => {
  const friends = [
    { id: 'a', name: 'A', voice: { gender: 'female', voiceModel: REF } },
    { id: 'b', name: 'B', voice: { gender: 'female', voiceModel: '' } },
    { id: 'c', name: 'C', voice: { gender: 'male', voiceModel: REF2 } },
    { name: 'no-id', voice: { gender: 'female', voiceModel: REF2 } },
  ]
  assert.deepEqual(plain(fish.presetVoiceChoices(friends, 'female').map((c) => c.friendId)), ['a'])
  assert.deepEqual(plain(fish.presetVoiceChoices(friends, 'male').map((c) => c.friendId)), ['c'])
})

test('借りた声は高さを標準に戻し、調整値は複製する', () => {
  const tuning = { temperature: 0.9 }
  const borrowed = fish.borrowVoice({ gender: 'female', voiceModel: REF, rate: 0.95, pitch: 1.15, voiceTuning: tuning })
  assert.deepEqual(plain(borrowed), { gender: 'female', voiceModel: REF, pitch: 1, rate: 0.95, voiceTuning: { temperature: 0.9 } })
  assert.notEqual(borrowed.voiceTuning, tuning)
})

test('同じ話者IDを使う友達を重複として集め、未設定は数えない', () => {
  const duplicated = fish.findDuplicateAssignments([
    { id: 'a', voice: { gender: 'female', voiceModel: REF } },
    { id: 'b', voice: { gender: 'female', voiceModel: REF.toUpperCase() } },
    { id: 'c', voice: { gender: 'male', voiceModel: REF2 } },
    { id: 'd', voice: { gender: 'male', voiceModel: '' } },
  ])
  assert.deepEqual([...duplicated].sort(), ['a', 'b'])
})
