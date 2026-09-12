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
  const base = { message: '你好', selectedFriendCount: 1, selectedCount: 1, iterations: 1 }
  assert.equal(llm.getLlmDebugRunBlockReason(base), undefined)
  assert.equal(llm.getLlmDebugRunBlockReason({ ...base, message: '  ' }), 'empty-message')
  assert.equal(llm.getLlmDebugRunBlockReason({ ...base, selectedFriendCount: 0 }), 'no-friend')
  assert.equal(llm.getLlmDebugRunBlockReason({ ...base, selectedCount: 0 }), 'no-model')
  assert.equal(llm.getLlmDebugRunBlockReason({ ...base, iterations: 0 }), 'bad-iterations')
  assert.equal(
    llm.getLlmDebugRunBlockReason({ ...base, selectedFriendCount: 5, selectedCount: 5, iterations: 3 }),
    'too-many-requests',
  )
})

test('本体の既定モデルは候補に含まれる', () => {
  assert.equal(llm.LLM_CANDIDATES[0].id, llm.DEFAULT_LLM_MODEL)
  assert.ok(llm.LLM_CANDIDATES.some((model) => model.id === llm.DEFAULT_LLM_MODEL))
})

test('初期選択はCydonia、Venice、Qwen3 Maxの3件', () => {
  const featured = Array.from(llm.LLM_CANDIDATES.filter((model) => model.featured), (model) => model.id).sort()
  assert.deepEqual(featured, [
    'cognitivecomputations/dolphin-mistral-24b-venice-edition',
    'qwen/qwen3-max',
    'thedrummer/cydonia-24b-v4.1',
  ])
})

test('候補モデルには根拠区分と構造化出力方式がある', () => {
  for (const model of llm.LLM_CANDIDATES) {
    assert.ok(['explicit-uncensored', 'roleplay-unmoderated', 'baseline'].includes(model.evidence))
    assert.ok(['json-schema', 'json-object'].includes(model.structuredOutput))
  }
})

test('検証用の発話には片言と日中混在が含まれる', () => {
  const ids = llm.LLM_DEBUG_PRESETS.map((preset) => preset.id)
  assert.ok(ids.includes('broken-zh'))
  assert.ok(ids.includes('mixed'))
})

test('拒否・はぐらかし・通常応答・破損を分類する', () => {
  const schema = { hasRequiredFields: true, zhIsChineseOnly: true, expressionIsValid: true }
  assert.equal(llm.classifyReply({ status: 'success', zh: '抱歉，我不能讨论这个。', ja: '', schema }), 'refuse')
  assert.equal(llm.classifyReply({ status: 'success', zh: '我们聊点别的吧。', ja: '', schema }), 'deflect')
  assert.equal(llm.classifyReply({ status: 'success', zh: '当然可以。', ja: 'もちろん。', schema }), 'comply')
  assert.equal(
    llm.classifyReply({ status: 'success', zh: 'もちろん', ja: 'もちろん。', schema: { ...schema, zhIsChineseOnly: false } }),
    'broken',
  )
  assert.equal(llm.classifyReply({ status: 'error', schema }), 'broken')
})

test('2モデル×3 Friendの6対象を生成し、2反復なら12試行になる', () => {
  const friends = [
    { id: 'a', name: 'A', personality: '', hobbies: [] },
    { id: 'b', name: 'B', personality: '', hobbies: [] },
    { id: 'c', name: 'C', personality: '', hobbies: [] },
  ]
  const targets = llm.buildLlmDebugTargets(friends, ['m1', 'm2'])
  assert.equal(targets.length, 6)
  assert.equal(targets.length * 2, 12)
  assert.deepEqual(targets.map((target) => `${target.friend.id}:${target.modelId}`), [
    'a:m1', 'a:m2', 'b:m1', 'b:m2', 'c:m1', 'c:m2',
  ])
})

test('永続化結果に入力・回答・添削・語彙・生エラーを含めない', () => {
  const stored = llm.createStoredLlmResult({
    modelId: 'm1',
    friendId: 'f1',
    friendName: 'Friend',
    status: 'success',
    zh: '本文',
    ja: '翻訳',
    pinyin: 'pin yin',
    errorMessage: 'upstream raw error',
    timing: { requestStartedAt: 1 },
    metrics: {},
    attempts: [{
      index: 1,
      status: 'success',
      zh: '本文',
      ja: '翻訳',
      correction: { hasCorrection: true, suggested: '添削' },
      vocabulary: [{ term: '語彙', pinyin: '', ja: '' }],
      errorMessage: 'raw',
      timing: { requestStartedAt: 1 },
      metrics: { requestToCompleteMs: 20 },
      autoClassification: 'comply',
    }],
  })
  const serialized = JSON.stringify(stored)
  assert.doesNotMatch(serialized, /本文|翻訳|添削|語彙|upstream|raw/)
  assert.match(serialized, /comply/)
})

test('並列実行数が指定値を超えず、結果順を保つ', async () => {
  let active = 0
  let maximum = 0
  const results = await llm.runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    return value * 10
  })
  assert.equal(maximum, 2)
  assert.deepEqual(Array.from(results), [10, 20, 30, 40, 50])
})
