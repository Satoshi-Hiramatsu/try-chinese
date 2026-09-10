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
  const timers = new Map()
  let nextTimerId = 1
  const context = {
    exports, console, Blob, URL,
    setTimeout: (fn, ms) => { const id = nextTimerId++; timers.set(id, { fn, ms }); return id },
    clearTimeout: (id) => { timers.delete(id) },
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
  // 指定した遅延で登録された最初のタイマーだけを発火させる
  const runTimer = (ms) => {
    for (const [id, timer] of timers) {
      if (timer.ms !== ms) continue
      timers.delete(id)
      timer.fn()
      return true
    }
    return false
  }
  const pendingTimers = (ms) => [...timers.values()].filter((t) => t.ms === ms).length
  return { api: exports, recognition: () => recognition, played, runTimer, pendingTimers }
}
const result = (transcript, isFinal = true) => ({ 0: { transcript }, isFinal })
for (const [lang, greeting] of [['ja-JP', '\u3053\u3093\u306b\u3061\u306f'], ['zh-CN', '\u4f60\u597d']]) {
  test(`${lang}: repeated results replace snapshots and preserve intentional repetition`, () => {
    const s = setup()
    let final = '', interim = ''
    const finalUpdates = []
    const controller = s.api.createSpeechRecognizer({
      lang,
      onFinalResult: t => { final = t; finalUpdates.push(t) },
      onInterimResult: t => interim = t,
    })
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
    assert.deepEqual(finalUpdates, [greeting])
    r.onresult({ resultIndex: 1, results: [result(greeting), result(greeting)] })
    assert.equal(final, greeting + greeting)
    controller.abort()
    assert.deepEqual(finalUpdates, [greeting, greeting + greeting])
    r.onresult({ resultIndex: 0, results: [result('late')] })
    assert.equal(final, greeting + greeting)
  })
}
const flush = () => new Promise(resolve => setImmediate(resolve))
test('single utterance mode can disable continuous recognition', () => {
  const s = setup()
  const controller = s.api.createSpeechRecognizer({ continuous: false })
  controller.start()
  assert.equal(s.recognition().continuous, false)
})

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

test('a browser cutoff reopens the microphone and keeps the text so far', () => {
  const s = setup()
  const finals = []
  let ended = 0
  const controller = s.api.createSpeechRecognizer({
    lang: 'ja-JP',
    silenceTimeoutMs: 20000,
    onFinalResult: (t) => finals.push(t),
    onEnd: () => { ended++ },
  })
  controller.start()
  const r = s.recognition()
  assert.equal(r.continuous, true)
  r.onresult({ resultIndex: 0, results: [result('昨日は')] })
  assert.deepEqual(finals, ['昨日は'])

  // 考えている間にブラウザが勝手に打ち切っても、終了扱いにせず開き直す
  r.onend()
  assert.equal(ended, 0)
  assert.equal(s.runTimer(250), true)
  // 開き直しても無音の持ち時間は延長しない
  assert.equal(s.pendingTimers(20000), 1)

  // 開き直しは新しい実体で行う（前セッションの results を持ち越さないため）
  const r2 = s.recognition()
  assert.notEqual(r2, r)

  // 再開後の確定は前のテキストに積み上がる
  r2.onresult({ resultIndex: 0, results: [result('映画を見ました')] })
  assert.deepEqual(finals, ['昨日は', '昨日は映画を見ました'])
})

test('a reopened microphone never repeats the utterance it already captured', () => {
  const s = setup()
  const finals = []
  const controller = s.api.createSpeechRecognizer({
    lang: 'zh-CN',
    silenceTimeoutMs: 20000,
    onFinalResult: (t) => finals.push(t),
  })
  controller.start()
  const r = s.recognition()
  r.onresult({ resultIndex: 0, results: [result('我已经结婚了')] })
  assert.deepEqual(finals, ['我已经结婚了'])

  r.onend()
  assert.equal(s.runTimer(250), true)

  // 前のセッションが遅れて同じ結果を投げても、二重には積まない
  r.onresult({ resultIndex: 0, results: [result('我已经结婚了')] })
  assert.deepEqual(finals, ['我已经结婚了'])

  // 新しい実体は空から始まるので、蓄積済みと同じ結果が来ても重ならない
  const r2 = s.recognition()
  r2.onresult({ resultIndex: 0, results: [result('对', false)] })
  assert.deepEqual(finals, ['我已经结婚了'])
})

test('running out of silence between sessions still ends listening', () => {
  const s = setup()
  let ended = 0
  const controller = s.api.createSpeechRecognizer({ silenceTimeoutMs: 20000, onEnd: () => { ended++ } })
  controller.start()
  const r = s.recognition()
  // 開き直しを待っている最中に無音を使い切る
  r.onend()
  assert.equal(s.pendingTimers(250), 1)
  assert.equal(s.runTimer(20000), true)
  assert.equal(ended, 1)
  // マイクは開き直さない
  assert.equal(s.pendingTimers(250), 0)
})

test('starting twice does not open a second recognition stream', () => {
  const s = setup()
  const finals = []
  const controller = s.api.createSpeechRecognizer({ onFinalResult: (t) => finals.push(t) })
  controller.start()
  const r = s.recognition()
  controller.start()
  assert.equal(s.recognition(), r)
  r.onresult({ resultIndex: 0, results: [result('你好')] })
  assert.deepEqual(finals, ['你好'])
  controller.abort()
})

test('a short no-speech gap does not surface an error or end the session', () => {
  const s = setup()
  let error, ended = 0
  const controller = s.api.createSpeechRecognizer({ onError: (e) => { error = e }, onEnd: () => { ended++ } })
  controller.start()
  const r = s.recognition()
  r.onerror({ error: 'no-speech' })
  r.onend()
  assert.equal(error, undefined)
  assert.equal(ended, 0)
  assert.equal(s.pendingTimers(250), 1)
})

test('only a long silence stops listening, and it never sends', () => {
  const s = setup()
  const finals = []
  let ended = 0
  const controller = s.api.createSpeechRecognizer({
    silenceTimeoutMs: 20000,
    onFinalResult: (t) => finals.push(t),
    onEnd: () => { ended++ },
  })
  controller.start()
  const r = s.recognition()
  r.onresult({ resultIndex: 0, results: [result('你好')] })
  // 発話のたびに無音の持ち時間は取り直される
  assert.equal(s.pendingTimers(20000), 1)
  assert.equal(s.runTimer(20000), true)
  assert.equal(ended, 1)
  assert.deepEqual(finals, ['你好'])
  // 無音停止のあとは開き直さない
  assert.equal(s.pendingTimers(250), 0)
  controller.abort()
})

test('the silence budget defaults to a thinking pause, not a breath', () => {
  const s = setup()
  const controller = s.api.createSpeechRecognizer({})
  controller.start()
  assert.equal(s.api.DEFAULT_SILENCE_TIMEOUT_MS, 7000)
  assert.equal(s.pendingTimers(s.api.DEFAULT_SILENCE_TIMEOUT_MS), 1)
  controller.abort()
})

test('the silence budget is published so the countdown can show it, and rewinds when speech returns', () => {
  const s = setup()
  const windows = []
  const controller = s.api.createSpeechRecognizer({
    silenceTimeoutMs: 20000,
    onSilenceWindowChange: (deadline) => windows.push(deadline),
  })
  controller.start()
  // 聞き取り開始と同時に期限が知らされる
  assert.equal(windows.length, 1)
  assert.ok(windows[0] - Date.now() > 19000)

  const r = s.recognition()
  const firstDeadline = windows[0]
  r.onresult({ resultIndex: 0, results: [result('你好', false)] })
  // 声が入ったら期限は先送りされる（カウントダウンは満タンに戻る）
  assert.equal(windows.length, 2)
  assert.ok(windows[1] >= firstDeadline)

  assert.equal(s.runTimer(20000), true)
  // 使い切ったらカウントダウンは消える
  assert.equal(windows.at(-1), null)
  controller.abort()
})

test('running out of silence is announced before listening stops', () => {
  const s = setup()
  const order = []
  const controller = s.api.createSpeechRecognizer({
    silenceTimeoutMs: 20000,
    onSilenceTimeout: () => order.push('timeout'),
    onEnd: () => order.push('end'),
  })
  controller.start()
  assert.equal(s.runTimer(20000), true)
  assert.deepEqual(order, ['timeout', 'end'])
})

test('stopping by hand clears the countdown instead of leaving it hanging', () => {
  const s = setup()
  const windows = []
  const controller = s.api.createSpeechRecognizer({ onSilenceWindowChange: (d) => windows.push(d) })
  controller.start()
  controller.abort()
  assert.equal(windows.at(-1), null)
})

test('the silence budget stays inside a usable range', () => {
  const s = setup()
  const { clampSilenceTimeoutMs, MIN_SILENCE_TIMEOUT_MS, MAX_SILENCE_TIMEOUT_MS } = s.api
  assert.equal(clampSilenceTimeoutMs(500), MIN_SILENCE_TIMEOUT_MS)
  assert.equal(clampSilenceTimeoutMs(60000), MAX_SILENCE_TIMEOUT_MS)
  assert.equal(clampSilenceTimeoutMs(Number.NaN), s.api.DEFAULT_SILENCE_TIMEOUT_MS)
  // 0.5秒刻みに丸める
  assert.equal(clampSilenceTimeoutMs(4321), 4500)
  // 設定値はそのまま無音タイマーの長さになる
  s.api.createSpeechRecognizer({ silenceTimeoutMs: 4321 })?.start()
  assert.equal(s.pendingTimers(4500), 1)
})
