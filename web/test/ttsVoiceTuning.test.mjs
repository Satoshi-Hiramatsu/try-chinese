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
  vm.runInNewContext(source, { exports, Object, JSON, Number, String })
  return exports
}

const tuning = load('../src/data/ttsVoiceTuning.ts')

/** vm内で作られた値はホストと別レルムのため、比較前に素のJSONへ揃える。 */
const plain = (value) => JSON.parse(JSON.stringify(value))

test('話者一覧を持たないモデルには話者IDの入力と揺らぎ調整を出す', () => {
  const fish = tuning.getTtsTuningCapability('fish-audio/s1')
  assert.equal(fish.providerSlug, 'fish-audio')
  assert.ok(fish.voiceIdField, '声を固定するには話者IDの入力が要る')
  assert.deepEqual(
    plain(fish.numbers.map((field) => field.key)),
    ['temperature', 'topP', 'repetitionPenalty', 'volume']
  )
  assert.equal(fish.hasLatency, true)
  assert.ok(fish.presets.some((preset) => preset.id === 'fish-stable'))
})

test('固定重視プリセットは標準より揺らぎが小さい', () => {
  const presets = tuning.getTtsTuningCapability('fish-audio/s2.1-pro').presets
  const stable = presets.find((preset) => preset.id === 'fish-stable')
  const standard = presets.find((preset) => preset.id === 'fish-default')
  assert.ok(stable.tuning.temperature < standard.tuning.temperature)
  assert.ok(stable.tuning.topP < standard.tuning.topP)
})

test('MAI-Voice は azure の感情スタイル、OpenAI は話し方の指示を出す', () => {
  const azure = tuning.getTtsTuningCapability('microsoft/mai-voice-2-flash')
  assert.equal(azure.providerSlug, 'azure')
  assert.deepEqual(plain(azure.texts.map((field) => field.key)), ['style'])
  assert.equal(azure.voiceIdField, undefined)

  const openai = tuning.getTtsTuningCapability('openai/gpt-4o-mini-tts')
  assert.deepEqual(plain(openai.texts.map((field) => field.key)), ['instructions'])
})

test('対応表に無いモデルは詳細JSONだけの最小構成にする', () => {
  const unknown = tuning.getTtsTuningCapability('minimax/speech-2.8-turbo')
  assert.equal(unknown.providerSlug, 'minimax')
  assert.equal(unknown.numbers.length, 0)
  assert.equal(tuning.hasTuningControls(unknown), false)
  assert.equal(tuning.hasTuningControls(tuning.getTtsTuningCapability('fish-audio/s1')), true)
})

test('空の調整値は送信も保存もしない形に整える', () => {
  assert.equal(tuning.normalizeTuning(undefined), undefined)
  assert.equal(tuning.normalizeTuning({}), undefined)
  assert.equal(tuning.normalizeTuning({ style: '', providerOptions: {} }), undefined)
  assert.deepEqual(plain(tuning.normalizeTuning({ temperature: 0, style: '' })), { temperature: 0 })
})

test('適用した調整は1行で要約する', () => {
  assert.equal(tuning.describeTuning(undefined), '')
  assert.equal(
    tuning.describeTuning({ temperature: 0.1, topP: 0.3, latency: 'low' }),
    'temp 0.1 / top_p 0.3 / 低遅延'
  )
})
