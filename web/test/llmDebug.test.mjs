import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(relativePath) {
  const source = ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    Number, Math, Date, String, Array, Set, Boolean, Object, Infinity,
    require: () => ({}),
  })
  return exports
}

const llm = load('../src/services/llmDebug.ts')

test('必要な項目が揃っていれば検査を通る', () => {
  const check = llm.checkLlmSchema({
    reply: { zh: '我也很喜欢电影。', ja: '私も映画が好きです。' },
    expression: 'smile',
  })
  assert.equal(check.hasRequiredFields, true)
  assert.equal(check.zhIsChineseOnly, true)
  assert.equal(check.expressionIsValid, true)
  assert.equal(llm.describeSchemaIssues(check), '')
})

test('返答本文に仮名が混ざると検査に落ちる', () => {
  const check = llm.checkLlmSchema({
    reply: { zh: '我也喜欢アニメ。', ja: '私もアニメが好きです。' },
    expression: 'smile',
  })
  assert.equal(check.zhIsChineseOnly, false)
  assert.match(llm.describeSchemaIssues(check), /仮名/)
})

test('漢字のみの返答は仮名混入とみなさない', () => {
  assert.equal(llm.checkLlmSchema({ reply: { zh: '你好世界', ja: 'a' }, expression: 'joy' }).zhIsChineseOnly, true)
})

test('許可されていない表情は検査に落ちる', () => {
  const check = llm.checkLlmSchema({ reply: { zh: '你好', ja: 'a' }, expression: 'excited' })
  assert.equal(check.expressionIsValid, false)
  assert.match(llm.describeSchemaIssues(check), /表情/)
})

test('返答本文が空なら必須項目の欠落として扱う', () => {
  const check = llm.checkLlmSchema({ reply: { zh: '   ', ja: 'a' }, expression: 'smile' })
  assert.equal(check.hasRequiredFields, false)
  assert.equal(check.zhIsChineseOnly, false)
})

test('違反は1行にまとめて出る', () => {
  const issues = llm.describeSchemaIssues({
    hasRequiredFields: false,
    zhIsChineseOnly: false,
    expressionIsValid: false,
  })
  assert.equal(issues, '必須項目の欠落 / 中国語に仮名が混入 / 表情が不正')
})

test('実行を止める理由を条件ごとに返す', () => {
  const base = { message: '你好', selectedCount: 1, iterations: 1 }
  assert.equal(llm.getLlmDebugRunBlockReason(base), undefined)
  assert.equal(llm.getLlmDebugRunBlockReason({ ...base, message: '  ' }), 'empty-message')
  assert.equal(llm.getLlmDebugRunBlockReason({ ...base, selectedCount: 0 }), 'no-model')
  assert.equal(llm.getLlmDebugRunBlockReason({ ...base, iterations: 0 }), 'bad-iterations')
})

test('既定モデルは候補の先頭にあり、初期選択に入っている', () => {
  assert.equal(llm.LLM_CANDIDATES[0].id, llm.DEFAULT_LLM_MODEL)
  assert.equal(llm.LLM_CANDIDATES[0].featured, true)
})

test('検証用の発話には片言と日中混在が含まれる', () => {
  const ids = llm.LLM_DEBUG_PRESETS.map((preset) => preset.id)
  assert.ok(ids.includes('broken-zh'))
  assert.ok(ids.includes('mixed'))
})
