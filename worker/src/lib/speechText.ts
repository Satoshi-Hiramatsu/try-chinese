/**
 * 表示する中国語と、読み上げに渡す中国語を分けて扱う。
 *
 * Fish Audio はテキスト正規化が弱く、算用数字を一桁ずつ読むことがある
 * （10000元 →「イチ・ゼロ・ゼロ・ゼロ・ゼロ元」）。Qwen や Gemini では
 * 起きないのでモデル固有の癖で、プロバイダ側では直せない。
 * そこで渡す前に漢数字へ変換する。
 *
 * 読み方は文脈で変わる（2026年は一桁ずつ、10000元は位取り）ため、
 * 一次変換は文脈を知っている LLM に任せる。ここはその保険で、
 * LLM が変換し忘れたときに機械的に救うための決定論的な実装。
 *
 * 副作用を持たない純粋関数だけを置く。
 */

const DIGITS = '零一二三四五六七八九'
const SMALL_UNITS = ['', '十', '百', '千'] as const
const GROUP_UNITS = ['', '万', '亿', '万亿'] as const

/** 一桁ずつ読む。年号・部屋番号・電話番号など、量ではない数に使う。 */
export function digitsToChinese(value: string): string {
  return value
    .split('')
    .map((char) => (char >= '0' && char <= '9' ? DIGITS[Number(char)] : char))
    .join('')
}

/** 1〜9999 を漢数字にする。内部のゼロは「零」で埋める。 */
function convertBelow10000(value: number): string {
  if (value === 0) return ''
  const digits = String(value).split('').map(Number)
  let result = ''
  let zeroPending = false

  for (let index = 0; index < digits.length; index += 1) {
    const digit = digits[index]
    const unitIndex = digits.length - 1 - index
    if (digit === 0) {
      // 先頭のゼロは書かない。途中のゼロだけ「零」として1つに畳む。
      if (result !== '') zeroPending = true
      continue
    }
    if (zeroPending) {
      result += DIGITS[0]
      zeroPending = false
    }
    result += DIGITS[digit] + SMALL_UNITS[unitIndex]
  }
  return result
}

/** 量として読む。10000 → 一万、1002 → 一千零二。 */
export function integerToChinese(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (value < 0) return '负' + integerToChinese(-value)
  if (value === 0) return DIGITS[0]

  const groups: number[] = []
  let rest = Math.floor(value)
  while (rest > 0) {
    groups.push(rest % 10000)
    rest = Math.floor(rest / 10000)
  }
  if (groups.length > GROUP_UNITS.length) return digitsToChinese(String(value))

  let result = ''
  let hasGap = false
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    if (group === 0) {
      if (result !== '') hasGap = true
      continue
    }
    // 上位の桁があり、間が空いているか千の位が欠けていれば「零」で繋ぐ。
    if (result !== '' && (hasGap || group < 1000)) result += DIGITS[0]
    hasGap = false
    result += convertBelow10000(group) + GROUP_UNITS[index]
  }

  // 10〜19 は「一十五」ではなく「十五」と読む。上位の桁があるときは畳まない。
  return value >= 10 && value < 20 ? result.replace(/^一十/, '十') : result
}

/** 電話番号のように長い数字の並びは、量ではないとみなす。 */
const DIGIT_BY_DIGIT_LENGTH = 7

/**
 * 算用数字を漢数字へ置き換える。
 *
 * 文脈で読み方が変わる部分だけを先に個別処理し、
 * 残りを量として読む。LLM の変換漏れを救うための保険なので、
 * 判断が割れるものは触らず、確実なものだけ変換する。
 */
export function normalizeDigitsForSpeech(text: string): string {
  return text
    // 年号は一桁ずつ。2026年 → 二零二六年
    .replace(/(\d{4})\s*年/g, (_match, year: string) => digitsToChinese(year) + '年')
    // 百分率は語順が反転する。50% → 百分之五十
    .replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, value: string) => '百分之' + numberToChinese(value))
    // 小数は「点」のあとを一桁ずつ。3.14 → 三点一四
    .replace(/\d+\.\d+/g, (match) => numberToChinese(match))
    // 残りの整数。長い並びは電話番号などとみなして一桁ずつ読む。
    .replace(/\d+/g, (match) =>
      match.length >= DIGIT_BY_DIGIT_LENGTH ? digitsToChinese(match) : integerToChinese(Number(match))
    )
}

/** 小数を含む数値文字列を漢数字にする。 */
function numberToChinese(value: string): string {
  const [whole, fraction] = value.split('.')
  const head = integerToChinese(Number(whole))
  return fraction === undefined ? head : `${head}点${digitsToChinese(fraction)}`
}

/**
 * 感情マーカー。英単語（自然言語の短い句も可）を括弧で囲む記法。
 *
 * Fish Audio は世代で括弧が違う。S2 系（S2 / S2.1）は [happy] の角括弧、
 * S1 は (happy) の丸括弧。認識されない括弧はタグではなく本文として
 * 読み上げられてしまうため、送信先に合わせて括弧を揃える必要がある。
 * LLM には角括弧で出させ、丸括弧は取りこぼしの救済として受け付ける。
 */
const MARKER_PATTERN = /[[(（]([a-zA-Z][a-zA-Z0-9_ -]*)[\])）]/g

/** マーカーを取り除く。文字数の比較や算用数字の検査に使う。 */
export function stripSpeechMarkers(text: string): string {
  return text.replace(MARKER_PATTERN, '').trim()
}

export type SpeechMarkerSyntax = 'square' | 'round' | 'none'

/**
 * モデルが解釈できるマーカーの括弧。
 * Fish Audio 以外は制御タグの記法を持たないので、タグを渡すと本文として読まれる。
 */
export function resolveMarkerSyntax(modelId: string): SpeechMarkerSyntax {
  if (/^fish-audio\/s1\b/i.test(modelId)) return 'round'
  if (/^fish-audio\//i.test(modelId)) return 'square'
  return 'none'
}

/** マーカーの括弧を送信先モデルの記法に揃える。解釈できないモデルには渡さない。 */
export function adaptSpeechMarkers(text: string, modelId: string): string {
  const syntax = resolveMarkerSyntax(modelId)
  if (syntax === 'none') return stripSpeechMarkers(text)
  const open = syntax === 'square' ? '[' : '('
  const close = syntax === 'square' ? ']' : ')'
  return text.replace(MARKER_PATTERN, (_match, tag: string) => open + tag + close)
}

const KANA_PATTERN = /[ぁ-ゟァ-ヿ]/

export type SpeechFallbackReason = 'empty' | 'has-digits' | 'has-kana' | 'length-mismatch'

export interface ResolvedSpeechText {
  /** 読み上げに渡す文字列。 */
  text: string
  /** LLM の出力を使わず機械変換に落とした場合の理由。 */
  fallbackReason?: SpeechFallbackReason
}

/** 書き換えすぎを検出する文字数の許容幅。マーカー付与と漢数字化ぶんの差を見込む。 */
const MIN_LENGTH_RATIO = 0.6
const MAX_LENGTH_RATIO = 2.5

/**
 * 読み上げ用テキストを決める。
 *
 * LLM が返した speech をそのまま信用すると、
 * 画面と違うことを喋る友達になりかねない。学習アプリとしては致命的なので、
 * 明らかに壊れている場合は表示テキストの機械変換に落とす。
 */
export function resolveSpeechText(zh: string, speech?: string): ResolvedSpeechText {
  const normalizedZh = normalizeDigitsForSpeech(zh)
  const fallback = (reason: SpeechFallbackReason): ResolvedSpeechText => ({
    text: normalizedZh,
    fallbackReason: reason,
  })

  if (!speech || speech.trim() === '') return fallback('empty')

  const bare = stripSpeechMarkers(speech)
  if (bare === '') return fallback('empty')
  // 算用数字が残っていれば変換し忘れ。機械変換で救う。
  if (/\d/.test(bare)) return fallback('has-digits')
  // かな・カナの混入は日本語が漏れている。表示テキスト側を読む。
  if (KANA_PATTERN.test(bare)) return fallback('has-kana')

  const ratio = Array.from(bare).length / Math.max(1, Array.from(normalizedZh).length)
  if (ratio < MIN_LENGTH_RATIO || ratio > MAX_LENGTH_RATIO) return fallback('length-mismatch')

  return { text: speech.trim() }
}
