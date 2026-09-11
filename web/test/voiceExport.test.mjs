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
  vm.runInNewContext(source, { exports, Object, JSON, Number, String, Map, Set, Array })
  return exports
}

const { formatVoiceExport } = load('../src/data/voiceExport.ts')

test('friendId をキーに Voice を TypeScript 断片として並べる', () => {
  const text = formatVoiceExport(
    [
      {
        id: 'friend-meiling',
        name: '陈美玲 (Chen Meiling)',
        voice: {
          quality: 'natural',
          gender: 'female',
          ttsModel: 'fish-audio/s2.1-pro-free:free',
          voiceModel: '3c54bb55bf514bdc932f52ef81cb4023',
          voiceTuning: { temperature: 0.9 },
        },
      },
    ],
    '2026-09-11T00:00:00.000Z'
  )
  assert.match(text, /^\/\/ しゃべチャイナ 声設定の書き出し 2026-09-11T00:00:00.000Z\n/)
  assert.match(text, /export const EXPORTED_VOICES: Record<string, Voice> = \{\n/)
  assert.match(text, /  \/\/ 陈美玲 \(Chen Meiling\)\n  'friend-meiling': \{\n    "gender": "female",\n/)
  assert.match(text, /"voiceTuning": \{\n      "temperature": 0.9\n    \}\n  \},\n\}$/)
})

test('undefined と空文字は落とし、キーは名前順に固定する', () => {
  const text = formatVoiceExport(
    [{ id: 'f', name: 'x', voice: { quality: 'standard', gender: 'male', voiceName: '', rate: undefined, ttsModel: 'a' } }],
    'now'
  )
  assert.doesNotMatch(text, /voiceName|rate/)
  assert.ok(text.indexOf('"gender"') < text.indexOf('"quality"'))
  assert.ok(text.indexOf('"quality"') < text.indexOf('"ttsModel"'))
})

test('声が未設定の友達はコメントで示し、id のない友達は飛ばす', () => {
  const text = formatVoiceExport(
    [
      { id: 'f-empty', name: '未設定さん' },
      { name: 'id なし', voice: { quality: 'standard', gender: 'male' } },
    ],
    'now'
  )
  assert.match(text, /  \/\/ 未設定さん\n  \/\/ 'f-empty': 未設定\n\}$/)
  assert.doesNotMatch(text, /id なし/)
})
