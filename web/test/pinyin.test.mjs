import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { pinyin as libraryPinyin } from 'pinyin-pro'

/** pinyin-pro は実物を渡す。依存の更新で出力形式が変わったら落ちるようにする。 */
function load(relativePath) {
  const source = ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const exports = {}
  vm.runInNewContext(source, {
    exports,
    String, Array, RegExp,
    require: (specifier) => (specifier === 'pinyin-pro' ? { pinyin: libraryPinyin } : {}),
  })
  return exports
}

const { toPinyin, containsChinese, fillPinyin } = load('../src/services/pinyin.ts')

test('声調記号つきのピンインを返す', async () => {
  assert.equal(await toPinyin('你好'), 'nǐ hǎo')
  assert.equal(await toPinyin('我喜欢看电影'), 'wǒ xǐ huan kàn diàn yǐng')
})

test('多音字は語の文脈で読み分ける', async () => {
  // 行: xíng と háng。行长 は háng zhǎng。
  assert.equal(await toPinyin('银行的行长'), 'yín háng de háng zhǎng')
  // 了: le と liǎo。了解 は liǎo jiě。
  assert.equal(await toPinyin('他了解了'), 'tā liǎo jiě le')
  // 重: zhòng と chóng。重要・重量ともに zhòng。
  assert.equal(await toPinyin('重要的重量'), 'zhòng yào de zhòng liàng')
})

test('英数字は音節に分解せずそのまま残す', async () => {
  // 分解すると「2026」が「2 0 2 6」になり、読みとしても表示としても壊れる。
  assert.equal(await toPinyin('2026年'), '2026 nián')
  assert.match(await toPinyin('你好，world'), /world/)
})

test('漢字を含まない文字列にはピンインを付けない', async () => {
  assert.equal(await toPinyin('こんにちは'), '')
  assert.equal(await toPinyin('hello'), '')
  assert.equal(await toPinyin(''), '')
  assert.equal(await toPinyin('   '), '')
})

test('漢字の有無を判定する', () => {
  assert.equal(containsChinese('你好'), true)
  assert.equal(containsChinese('映画'), true)
  assert.equal(containsChinese('ひらがな'), false)
  assert.equal(containsChinese('abc123'), false)
})

test('既にピンインがあれば作り直さない', async () => {
  // 保存済みの会話履歴やプリセットの表示を変えずに移行するため。
  assert.equal(await fillPinyin('你好', 'Nǐ hǎo!'), 'Nǐ hǎo!')
  assert.equal(await fillPinyin('你好', '   '), 'nǐ hǎo')
  assert.equal(await fillPinyin('你好', undefined), 'nǐ hǎo')
})

test('声調記号は表示側が解釈できる文字で返る', async () => {
  // TonePinyin.tsx は声調をこの文字集合で判定している。
  const TONE_MARKS = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/
  assert.match(await toPinyin('妈麻马骂'), TONE_MARKS)
})
