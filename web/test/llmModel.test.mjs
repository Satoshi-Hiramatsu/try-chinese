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
  vm.runInNewContext(source, { exports, Object, String })
  return exports
}

const { DEFAULT_LLM_MODEL, PRESET_LLM_MODELS, resolveLlmModel } = load('../src/data/llmModel.ts')

test('上書きが無ければ固定モデルで、上書き中とは扱わない', () => {
  for (const value of [null, undefined, '', '   ', DEFAULT_LLM_MODEL, ` ${DEFAULT_LLM_MODEL} `]) {
    const resolved = resolveLlmModel(value)
    assert.equal(resolved.model, DEFAULT_LLM_MODEL)
    assert.equal(resolved.isOverridden, false)
  }
})

test('別のモデルが入っていれば、それを上書き中として返す', () => {
  const resolved = resolveLlmModel(' google/gemini-2.5-flash ')
  assert.equal(resolved.model, 'google/gemini-2.5-flash')
  assert.equal(resolved.isOverridden, true)
})

test('候補の先頭は固定モデル', () => {
  assert.equal(PRESET_LLM_MODELS[0].id, DEFAULT_LLM_MODEL)
})
