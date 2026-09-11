import { describe, it, expect } from 'vitest'
import {
  digitsToChinese,
  integerToChinese,
  normalizeDigitsForSpeech,
  adaptSpeechMarkers,
  resolveMarkerSyntax,
  resolveSpeechText,
  stripSpeechMarkers,
} from '../src/lib/speechText'

describe('量としての漢数字', () => {
  it('位取りで読む', () => {
    expect(integerToChinese(3)).toBe('三')
    expect(integerToChinese(20)).toBe('二十')
    expect(integerToChinese(350)).toBe('三百五十')
    expect(integerToChinese(10000)).toBe('一万')
    expect(integerToChinese(12345)).toBe('一万二千三百四十五')
  })

  it('10〜19は先頭の一を落とす', () => {
    expect(integerToChinese(10)).toBe('十')
    expect(integerToChinese(15)).toBe('十五')
    // 上位の桁があるときは落とさない。
    expect(integerToChinese(115)).toBe('一百一十五')
  })

  it('途中のゼロは零で繋ぐ', () => {
    expect(integerToChinese(1002)).toBe('一千零二')
    expect(integerToChinese(1020)).toBe('一千零二十')
    expect(integerToChinese(803)).toBe('八百零三')
    expect(integerToChinese(100000001)).toBe('一亿零一')
  })

  it('ゼロと負の数も読める', () => {
    expect(integerToChinese(0)).toBe('零')
    expect(integerToChinese(-5)).toBe('负五')
  })
})

describe('一桁ずつの読み', () => {
  it('数字だけを置き換えて並びは保つ', () => {
    expect(digitsToChinese('2026')).toBe('二零二六')
    expect(digitsToChinese('080-1234')).toBe('零八零-一二三四')
  })
})

describe('算用数字の正規化', () => {
  it('量は位取りで読む', () => {
    // これが「イチ・ゼロ・ゼロ・ゼロ・ゼロ元」と読まれる問題への対処。
    expect(normalizeDigitsForSpeech('这个耳机10000元')).toBe('这个耳机一万元')
  })

  it('年号は一桁ずつ読む', () => {
    expect(normalizeDigitsForSpeech('2026年2月3日发货')).toBe('二零二六年二月三日发货')
  })

  it('百分率は語順が反転する', () => {
    expect(normalizeDigitsForSpeech('折扣是50%')).toBe('折扣是百分之五十')
  })

  it('小数は点のあとを一桁ずつ読む', () => {
    expect(normalizeDigitsForSpeech('圆周率是3.14')).toBe('圆周率是三点一四')
  })

  it('長い数字の並びは量として読まない', () => {
    // 電話番号を位取りで読むと意味が通らない。
    expect(normalizeDigitsForSpeech('电话是13812345678')).toBe('电话是一三八一二三四五六七八')
  })

  it('数字が無ければそのまま返す', () => {
    expect(normalizeDigitsForSpeech('我喜欢看电影')).toBe('我喜欢看电影')
  })
})

describe('感情マーカーの除去', () => {
  it('英字を角括弧で囲んだ記法を落とす', () => {
    expect(stripSpeechMarkers('[excited]真的吗？[laughing]我也喜欢。')).toBe('真的吗？我也喜欢。')
    expect(stripSpeechMarkers('[in a hurry tone]快点！')).toBe('快点！')
  })

  it('丸括弧の旧記法も落とす', () => {
    expect(stripSpeechMarkers('(excited)真的吗？(laugh)我也喜欢。')).toBe('真的吗？我也喜欢。')
    expect(stripSpeechMarkers('（happy）你好')).toBe('你好')
  })

  it('中国語の括弧書きは残す', () => {
    expect(stripSpeechMarkers('这个（很重要）')).toBe('这个（很重要）')
    expect(stripSpeechMarkers('这个[很重要]')).toBe('这个[很重要]')
  })
})

describe('感情マーカーの記法変換', () => {
  it('Fish Audio S2 系は角括弧、S1 は丸括弧、それ以外は持たない', () => {
    expect(resolveMarkerSyntax('fish-audio/s2.1-pro')).toBe('square')
    expect(resolveMarkerSyntax('fish-audio/s2.1-pro-free:free')).toBe('square')
    expect(resolveMarkerSyntax('fish-audio/s2-pro')).toBe('square')
    expect(resolveMarkerSyntax('fish-audio/s1')).toBe('round')
    expect(resolveMarkerSyntax('hexgrad/kokoro-82m')).toBe('none')
    expect(resolveMarkerSyntax('qwen/qwen-audio-3.0-tts-flash')).toBe('none')
  })

  it('S2.1 には角括弧で渡し、丸括弧で来ても角括弧に揃える', () => {
    expect(adaptSpeechMarkers('[excited]真的吗？', 'fish-audio/s2.1-pro')).toBe('[excited]真的吗？')
    expect(adaptSpeechMarkers('(excited)真的吗？(laughing)好。', 'fish-audio/s2.1-pro')).toBe('[excited]真的吗？[laughing]好。')
  })

  it('S1 には丸括弧で渡す', () => {
    expect(adaptSpeechMarkers('[excited]真的吗？', 'fish-audio/s1')).toBe('(excited)真的吗？')
  })

  it('タグを解釈しないモデルには渡さない', () => {
    // 認識されないタグは本文として読み上げられてしまう。
    expect(adaptSpeechMarkers('[excited]真的吗？', 'hexgrad/kokoro-82m')).toBe('真的吗？')
    expect(adaptSpeechMarkers('(excited)真的吗？', 'qwen/qwen-audio-3.0-tts-flash')).toBe('真的吗？')
  })
})

describe('読み上げテキストの決定', () => {
  const zh = '这个耳机10000元，我觉得有点贵。'

  it('マーカー付きの発話テキストはそのまま使う', () => {
    const speech = '[excited]这个耳机一万元，我觉得有点贵。'
    expect(resolveSpeechText(zh, speech)).toEqual({ text: speech })
  })

  it('未指定なら表示テキストを機械変換して読む', () => {
    const result = resolveSpeechText(zh)
    expect(result.fallbackReason).toBe('empty')
    expect(result.text).toContain('一万元')
  })

  it('算用数字が残っていれば機械変換に落とす', () => {
    // LLM が変換を忘れた場合。そのまま渡すと一桁ずつ読まれる。
    const result = resolveSpeechText(zh, '这个耳机10000元，我觉得有点贵。')
    expect(result.fallbackReason).toBe('has-digits')
    expect(result.text).toContain('一万元')
  })

  it('かなが混ざっていれば機械変換に落とす', () => {
    const result = resolveSpeechText(zh, '这个耳机は一万元です。')
    expect(result.fallbackReason).toBe('has-kana')
  })

  it('文章を書き換えていれば機械変換に落とす', () => {
    // 画面と違うことを喋る友達になっては学習にならない。
    const result = resolveSpeechText(zh, '好的。')
    expect(result.fallbackReason).toBe('length-mismatch')
  })

  it('漢数字化による文字数の減りは書き換えとみなさない', () => {
    // 10000元(6文字) が 一万元(3文字) になっても正当な変換。
    const result = resolveSpeechText('10000元', '一万元')
    expect(result.fallbackReason).toBeUndefined()
    expect(result.text).toBe('一万元')
  })

  it('マーカーだけで中身が無ければ機械変換に落とす', () => {
    expect(resolveSpeechText(zh, '[excited]').fallbackReason).toBe('empty')
  })
})
