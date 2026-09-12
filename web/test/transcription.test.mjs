import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  readFileSync(new URL('../src/services/transcription.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText

function setup(fetchImpl, apiKey = 'test-key') {
  const requests = []
  let exhausted = 0
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    AbortController,
    fetch: async (url, init) => {
      requests.push({ url, init })
      return await fetchImpl(url, init)
    },
    require: (specifier) => {
      if (specifier === './openRouterKey') {
        return {
          loadUsableApiKey: () => apiKey,
          markApiKeyExhausted: () => { exhausted += 1 },
        }
      }
      if (specifier === './recorder') {
        return { blobToBase64: async () => 'encoded-audio' }
      }
      return {}
    },
  })
  return { api: exports, requests, exhausted: () => exhausted }
}

const recording = {
  blob: { size: 128 },
  format: 'webm',
  mimeType: 'audio/webm',
  durationMs: 3000,
}

test('一発話の録音はSTTへ一度だけ送られ、その一括結果だけを返す', async () => {
  const s = setup(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ text: ' 我已经结婚了 ' }),
  }))

  const text = await s.api.transcribeRecording(recording, { language: 'zh-CN' })

  assert.equal(text, '我已经结婚了')
  assert.equal(s.requests.length, 1)
  assert.equal(s.requests[0].url, '/api/stt')
  const body = JSON.parse(s.requests[0].init.body)
  assert.deepEqual(
    { audio: body.audio, format: body.format, language: body.language, responseFormat: body.responseFormat },
    { audio: 'encoded-audio', format: 'webm', language: 'zh', responseFormat: 'json' },
  )
})

test('日本語入力はSTTの言語指定をjaにする', async () => {
  const s = setup(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ text: 'こんにちは' }),
  }))

  await s.api.transcribeRecording(recording, { language: 'ja-JP' })
  assert.equal(JSON.parse(s.requests[0].init.body).language, 'ja')
})

test('空の録音はSTTへ送らない', async () => {
  const s = setup(async () => { throw new Error('fetch must not run') })
  const text = await s.api.transcribeRecording({ ...recording, blob: { size: 0 } }, { language: 'zh-CN' })
  assert.equal(text, '')
  assert.equal(s.requests.length, 0)
})

test('STTの残高切れをAPIキー状態へ反映する', async () => {
  const s = setup(async () => ({
    ok: false,
    status: 402,
    json: async () => ({ error: '残高がありません。' }),
  }))

  await assert.rejects(
    s.api.transcribeRecording(recording, { language: 'zh-CN' }),
    /残高がありません/,
  )
  assert.equal(s.exhausted(), 1)
  assert.equal(s.requests.length, 1)
})

test('会話入力は録音STTを正本にし、ブラウザ認識はプレビューと合図にしか使わない', () => {
  const chatInput = readFileSync(new URL('../src/components/ChatInput.tsx', import.meta.url), 'utf8')
  assert.match(chatInput, /transcribeRecording/)
  assert.match(chatInput, /startRecording/)

  // ブラウザ認識のコールバック本体を切り出す。ここから本文や送信へ直接触れてはいけない。
  const start = chatInput.indexOf('createSpeechRecognizer({')
  assert.notEqual(start, -1)
  const end = chatInput.indexOf('recognizer.start()', start)
  assert.notEqual(end, -1)
  const recognizerBlock = chatInput.slice(start, end)
  assert.doesNotMatch(recognizerBlock, /textRef\.current\s*=/)
  assert.doesNotMatch(recognizerBlock, /setText\(/)
  assert.doesNotMatch(recognizerBlock, /sendContent\(/)
  assert.doesNotMatch(recognizerBlock, /onSendMessage/)
  // 本文へ入るのは録音の文字起こし結果だけ
  assert.match(recognizerBlock, /setPreview(Final|Interim)\(/)
})
