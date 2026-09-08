import type { Expression } from '../types'
import { isExpression } from '../types'

/**
 * LLM が expression を返さなかった場合のフォールバック推定。
 *
 * 返答本文（中国語）と日本語訳の表層的な手がかりから表情を推定する。
 * 判定は「感情が強いもの」から順に評価し、最初に一致したものを採用する。
 */

interface Rule {
  expression: Expression
  patterns: RegExp[]
}

const RULES: Rule[] = [
  {
    expression: 'laugh',
    patterns: [/哈哈|嘻嘻|呵呵|嘿嘿/, /笑っ|わはは|あはは/],
  },
  {
    expression: 'sad',
    patterns: [
      /对不起|抱歉|难过|可惜|遗憾|伤心|不好意思，我不|太可惜/,
      /ごめん|残念|悲し|申し訳/,
    ],
  },
  {
    expression: 'angry',
    patterns: [/生气|讨厌|气死|不行！|真过分|别这样/, /怒っ|ひどい|むかつ/],
  },
  {
    expression: 'surprised',
    patterns: [/真的吗|哇[！!]|天哪|不会吧|居然|竟然|好厉害/, /えっ|びっくり|まさか|本当に[！?]/],
  },
  {
    expression: 'shy',
    patterns: [/害羞|不好意思|你过奖|哪里哪里|谢谢夸奖/, /照れ|恥ずかし|褒めすぎ/],
  },
  {
    expression: 'joy',
    patterns: [
      /太好了|太棒了|真棒|好开心|高兴|我喜欢|很喜欢|最喜欢|期待|真不错|加油/,
      /うれし|嬉し|楽しみ|やった|素敵/,
    ],
  },
  {
    expression: 'thinking',
    patterns: [/嗯[…\.]|让我想想|可能|也许|大概|不太确定/, /うーん|そうだな|考え/],
  },
  {
    expression: 'wink',
    patterns: [/试试看|下次|秘密|悄悄|你猜/, /やってみ|お楽しみ|内緒/],
  },
]

export function inferExpression(zh: string, ja = ''): Expression {
  const text = `${zh}\n${ja}`

  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      return rule.expression
    }
  }

  // 疑問文は問いかけの表情、感嘆符は明るい表情に寄せる
  if (/[？?]/.test(zh)) return 'smile'
  if (/[！!]/.test(zh)) return 'joy'
  return 'neutral'
}

/**
 * API 応答の expression を検証し、不正・未指定ならテキストから推定する。
 */
export function resolveExpression(raw: unknown, zh: string, ja = ''): Expression {
  if (isExpression(raw)) return raw
  return inferExpression(zh, ja)
}
