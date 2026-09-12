import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  readFileSync(new URL('../src/services/voiceCommand.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText
const exports = {}
vm.runInNewContext(source, { exports })

test('Chinese send command is removed only at the end of speech', () => {
  assert.deepEqual(
    { ...exports.parseVoiceSendCommand('我昨天去了电影院。发送', 'zh-CN') },
    { hasSendCommand: true, content: '我昨天去了电影院。' }
  )
  assert.equal(exports.parseVoiceSendCommand('请发送照片给我', 'zh-CN').hasSendCommand, false)
})

test('Japanese send command is removed only at the end of speech', () => {
  assert.deepEqual(
    { ...exports.parseVoiceSendCommand('今日は映画を見ました。送って！', 'ja-JP') },
    { hasSendCommand: true, content: '今日は映画を見ました。' }
  )
  assert.equal(exports.parseVoiceSendCommand('送ってほしい写真があります', 'ja-JP').hasSendCommand, false)
})

test('silence and ordinary speech never become a send command', () => {
  assert.deepEqual(
    { ...exports.parseVoiceSendCommand('', 'zh-CN') },
    { hasSendCommand: false, content: '' }
  )
  assert.equal(exports.parseVoiceSendCommand('那个……我想一想', 'zh-CN').hasSendCommand, false)
})

test('「送信」だけでも送信の合図になる', () => {
  for (const [transcript, content] of [
    ['今日は映画を見ました。送信', '今日は映画を見ました。'],
    ['今日は映画を見ました、送信して。', '今日は映画を見ました、'],
    ['そうしん', ''],
  ]) {
    assert.deepEqual(
      { ...exports.parseVoiceSendCommand(transcript, 'ja-JP') },
      { hasSendCommand: true, content }
    )
  }
  assert.equal(exports.parseVoiceSendCommand('送信ボタンを押しました', 'ja-JP').hasSendCommand, false)
})

test('中国語入力中でも「送信」で送れる', () => {
  assert.deepEqual(
    { ...exports.parseVoiceSendCommand('我昨天去了电影院。送信', 'zh-CN') },
    { hasSendCommand: true, content: '我昨天去了电影院。' }
  )
})
