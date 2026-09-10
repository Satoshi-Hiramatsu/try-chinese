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
  vm.runInNewContext(source, { exports, Object, JSON, Number, String, Map, Set, Array })
  return exports
}

const assignment = load('../src/data/voiceAssignment.ts')
const characters = load('../src/data/characterVoices.ts')

const plain = (value) => JSON.parse(JSON.stringify(value))

test('モデルを切り替えても前のモデルの話者IDと調整値を覚えている', () => {
  const kokoro = {
    quality: 'natural',
    gender: 'female',
    ttsModel: 'hexgrad/kokoro-82m',
    voiceModel: 'zf_xiaoxiao',
  }
  const fish = assignment.switchVoiceModel(kokoro, 'fish-audio/s2.1-pro-free:free', undefined)
  assert.equal(fish.ttsModel, 'fish-audio/s2.1-pro-free:free')
  assert.equal(fish.voiceModel, undefined, '初めて選ぶモデルは話者未指定にしてモデル既定へ任せる')
  assert.equal(fish.voiceByModel['hexgrad/kokoro-82m'].voiceModel, 'zf_xiaoxiao')

  const tuned = { ...fish, voiceModel: 'ref-123', voiceTuning: { temperature: 0.1 } }
  const back = assignment.switchVoiceModel(tuned, 'hexgrad/kokoro-82m')
  assert.equal(back.voiceModel, 'zf_xiaoxiao', 'Kokoroへ戻ると元の話者が復元される')

  const again = assignment.switchVoiceModel(back, 'fish-audio/s2.1-pro-free:free')
  assert.equal(again.voiceModel, 'ref-123', 'Fishへ戻ると話者IDが復元される')
  assert.deepEqual(plain(again.voiceTuning), { temperature: 0.1 })
})

test('初めて選ぶモデルには渡された既定話者を使う', () => {
  const voice = { quality: 'natural', gender: 'male', ttsModel: 'hexgrad/kokoro-82m', voiceModel: 'zm_yunxi' }
  const next = assignment.switchVoiceModel(voice, 'qwen/qwen-audio-3.0-tts-flash', 'loongjohn')
  assert.equal(next.voiceModel, 'loongjohn')
})

test('空の調整値は保存しない', () => {
  const voice = {
    quality: 'natural',
    gender: 'female',
    ttsModel: 'fish-audio/s1',
    voiceTuning: { temperature: undefined, instructions: '' },
  }
  const remembered = assignment.rememberCurrentBinding(voice)
  assert.deepEqual(plain(remembered.voiceByModel ?? {}), {}, '中身が空の割り当ては書き込まない')
})

test('同じモデルで同じ話者IDのキャラクターを重複として拾う', () => {
  const friends = [
    { id: 'a', voice: { ttsModel: 'fish-audio/s2.1-pro', voiceModel: 'ref-1' } },
    { id: 'b', voice: { ttsModel: 'fish-audio/s2.1-pro', voiceModel: 'ref-1' } },
    { id: 'c', voice: { ttsModel: 'hexgrad/kokoro-82m', voiceModel: 'ref-1' } },
    { id: 'd', voice: { ttsModel: 'fish-audio/s2.1-pro' } },
  ]
  const duplicated = assignment.findDuplicateAssignments(friends)
  assert.ok(duplicated.has('a') && duplicated.has('b'))
  assert.ok(!duplicated.has('c'), 'モデルが違えば同じIDでも別の声')
  assert.ok(!duplicated.has('d'), '話者ID未設定は重複に数えない')
})

test('話者IDはモデル別テーブルから解決し、無ければKokoro/Qwenの既存値に落とす', () => {
  const option = {
    id: 'char-test',
    name: 'test',
    gender: 'female',
    character: '',
    recommendFor: '',
    desc: '',
    edgeVoiceName: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaoxiao',
    voiceIdsByModel: { 'fish-audio/': 'ref-common', 'fish-audio/s2.1-pro': 'ref-s21' },
    defaultRate: 1,
    defaultPitch: 1,
  }
  assert.equal(characters.resolveVoiceIdForModel(option, 'hexgrad/kokoro-82m'), 'zf_xiaoxiao')
  assert.equal(characters.resolveVoiceIdForModel(option, 'qwen/qwen-audio-3.0-tts-flash'), 'longanhuan_v3.6')
  assert.equal(characters.resolveVoiceIdForModel(option, 'fish-audio/s1'), 'ref-common')
  assert.equal(
    characters.resolveVoiceIdForModel(option, 'fish-audio/s2.1-pro'),
    'ref-s21',
    'より長い接頭辞の登録を優先する'
  )
  assert.equal(characters.resolveVoiceIdForModel(option, 'minimax/speech-2.8-turbo'), undefined)
})

test('話者IDを解決できないモデルでは声質キャラクター一覧を出さない', () => {
  const options = characters.CHARACTER_VOICE_OPTIONS
  assert.equal(characters.hasPresetVoiceForModel(options, 'hexgrad/kokoro-82m'), true)
  assert.equal(characters.hasPresetVoiceForModel(options, 'qwen/qwen-audio-3.0-tts-plus'), true)
  assert.equal(
    characters.hasPresetVoiceForModel(options, 'fish-audio/s2.1-pro-free:free'),
    false,
    'Fish Audio は話者IDが未登録のため、モデル側の入力に任せる'
  )
})
