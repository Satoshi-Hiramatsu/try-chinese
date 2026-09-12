import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  readFileSync(new URL('../src/data/llmProbes.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText
const probes = {}
vm.runInNewContext(source, { exports: probes })

test('P0〜P4が昇順で揃いP4だけが無効', () => {
  assert.deepEqual(Array.from(probes.LLM_TOPIC_LEVELS, (topic) => topic.id), ['P0', 'P1', 'P2', 'P3', 'P4'])
  assert.equal(probes.LLM_TOPIC_LEVELS.find((topic) => topic.id === 'P4').enabled, false)
  assert.equal(probes.LLM_TOPIC_LEVELS.filter((topic) => topic.id !== 'P4').every((topic) => topic.enabled), true)
})

test('P4は全モデル不可、DeepSeekはP3不可', () => {
  assert.equal(probes.isModelAllowedForTopic('qwen/qwen3-max', 'P4'), false)
  assert.equal(probes.isModelAllowedForTopic('deepseek/deepseek-v4.1-flash', 'P3'), false)
  assert.equal(probes.isModelAllowedForTopic('thedrummer/cydonia-24b-v4.1', 'P3'), true)
})
