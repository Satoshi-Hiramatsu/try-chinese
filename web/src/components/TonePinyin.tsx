import { useMemo } from 'react'

interface TonePinyinProps {
  pinyin: string
  className?: string
  enableColoring?: boolean
}

// 声調記号の正規表現
const TONE_1_REGEX = /[āēīōūǖĀĒĪŌŪǕ]/
const TONE_2_REGEX = /[áéíóúǘÁÉÍÓÚǗ]/
const TONE_3_REGEX = /[ǎěǐǒǔǚǍĚǏǑǓǙ]/
const TONE_4_REGEX = /[àèìòùǜÀÈÌÒÙǛ]/

// 声調番号を判定
function getTone(syllable: string): 1 | 2 | 3 | 4 | 0 {
  if (TONE_1_REGEX.test(syllable)) return 1
  if (TONE_2_REGEX.test(syllable)) return 2
  if (TONE_3_REGEX.test(syllable)) return 3
  if (TONE_4_REGEX.test(syllable)) return 4
  return 0
}

// 声調に応じたTailwindカラークラス
function getToneColorClass(tone: 1 | 2 | 3 | 4 | 0, enabled: boolean): string {
  if (!enabled) return 'text-stone-600 font-normal'
  switch (tone) {
    case 1:
      return 'text-rose-600 font-medium' // 第1声: 落ち着いたローズ
    case 2:
      return 'text-amber-600 font-medium' // 第2声: 温かみのあるアンバー
    case 3:
      return 'text-emerald-600 font-medium' // 第3声: エメラルドグリーン
    case 4:
      return 'text-sky-600 font-medium' // 第4声: スカイブルー
    case 0:
    default:
      return 'text-stone-400 font-normal' // 軽声: グレー
  }
}

/**
 * ピンインを音節・単語ごとに色分けして表示するコンポーネント
 */
export function TonePinyin({
  pinyin,
  className = '',
  enableColoring = false,
}: TonePinyinProps) {
  const parts = useMemo(() => {
    if (!pinyin) return []

    // 単語/音節（アルファベット＋ダイアクリティカルマーク）と、それ以外（空白・記号）に分割
    // 例: "Nǐ hǎo!" -> ["Nǐ", " ", "hǎo", "!"]
    const tokens: Array<{ text: string; isWord: boolean; tone: 1 | 2 | 3 | 4 | 0 }> = []
    const regex = /([a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]+|[^a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]+)/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(pinyin)) !== null) {
      const part = match[0]
      const isWord = /[a-zA-ZāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]/.test(part)
      tokens.push({
        text: part,
        isWord,
        tone: isWord ? getTone(part) : 0,
      })
    }

    return tokens
  }, [pinyin])

  if (!pinyin) return null

  return (
    <span className={`font-mono inline-block tracking-wide select-text ${className}`}>
      {parts.map((p, idx) => {
        if (!p.isWord) {
          return (
            <span
              key={idx}
              className={enableColoring ? 'text-stone-400 select-none' : 'text-stone-500'}
            >
              {p.text}
            </span>
          )
        }
        return (
          <span key={idx} className={getToneColorClass(p.tone, enableColoring)}>
            {p.text}
          </span>
        )
      })}
    </span>
  )
}
