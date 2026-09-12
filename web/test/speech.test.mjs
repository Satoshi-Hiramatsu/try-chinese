import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(readFileSync(new URL('../src/services/speech.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function setup(fetchImpl = async () => ({ ok: true, blob: async () => new Blob(['audio']) }), apiKey = 'test-key') {
  let recognition
  const played = []
  // 文単位の読み上げでは再生の終わりを外から起こす必要があるため、実体を控えておく。
  const audios = []
  const exports = {}
  const timers = new Map()
  let nextTimerId = 1
  let nextObjectUrlId = 1
  const context = {
    exports, console, Blob,
    // 実物の URL には createObjectURL が無く、再生経路まで届かなかった。
    URL: { createObjectURL: () => 'blob:' + nextObjectUrlId++, revokeObjectURL: () => {} },
    setTimeout: (fn, ms) => { const id = nextTimerId++; timers.set(id, { fn, ms }); return id },
    clearTimeout: (id) => { timers.delete(id) },
    require: () => ({ loadUsableApiKey: () => apiKey, markApiKeyExhausted: () => {}, FIXED_TTS_MODEL: 'fish-audio/s2.1-pro', clampVoicePitch: (v) => Math.min(1.2, Math.max(0.85, typeof v === 'number' ? v : 1)), responseToPlayableBlob: async (response) => await response.blob() }),
    window: { SpeechRecognition: class {
      constructor() { recognition = this }
      start() { this.onstart?.() }
      stop() { this.onend?.() }
      abort() { this.onend?.() }
    } },
    fetch: fetchImpl,
    Audio: class { constructor(url) { this.url = url; audios.push(this) } async play() { played.push(this.url) } pause() {} },
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
  return { api: exports, recognition: () => recognition, played, audios, runTimer, pendingTimers }
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
/** Fish の話者IDを持つ友達の声。読み上げは話者IDが無いと送らない。 */
const fishVoice = (voiceModel = '4d9ea3a384294fe39dc9e235f7052ede') => ({ gender: 'female', voiceModel })
/** 文単位の読み上げは取得→再生の段が重なるため、数回ぶん流す。 */
const settle = async (times = 6) => { for (let i = 0; i < times; i += 1) await flush() }
test('single utterance mode can disable continuous recognition', () => {
  const s = setup()
  const controller = s.api.createSpeechRecognizer({ continuous: false })
  controller.start()
  assert.equal(s.recognition().continuous, false)
})

test('話者IDごとに別の音声を Fish の固定モデルで求める', async () => {
  const requests = []
  const s = setup(async (_, init) => { requests.push(JSON.parse(init.body)); return { ok: true, blob: async () => new Blob(['audio']) } })
  const ids = ['4d9ea3a384294fe39dc9e235f7052ede', '4f5d1e5c63fd41cfae6c2e4525962b48', '2daca7855fa44ab6b6e994ee93e5bd48']
  for (const voiceModel of ids) {
    s.api.speakChinese('test', fishVoice(voiceModel), { onError: (e) => { throw e } })
    await flush()
  }
  assert.deepEqual(requests.map(r => r.voice), ids)
  assert.ok(requests.every(r => r.model === 'fish-audio/s2.1-pro'))
  assert.ok(requests.every(r => r.apiKey === 'test-key'))
})
test('話者IDが無い友達は送らずにエラーを返す', async () => {
  const requests = []
  const s = setup(async (_, init) => { requests.push(init); return { ok: true, blob: async () => new Blob(['audio']) } })
  let error
  s.api.speakChinese('test', { gender: 'male', voiceModel: '' }, { onError: (e) => { error = e } })
  await flush()
  assert.equal(requests.length, 0)
  assert.equal(error?.message, s.api.NO_VOICE_MESSAGE)
})
test('使えるキーが無いときは送らずにエラーを返す', async () => {
  const requests = []
  const s = setup(async (_, init) => { requests.push(init); return { ok: true, blob: async () => new Blob(['audio']) } }, '')
  let error
  s.api.speakChinese('test', fishVoice(), { onError: (e) => { error = e } })
  await flush()
  assert.equal(requests.length, 0)
  assert.equal(error?.message, s.api.NO_API_KEY_MESSAGE)
})
test('stopping while audio is loading prevents stale playback', async () => {
  let resolve
  const s = setup(() => new Promise(r => resolve = r))
  s.api.speakChinese('test', fishVoice())
  s.api.stopSpeaking()
  resolve({ ok: true, blob: async () => new Blob(['audio']) })
  await flush()
  assert.equal(s.played.length, 0)
})
test('failed cloud synthesis reports an error instead of replacing the voice', async () => {
  const s = setup(async () => ({ ok: false, status: 503 }))
  let error
  s.api.speakChinese('test', fishVoice(), { onError: e => error = e })
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

test('開き直した直後に前セッションの確定文が再掲されても、プレビューは重ねない', () => {
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
  r.onend()
  assert.equal(s.runTimer(250), true)
  const r2 = s.recognition()

  // 新しい実体が前の確定文をそのまま先頭に再掲しても、表示は増えない
  r2.onresult({ resultIndex: 0, results: [result('我已经结婚了')] })
  assert.deepEqual(finals, ['我已经结婚了'])

  // 再掲のうしろに新しい発話が続いたら、その分だけを積む
  r2.onresult({ resultIndex: 0, results: [result('我已经结婚了'), result('有一个孩子')] })
  assert.deepEqual(finals, ['我已经结婚了', '我已经结婚了有一个孩子'])

  // 同じセッション内での意図的な繰り返しは、これまでどおりそのまま残す
  r2.onend()
  assert.equal(s.runTimer(250), true)
  const r3 = s.recognition()
  r3.onresult({ resultIndex: 0, results: [result('好'), result('好')] })
  assert.deepEqual(finals[finals.length - 1], '我已经结婚了有一个孩子好好')
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

test('1文だけの返答は分割しない', () => {
  const s = setup()
  assert.deepEqual(JSON.parse(JSON.stringify(s.api.splitIntoSpeechSegments('我今天很开心'))), ['我今天很开心'])
  assert.deepEqual(JSON.parse(JSON.stringify(s.api.splitIntoSpeechSegments('   '))), [])
})

test('句点のうしろで分割し、句点は前の文に残す', () => {
  const s = setup()
  const text = '我昨天去了电影院看了一部很好的电影。那部电影真的非常好看我很喜欢。你也应该找时间去看一看。'
  const segments = s.api.splitIntoSpeechSegments(text)
  assert.equal(segments.length, 3)
  assert.ok(segments[0].endsWith('。'))
  assert.ok(segments[1].endsWith('。'))
  // 分割しても内容は落とさない。
  assert.equal(segments.join(''), text)
})

test('短い断片は前の文にくっつける', () => {
  const s = setup()
  // 「是吗？」だけで1リクエストを使うと、かえって間延びする。
  // 前が短いかぎり足し続けるので、短文が続く返答はまとめて1回で鳴らす。
  const segments = s.api.splitIntoSpeechSegments('是吗？真的吗？我也觉得这个电影非常有意思。')
  assert.equal(segments.length, 1)

  // 末尾が短い場合も前へ寄せる。「是吗？」だけのために1回増やさない。
  assert.deepEqual(
    JSON.parse(JSON.stringify(s.api.splitIntoSpeechSegments('我昨天去了电影院看了一部很好的电影。是吗？'))),
    ['我昨天去了电影院看了一部很好的电影。是吗？']
  )
})

test('分割しすぎないよう上限を超えた分は最後にまとめる', () => {
  const s = setup()
  const long = Array.from({ length: 12 }, (_v, i) => `这是第${i}个句子真的很长很长。`).join('')
  const segments = s.api.splitIntoSpeechSegments(long)
  assert.ok(segments.length <= s.api.MAX_SPEECH_SEGMENTS)
  assert.equal(segments.join(''), long)
})

test('1文目を鳴らしている間に次の文を取りに行く', async () => {
  const requests = []
  const s = setup(async (_, init) => { requests.push(JSON.parse(init.body).text); return { ok: true, blob: async () => new Blob(['audio']) } })
  s.api.speakChinese('我昨天去了电影院看了一部电影。那部电影真的非常好看啊我很喜欢。', fishVoice())
  await settle()

  // 1文目だけを取得して再生を始め、この時点で2文目の取得も走っている。
  assert.equal(s.played.length, 1)
  assert.equal(requests.length, 2)
  assert.ok(requests[0].endsWith('。'))
  assert.notEqual(requests[0], requests[1])
})

test('最後の文が鳴り終わってから読み上げ終了を伝える', async () => {
  const s = setup()
  let ended = 0
  s.api.speakChinese('我昨天去了电影院看了一部电影。那部电影真的非常好看啊我很喜欢。', fishVoice(), { onEnd: () => { ended += 1 } })
  await settle()

  assert.equal(ended, 0)
  s.audios[0].onended()
  await settle()
  // 1文目が終わっただけでは終了にしない。2文目が控えている。
  assert.equal(ended, 0)
  assert.equal(s.played.length, 2)

  s.audios[1].onended()
  await settle()
  assert.equal(ended, 1)
})

test('途中で停止したら次の文を鳴らさない', async () => {
  const s = setup()
  s.api.speakChinese('我昨天去了电影院看了一部电影。那部电影真的非常好看啊我很喜欢。', fishVoice())
  await settle()

  s.api.stopSpeaking()
  s.audios[0].onended()
  await settle()
  assert.equal(s.played.length, 1)
})

test('声の高さは再生速度で作り、Fish に頼む速さで打ち消す', () => {
  const s = setup()
  assert.deepEqual({ ...s.api.resolvePitchPlayback({ rate: 1, pitch: 1 }) }, { requestSpeed: 1, playbackRate: 1 })
  assert.deepEqual({ ...s.api.resolvePitchPlayback({ rate: 0.9, pitch: 1.2 }) }, { requestSpeed: 0.75, playbackRate: 1.2 })
  assert.deepEqual({ ...s.api.resolvePitchPlayback({ rate: 1.0, pitch: 0.85 }) }, { requestSpeed: 1.176, playbackRate: 0.85 })
  // 範囲外・未指定は丸める
  assert.deepEqual({ ...s.api.resolvePitchPlayback({ pitch: 2 }) }, { requestSpeed: 0.833, playbackRate: 1.2 })
  assert.deepEqual({ ...s.api.resolvePitchPlayback({}) }, { requestSpeed: 1, playbackRate: 1 })
})

test('高さを変えた友達は打ち消した速さで求め、音程を変えて再生する', async () => {
  const requests = []
  const s = setup(async (_, init) => { requests.push(JSON.parse(init.body)); return { ok: true, blob: async () => new Blob(['audio']) } })
  s.api.speakChinese('test', { ...fishVoice(), rate: 1, pitch: 1.1 })
  await flush()
  assert.equal(requests[0].speed, 0.909)
  assert.equal(s.audios[0].playbackRate, 1.1)
  assert.equal(s.audios[0].preservesPitch, false)
})

test('高さが標準なら再生速度に触らない', async () => {
  const s = setup()
  s.api.speakChinese('test', fishVoice())
  await flush()
  assert.equal(s.audios[0].playbackRate, undefined)
  assert.equal(s.audios[0].preservesPitch, undefined)
})
