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

const modelExports = {}
vm.runInNewContext(transpile('../src/data/openRouterTtsModels.ts'), { exports: modelExports })

const serviceExports = {}
vm.runInNewContext(transpile('../src/services/ttsDebug.ts'), {
  exports: serviceExports,
  TextEncoder,
  require: (specifier) => {
    if (specifier === '../data/openRouterTtsModels') return modelExports
    if (specifier === './storage') return { loadApiKey: () => '' }
    throw new Error('Unexpected module: ' + specifier)
  },
})

test('TTS候補モデルIDは重複せず、実行用メタデータを持つ', () => {
  const models = modelExports.OPENROUTER_TTS_MODELS
  assert.equal(new Set(models.map((model) => model.id)).size, models.length)
  assert.ok(models.every((model) => typeof model.supportsSpeed === 'boolean'))
  assert.ok(models.some((model) => model.id === 'fish-audio/s2-pro'))
})

test('Unicode文字数とUTF-8バイト数を区別する', () => {
  const units = serviceExports.countTextUnits('你😀')
  assert.equal(units.characters, 2)
  assert.equal(units.utf8Bytes, 7)
})

test('モデルごとの課金単位で概算料金を計算する', () => {
  assert.equal(serviceExports.estimateTtsCostUsd('qwen/qwen-audio-3.0-tts-flash', '你好'), 0.00003)
  assert.equal(serviceExports.estimateTtsCostUsd('fish-audio/s2-pro', '你好'), 0.00009)
  assert.equal(serviceExports.estimateTtsCostUsd('google/gemini-3.1-flash-tts-preview', '你好'), undefined)
  assert.equal(serviceExports.TTS_DEBUG_MAX_CHARACTERS, 1000)
})
