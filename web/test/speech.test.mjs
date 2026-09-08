import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../src/services/speech.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function setup(fetchImpl = async () => ({ ok: true, blob: async () => new Blob(['audio']) })) {
  let recognition
  const played = []
  const exports = {}
  const context = {
    exports, console, Blob, URL,
    setTimeout: () => 1, clearTimeout: () => {},
    require: () => ({ loadApiKey: () => 'test-key', loadTtsProvider: () => 'openrouter', loadTtsModel: () => 'qwen/qwen-audio-3.0-tts-flash' }),
    window: { SpeechRecognition: class {
      constructor() { recognition = this }
      start() { this.onstart?.() }
      stop() { this.onend?.() }
      abort() { this.onend?.() }
    } },
    fetch: fetchImpl,
    Audio: class { constructor(url) { this.url = url } async play() { played.push(this.url) } pause() {} },
  }
  vm.runInNewContext(source, context)
  return { api: exports, recognition: () => recognition, played }
}
const result = (transcript, isFinal = true) => ({ 0: { transcript }, isFinal })
for (const [lang, greeting] of [['ja-JP', '\u3053\u3093\u306b\u3061\u306f'], ['zh-CN', '\u4f60\u597d']]) {
  test(`${lang}: repeated results replace snapshots and preserve intentional repetition`, () => {
    const s = setup()
    let final = '', interim = ''
    const controller = s.api.createSpeechRecognizer({ lang, onFinalResult: t => final = t, onInterimResult: t => interim = t })
    controller.start()
    const r = s.recognition()
    assert.equal(r.lang, lang)
    r.onresult({ resultIndex: 0, results: [result(greeting, false)] })
    assert.equal(final, '')
    assert.equal(interim, greeting)
    r.onresult({ resultIndex: 0, results: [result(greeting)] })
    r.onresult({ resultIndex: 0, results: [result(greeting)] })
    assert.equal(final, greeting)
    assert.equal(interim, '')
    r.onresult({ resultIndex: 1, results: [result(greeting), result(greeting)] })
    assert.equal(final, greeting + greeting)
    controller.abort()
    r.onresult({ resultIndex: 0, results: [result('late')] })
    assert.equal(final, greeting + greeting)
  })
}
const flush = () => new Promise(resolve => setImmediate(resolve))
test('each selected speaker keeps its model and distinct speaker ID', async () => {
  const requests = []
  const s = setup(async (_, init) => { requests.push(JSON.parse(init.body)); return { ok: true, blob: async () => new Blob(['audio']) } })
  for (const voiceModel of ['zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang']) {
    s.api.speakChinese('test', { ttsModel: 'hexgrad/kokoro-82m', voiceModel })
    await flush()
  }
  assert.equal(new Set(requests.map(r => r.voice)).size, 8)
  assert.ok(requests.every(r => r.model === 'hexgrad/kokoro-82m'))
})
test('stopping while audio is loading prevents stale playback', async () => {
  let resolve
  const s = setup(() => new Promise(r => resolve = r))
  s.api.speakChinese('test')
  s.api.stopSpeaking()
  resolve({ ok: true, blob: async () => new Blob(['audio']) })
  await flush()
  assert.equal(s.played.length, 0)
})
test('failed cloud synthesis reports an error instead of replacing the voice', async () => {
  const s = setup(async () => ({ ok: false, status: 503 }))
  let error
  s.api.speakChinese('test', undefined, { onError: e => error = e })
  await flush()
  assert.ok(error)
  assert.equal(s.played.length, 0)
})
