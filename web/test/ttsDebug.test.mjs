import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function transpile(relativePath) {
  return ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
}

/** 相対パス指定でモジュールを読み込み、依存も同じ仕組みで解決する簡易ローダー。 */
const loaded = new Map()
const STUBS = {
  './storage': { loadApiKey: () => '' },
}

/** テストファイルからの相対パスを保ったまま、モジュール間の相対指定を解決する。 */
function resolveRelative(fromPath, specifier) {
  const parts = fromPath.split('/')
  parts.pop()
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }
  return parts.join('/') + '.ts'
}

function load(relativePath) {
  if (loaded.has(relativePath)) return loaded.get(relativePath)
  const exports = {}
  loaded.set(relativePath, exports)
  vm.runInNewContext(transpile(relativePath), {
    exports,
    TextEncoder,
    Blob,
    DataView,
    ArrayBuffer,
    Uint8Array,
    Number,
    Math,
    Date,
    URL,
    require: (specifier) => {
      if (STUBS[specifier]) return STUBS[specifier]
      return load(resolveRelative(relativePath, specifier))
    },
  })
  return exports
}

const overlay = load('../src/data/openRouterTtsModels.ts')
const audioFormat = load('../src/services/audioFormat.ts')
const service = load('../src/services/ttsDebug.ts')
const catalog = load('../src/services/ttsCatalog.ts')

test('Unicode文字数とUTF-8バイト数を区別する', () => {
  const units = service.countTextUnits('你😀')
  assert.equal(units.characters, 2)
  assert.equal(units.utf8Bytes, 7)
})

test('実行を止める理由を入力・モデル選択・連続生成回数から判定する', () => {
  const block = service.getTtsDebugRunBlockReason
  assert.equal(block({ text: '你好', selectedCount: 3, iterations: 3 }), undefined)
  assert.equal(block({ text: '   ', selectedCount: 3, iterations: 3 }), 'empty-text')
  assert.equal(block({ text: '你'.repeat(1001), selectedCount: 3, iterations: 1 }), 'too-long')
  assert.equal(block({ text: '你'.repeat(1000), selectedCount: 3, iterations: 1 }), undefined)
  assert.equal(block({ text: '你好', selectedCount: 0, iterations: 1 }), 'no-model')
  assert.equal(block({ text: '你好', selectedCount: 1, iterations: 0 }), 'bad-iterations')
  assert.equal(block({ text: '你好', selectedCount: 1, iterations: 6 }), 'bad-iterations')
  // 回数を省略した場合は単発実行として扱う。
  assert.equal(block({ text: '你好', selectedCount: 1 }), undefined)
  assert.equal(service.TTS_DEBUG_MAX_CHARACTERS, 1000)
})

test('課金単位はオーバーレイ優先で、未登録モデルは価格から推定する', () => {
  assert.equal(overlay.inferBillingUnit('qwen/qwen-audio-3.0-tts-flash', 0), 'character')
  assert.equal(overlay.inferBillingUnit('fish-audio/s2-pro', 0), 'utf8-byte')
  assert.equal(overlay.inferBillingUnit('google/gemini-3.1-flash-tts-preview', 0.00002), 'audio-token')
  // 未登録でも音声トークン課金は価格から判定できる。
  assert.equal(overlay.inferBillingUnit('acme/new-tts', 0.00001), 'audio-token')
  assert.equal(overlay.inferBillingUnit('acme/new-tts', 0), 'character')
  assert.equal(overlay.inferBillingUnit('fish-audio/未登録', 0), 'utf8-byte')
})

test('推奨話者プリセットはカタログが受け付ける話者だけを指す', () => {
  for (const [modelId, entry] of Object.entries(overlay.TTS_MODEL_OVERLAY)) {
    const presetIds = new Set((entry.voicePresets || []).map((preset) => preset.id))
    assert.equal(presetIds.size, (entry.voicePresets || []).length, modelId + ' のプリセットが重複している')
    for (const voice of entry.preferredVoices || []) {
      assert.equal(typeof voice, 'string')
    }
  }
})

test('課金単位ごとに概算料金を計算し、音声トークン課金は算出不能とする', () => {
  const estimate = catalog.estimateCatalogCostUsd
  assert.equal(estimate({ billingUnit: 'character', unitPriceUsd: 0.000015 }, '你好'), 0.00003)
  assert.equal(estimate({ billingUnit: 'utf8-byte', unitPriceUsd: 0.000015 }, '你好'), 0.00009)
  assert.equal(estimate({ billingUnit: 'audio-token', unitPriceUsd: 0.000001 }, '你好'), undefined)
})

test('PCMのContent-Typeを判別し、mp3は変換対象にしない', () => {
  assert.equal(audioFormat.isPcmContentType('audio/pcm'), true)
  assert.equal(audioFormat.isPcmContentType('audio/L16;rate=24000'), true)
  assert.equal(audioFormat.isPcmContentType('audio/mpeg'), false)
  assert.equal(audioFormat.isPcmContentType(null), false)
})

test('PCMに付けるWAVヘッダーがRIFF仕様どおりの値を持つ', () => {
  const header = audioFormat.createWavHeader(480, { sampleRate: 24000, bitsPerSample: 16, channels: 1 })
  const view = new DataView(header)
  const ascii = (offset) => String.fromCharCode(...new Uint8Array(header, offset, 4))
  assert.equal(header.byteLength, 44)
  assert.equal(ascii(0), 'RIFF')
  assert.equal(ascii(8), 'WAVE')
  assert.equal(ascii(12), 'fmt ')
  assert.equal(ascii(36), 'data')
  assert.equal(view.getUint32(4, true), 36 + 480)
  assert.equal(view.getUint16(20, true), 1) // 非圧縮PCM
  assert.equal(view.getUint16(22, true), 1) // モノラル
  assert.equal(view.getUint32(24, true), 24000)
  assert.equal(view.getUint32(28, true), 48000) // byteRate = 24000 * 2
  assert.equal(view.getUint16(32, true), 2) // blockAlign
  assert.equal(view.getUint16(34, true), 16)
  assert.equal(view.getUint32(40, true), 480)
})

test('PCMはWAVへ包み、それ以外は受信したContent-Typeのまま扱う', () => {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const wav = audioFormat.createPlayableAudioBlob(bytes, 'audio/pcm')
  assert.equal(wav.type, 'audio/wav')
  assert.equal(wav.size, 44 + 4)
  const mp3 = audioFormat.createPlayableAudioBlob(bytes, 'audio/mpeg')
  assert.equal(mp3.type, 'audio/mpeg')
  assert.equal(mp3.size, 4)
})

function attempt(index, firstChunkMs, status = 'success') {
  return {
    index,
    status,
    httpStatus: status === 'success' ? 200 : 400,
    timing: { requestStartedAt: 0 },
    metrics: {
      requestToHeadersMs: firstChunkMs,
      requestToFirstChunkMs: firstChunkMs,
      requestToCompleteMs: firstChunkMs + 100,
    },
  }
}

const baseResult = {
  modelId: 'qwen/qwen-audio-3.0-tts-flash',
  status: 'pending',
  timing: { requestStartedAt: 0 },
  metrics: { inputCharacterCount: 2, inputUtf8ByteCount: 6 },
}

test('連続生成の平均と、2回目以降だけの平均を分けて集計する', () => {
  const result = service.summarizeAttempts(baseResult, [attempt(1, 900), attempt(2, 300), attempt(3, 300)])
  assert.equal(result.status, 'success')
  // 先頭の試行の値は「1回目」としてそのまま残す。
  assert.equal(result.metrics.requestToFirstChunkMs, 900)
  assert.equal(result.metrics.averageRequestToFirstChunkMs, 500)
  assert.equal(result.metrics.warmAverageRequestToFirstChunkMs, 300)
  assert.equal(result.metrics.averageRequestToCompleteMs, 600)
  assert.equal(result.metrics.attemptCount, 3)
  assert.equal(result.metrics.successCount, 3)
  assert.equal(result.attempts.length, 3)
})

test('失敗した試行は平均から除き、1件でも成功すれば成功として扱う', () => {
  const result = service.summarizeAttempts(baseResult, [attempt(1, 400), attempt(2, 0, 'error'), attempt(3, 600)])
  assert.equal(result.status, 'success')
  assert.equal(result.metrics.successCount, 2)
  assert.equal(result.metrics.attemptCount, 3)
  assert.equal(result.metrics.averageRequestToFirstChunkMs, 500)
  assert.equal(result.metrics.warmAverageRequestToFirstChunkMs, 600)
  assert.equal(result.errorMessage, undefined)
})

test('全試行が失敗した場合は失敗として扱い、平均は算出しない', () => {
  const failed = { ...attempt(1, 0, 'error'), errorMessage: '400エラー' }
  const result = service.summarizeAttempts(baseResult, [failed])
  assert.equal(result.status, 'error')
  assert.equal(result.metrics.successCount, 0)
  assert.equal(result.metrics.averageRequestToFirstChunkMs, undefined)
  assert.equal(result.errorMessage, '400エラー')
})

test('1回だけの実行でも試行一覧と回数を残す', () => {
  const pending = service.createPendingTtsResult('hexgrad/kokoro-82m', '你好', { voiceId: 'zf_xiaoxiao', iterations: 1 })
  assert.equal(pending.voiceId, 'zf_xiaoxiao')
  assert.equal(pending.metrics.attemptCount, 1)
  assert.equal(pending.attempts.length, 0)
  const result = service.summarizeAttempts(pending, [attempt(1, 250)])
  assert.equal(result.metrics.attemptCount, 1)
  assert.equal(result.metrics.averageRequestToFirstChunkMs, 250)
  // 2回目以降が無い場合は比較対象が無いので未定義のままにする。
  assert.equal(result.metrics.warmAverageRequestToFirstChunkMs, undefined)
})
