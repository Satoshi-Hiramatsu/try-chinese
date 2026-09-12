import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(relativePath, requireImpl = () => ({})) {
  const source = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(source, { exports, Object, JSON, Number, String, Map, Set, Array, require: requireImpl })
  return exports
}

const assignment = load('../src/data/voiceAssignment.ts')
const freeMode = load('../src/services/freeMode.ts', () => assignment)

const FREE = 'fish-audio/s2.1-pro-free:free'
const PAID = 'fish-audio/s2.1-pro'
const KOKORO = 'hexgrad/kokoro-82m'

const context = (hasApiKey) => ({ hasApiKey, globalProvider: 'openrouter', globalModel: 'qwen/qwen-audio-3.0-tts-flash' })

const fishVoice = {
  quality: 'natural',
  gender: 'female',
  ttsProvider: 'openrouter',
  ttsModel: PAID,
  voiceModel: 'ref-meiling',
  voiceTuning: { temperature: 0.95 },
  voiceByModel: {
    [KOKORO]: { voiceModel: 'zf_xiaoyi' },
    [PAID]: { voiceModel: 'ref-meiling', voiceTuning: { temperature: 0.95 } },
  },
}

test('キーがあれば声設定をそのまま使う', () => {
  assert.equal(freeMode.resolveEffectiveVoice(fishVoice, context(true)), fishVoice)
  assert.equal(freeMode.resolveEffectiveVoice(undefined, context(true)), undefined)
})

test('ブラウザ音声はキーが要らないのでそのまま', () => {
  const browser = { quality: 'natural', gender: 'male', ttsProvider: 'browser', voiceName: 'Yunxi' }
  assert.equal(freeMode.resolveEffectiveVoice(browser, context(false)), browser)
  const noProvider = { quality: 'natural', gender: 'male' }
  assert.equal(
    freeMode.resolveEffectiveVoice(noProvider, { hasApiKey: false, globalProvider: 'browser', globalModel: 'x' }),
    noProvider,
    '友達に指定が無ければ設定画面の既定エンジンで判定する'
  )
})

test('有料版 Fish を選んでいれば話者・調整値そのままで無料版に差し替える', () => {
  const effective = freeMode.resolveEffectiveVoice(fishVoice, context(false))
  assert.equal(effective.ttsModel, FREE)
  assert.equal(effective.ttsProvider, 'openrouter')
  assert.equal(effective.voiceModel, 'ref-meiling')
  assert.deepEqual(JSON.parse(JSON.stringify(effective.voiceTuning)), { temperature: 0.95 })
  assert.equal(fishVoice.ttsModel, PAID, '保存された設定は書き換えない')
})

test('Kokoro を選んでいても Fish の話者を覚えていればそれで無料版に切り替える', () => {
  const kokoro = { ...fishVoice, ttsModel: KOKORO, voiceModel: 'zf_xiaoyi', voiceTuning: undefined }
  const effective = freeMode.resolveEffectiveVoice(kokoro, context(false))
  assert.equal(effective.ttsModel, FREE)
  assert.equal(effective.voiceModel, 'ref-meiling')
  assert.deepEqual(JSON.parse(JSON.stringify(effective.voiceTuning)), { temperature: 0.95 })
})

test('Fish の話者を持たない友達はブラウザ音声に落とす', () => {
  const kokoroOnly = { quality: 'natural', gender: 'male', ttsProvider: 'openrouter', ttsModel: KOKORO, voiceModel: 'zm_yunxi' }
  const effective = freeMode.resolveEffectiveVoice(kokoroOnly, context(false))
  assert.equal(effective.ttsProvider, 'browser')
  assert.equal(effective.gender, 'male', '性別など残りの設定は引き継ぐ')
  assert.equal(freeMode.resolveEffectiveVoice(undefined, context(false)).ttsProvider, 'browser')
})

test('Fish を選んでいても話者IDが無ければブラウザ音声に落とす（無指定だと声が毎回変わる）', () => {
  const noVoiceId = { quality: 'natural', gender: 'female', ttsProvider: 'openrouter', ttsModel: PAID }
  assert.equal(freeMode.resolveEffectiveVoice(noVoiceId, context(false)).ttsProvider, 'browser')
})

test('canSpeakWithFreeModel は無料モードで AI 音声になる友達だけ true', () => {
  const globals = { globalProvider: 'openrouter', globalModel: 'qwen/qwen-audio-3.0-tts-flash' }
  assert.equal(freeMode.canSpeakWithFreeModel(fishVoice, globals), true)
  assert.equal(freeMode.canSpeakWithFreeModel({ quality: 'natural', gender: 'male', ttsModel: KOKORO, voiceModel: 'zm_yunxi' }, globals), false)
  assert.equal(freeMode.canSpeakWithFreeModel({ quality: 'natural', gender: 'male', ttsProvider: 'browser' }, globals), false)
})
