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
  vm.runInNewContext(source, { exports, Number, Math, Date, DOMException, require: () => ({}) })
  return exports
}

const runner = load('../src/services/debugRunner.ts')

const attempt = (index, status, metrics = {}) => ({ index, status, metrics })

test('反復回数は1〜5に丸められる', () => {
  assert.equal(runner.clampIterations(0), 1)
  assert.equal(runner.clampIterations(3), 3)
  assert.equal(runner.clampIterations(9), 5)
  assert.equal(runner.clampIterations(Number.NaN), 1)
})

test('平均は成功した試行だけから取る', () => {
  const attempts = [
    attempt(1, 'success', { requestToCompleteMs: 100 }),
    attempt(2, 'error', { requestToCompleteMs: 9999 }),
    attempt(3, 'success', { requestToCompleteMs: 200 }),
  ]
  const summary = runner.summarizeLatencies(attempts)
  assert.equal(summary.averageRequestToCompleteMs, 150)
  assert.equal(summary.attemptCount, 3)
  assert.equal(summary.successCount, 2)
})

test('ウォーム平均は1回目を除いて計算する', () => {
  const attempts = [
    attempt(1, 'success', { requestToFirstChunkMs: 900 }),
    attempt(2, 'success', { requestToFirstChunkMs: 300 }),
    attempt(3, 'success', { requestToFirstChunkMs: 500 }),
  ]
  const summary = runner.summarizeLatencies(attempts)
  assert.equal(summary.averageRequestToFirstChunkMs, 567)
  assert.equal(summary.warmAverageRequestToFirstChunkMs, 400)
})

test('計測値が無ければ平均は undefined になる', () => {
  const summary = runner.summarizeLatencies([attempt(1, 'error')])
  assert.equal(summary.averageRequestToCompleteMs, undefined)
  assert.equal(summary.warmAverageRequestToFirstChunkMs, undefined)
})

test('1回でも成功していれば全体は成功扱い', () => {
  assert.equal(runner.resolveAggregateStatus([attempt(1, 'error'), attempt(2, 'success')]), 'success')
})

test('成功が無く停止だけなら停止、失敗を含むなら失敗', () => {
  assert.equal(runner.resolveAggregateStatus([attempt(1, 'cancelled')]), 'cancelled')
  assert.equal(runner.resolveAggregateStatus([attempt(1, 'cancelled'), attempt(2, 'error')]), 'error')
  assert.equal(runner.resolveAggregateStatus([]), 'pending')
})

test('反復は指定回数だけ順に実行される', async () => {
  const seen = []
  const attempts = await runner.runDebugSequence({
    iterations: 3,
    signal: { aborted: false },
    runAttempt: async (index) => {
      seen.push(index)
      return attempt(index, 'success', { requestToCompleteMs: index * 10 })
    },
    createCancelled: (index) => attempt(index, 'cancelled'),
  })
  assert.deepEqual(seen, [1, 2, 3])
  assert.equal(attempts.length, 3)
})

test('停止済みの signal では1件も実行せず停止記録だけ積む', async () => {
  let called = 0
  const attempts = await runner.runDebugSequence({
    iterations: 3,
    signal: { aborted: true },
    runAttempt: async (index) => {
      called += 1
      return attempt(index, 'success')
    },
    createCancelled: (index) => attempt(index, 'cancelled'),
  })
  assert.equal(called, 0)
  assert.equal(attempts.length, 1)
  assert.equal(attempts[0].status, 'cancelled')
})

test('途中で停止したら以降は実行しない', async () => {
  const attempts = await runner.runDebugSequence({
    iterations: 4,
    signal: { aborted: false },
    runAttempt: async (index) => attempt(index, index === 2 ? 'cancelled' : 'success'),
    createCancelled: (index) => attempt(index, 'cancelled'),
  })
  assert.equal(attempts.length, 2)
})

test('残りがあるかどうかが進捗通知で分かる', async () => {
  const progress = []
  await runner.runDebugSequence({
    iterations: 2,
    signal: { aborted: false },
    runAttempt: async (index) => attempt(index, 'success'),
    createCancelled: (index) => attempt(index, 'cancelled'),
    onAttempt: (current, hasMore) => progress.push([current.length, hasMore]),
  })
  assert.deepEqual(progress, [[1, true], [2, false]])
})

test('経過時間は時刻が無ければ undefined のまま', () => {
  assert.equal(runner.elapsedSince(1000, 1250), 250)
  assert.equal(runner.elapsedSince(1000, undefined), undefined)
})

test('停止済み signal は中断エラーとして扱う', () => {
  assert.equal(runner.isAbortError(new Error('boom'), { aborted: true }), true)
  assert.equal(runner.isAbortError(new Error('boom'), { aborted: false }), false)
  assert.equal(runner.isAbortError(new DOMException('stop', 'AbortError')), true)
})
