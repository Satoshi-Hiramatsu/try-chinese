import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const STUBS = {
  './storage': { loadApiKey: () => '' },
  './debugRunner': {},
}

function load(relativePath) {
  const source = ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    Number, Math, Date, String, Array, Infinity,
    require: (specifier) => STUBS[specifier] ?? {},
  })
  return exports
}

const stt = load('../src/services/sttDebug.ts')
const recorder = load('../src/services/recorder.ts')

test('比較用の正規化は句読点と空白を落とす', () => {
  assert.equal(stt.normalizeForCer('你好，今天 过得 怎么样？'), '你好今天过得怎么样')
  assert.equal(stt.normalizeForCer('こんにちは。元気？'), 'こんにちは元気')
})

test('比較用の正規化は全角英数を半角へ寄せる', () => {
  assert.equal(stt.normalizeForCer('ＨＳＫ３級'), 'hsk3級')
})

test('編集距離は挿入・削除・置換を数える', () => {
  assert.equal(stt.levenshtein([...'我喜欢'], [...'我喜欢']), 0)
  assert.equal(stt.levenshtein([...'我喜欢'], [...'我喜爱']), 1)
  assert.equal(stt.levenshtein([...'我喜欢'], [...'我']), 2)
  assert.equal(stt.levenshtein([], [...'abc']), 3)
})

test('完全一致の誤り率は0になる', () => {
  assert.equal(stt.characterErrorRate('我喜欢看电影', '我喜欢看电影。'), 0)
})

test('句読点だけの違いは誤りとして数えない', () => {
  assert.equal(stt.characterErrorRate('你好 今天怎么样', '你好，今天怎么样？'), 0)
})

test('1文字の置換は文字数ぶんの割合になる', () => {
  // 6文字中1文字の誤り
  assert.equal(stt.characterErrorRate('我喜欢看电影', '我喜欢看电视'), 1 / 6)
})

test('正解テキストが空なら誤り率は測れない', () => {
  assert.equal(stt.characterErrorRate('', '你好'), undefined)
  assert.equal(stt.characterErrorRate('   ', '你好'), undefined)
})

test('実行を止める理由を条件ごとに返す', () => {
  const base = { hasAudio: true, selectedCount: 1, iterations: 1 }
  assert.equal(stt.getSttDebugRunBlockReason(base), undefined)
  assert.equal(stt.getSttDebugRunBlockReason({ ...base, hasAudio: false }), 'no-audio')
  assert.equal(stt.getSttDebugRunBlockReason({ ...base, selectedCount: 0 }), 'no-model')
  assert.equal(stt.getSttDebugRunBlockReason({ ...base, iterations: 9 }), 'bad-iterations')
  assert.equal(stt.getSttDebugRunBlockReason({ ...base, audioDurationMs: 61_000 }), 'too-long')
})

test('MIMEタイプから文字起こしAPI向けの形式名を取り出す', () => {
  assert.equal(recorder.audioFormatFromMimeType('audio/webm;codecs=opus'), 'webm')
  assert.equal(recorder.audioFormatFromMimeType('audio/mp4'), 'mp4')
  assert.equal(recorder.audioFormatFromMimeType('audio/x-m4a'), 'm4a')
})

test('対応している MIME タイプのうち先頭のものを選ぶ', () => {
  const picked = recorder.pickRecordingMimeType((type) => type === 'audio/webm')
  assert.equal(picked, 'audio/webm')
  assert.equal(recorder.pickRecordingMimeType(() => false), undefined)
})

test('無音の波形は音量ゼロになる', () => {
  assert.equal(recorder.calculateRmsLevel(new Uint8Array(64).fill(128)), 0)
  assert.equal(recorder.calculateRmsLevel(new Uint8Array(0)), 0)
})

test('振れ幅の大きい波形ほど音量が高い', () => {
  const quiet = recorder.calculateRmsLevel(Uint8Array.from({ length: 64 }, (_v, i) => (i % 2 ? 132 : 124)))
  const loud = recorder.calculateRmsLevel(Uint8Array.from({ length: 64 }, (_v, i) => (i % 2 ? 220 : 36)))
  assert.ok(loud > quiet)
  assert.ok(loud <= 1)
})
