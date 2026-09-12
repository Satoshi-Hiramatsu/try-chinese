import type {
  Friend,
  ChatMessage,
  BilingualReply,
  Correction,
  Expression,
  HobbyVocabulary,
  SampleReply,
} from '../types'
import { resolveExpression } from './expression'
import { fillPinyin } from './pinyin'
import { markApiKeyExhausted } from './openRouterKey'

export interface SendMessageOptions {
  message: string
  friend: Friend
  hskLevel: number
  history: ChatMessage[]
  /** 利用者の OpenRouter キー。無いときは呼び出し側で止める（Worker には投げない）。 */
  apiKey: string
  model?: string
  /**
   * 添削と趣味語彙が揃ったときの通知。
   * 返答より遅れて届くため、画面へは後から差し込む。
   */
  onSupport?: (support: SupportPart) => void
  /** 有効時だけ、Friend の返答に対する中国語サンプル3件を追加生成する。 */
  includeSampleReplies?: boolean
  /** サンプル回答が揃ったときの通知。通常の返答表示を待たせず後から差し込む。 */
  onSampleReplies?: (sampleReplies: SampleReply[]) => void
}

/** 会話の返答。音声を出し始めるのに要るのはここだけ。 */
export interface ReplyPart {
  reply: BilingualReply
  expression: Expression
}

/** 学習支援。学習者の発話だけから作れるので、返答を待たずに並行して作れる。 */
export interface SupportPart {
  correction: Correction
  vocabulary: HobbyVocabulary[]
}

export interface SendMessageResponse extends ReplyPart, SupportPart {}

type ChatPart = 'reply' | 'support' | 'samples'

interface ChatPayload {
  reply?: BilingualReply
  correction?: Correction
  vocabulary?: HobbyVocabulary[]
  sampleReplies?: SampleReply[]
  expression?: unknown
}

/** 直近6件程度の履歴をAPIの形式に整える。 */
function formatHistory(history: ChatMessage[]) {
  return history
    .slice(-6)
    .map((item) =>
      item.role === 'user'
        ? { role: 'user' as const, content: item.content || '' }
        : { role: 'assistant' as const, content: item.reply?.zh || '' }
    )
    .filter((item) => item.content.trim() !== '')
}

/** 残高切れ(402)のときの文言。キーの状態バッジからチャージ後の再確認へ誘導する。 */
export const API_KEY_EXHAUSTED_MESSAGE =
  'OpenRouter の残高が切れました。チャージしてから、キーの状態バッジで「確認」し直してください。'

async function postChat(
  options: SendMessageOptions,
  part: ChatPart,
  replyContext?: string
): Promise<Response> {
  const { message, friend, hskLevel, history, model, apiKey } = options

  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      message,
      friend,
      hskLevel,
      history: formatHistory(history),
      part,
      ...(replyContext ? { replyContext } : {}),
      config: { llm: { apiKey, model: model || undefined } },
    }),
  })
}

/**
 * 会話を1回送る。
 * 残高切れ(402)ならキーの状態を「残高切れ」にして止める。別のモデルへ黙って切り替えない。
 */
async function requestChat(
  options: SendMessageOptions,
  part: ChatPart,
  replyContext?: string
): Promise<ChatPayload> {
  const response = await postChat(options, part, replyContext)

  if (response.status === 402) {
    markApiKeyExhausted()
    throw new Error(API_KEY_EXHAUSTED_MESSAGE)
  }

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(errorData.error || `リクエストエラー (ステータス: ${response.status})`)
  }

  return (await response.json()) as ChatPayload
}

const EMPTY_SUPPORT: SupportPart = { correction: { hasCorrection: false }, vocabulary: [] }

/**
 * /api/chat にメッセージを送信する。
 *
 * 音声を出し始めるのに要るのは返答本文だけで、添削と語彙は無くても喋り出せる。
 * しかも添削の材料は学習者の発話だけなので、返答の生成を待つ必要がない。
 * 二つに割って同時に投げ、返答が揃った時点で返す。
 * 学習支援は遅れて届くので onSupport で受け取り、画面へ後から差し込む。
 */
export async function sendMessageToChatApi(options: SendMessageOptions): Promise<ReplyPart> {
  // 先に両方投げる。support の待ち時間は返答の裏に隠れる。
  const supportRequest = requestChat(options, 'support')
    .then(async (payload): Promise<SupportPart> => {
      const correction = payload.correction || { hasCorrection: false }
      const vocabulary = payload.vocabulary || []
      const [correctionPinyin, vocabularyPinyin] = await Promise.all([
        fillPinyin(correction.suggested || '', correction.pinyin),
        Promise.all(vocabulary.map((item) => fillPinyin(item.term, item.pinyin))),
      ])
      return {
        correction: { ...correction, pinyin: correctionPinyin },
        vocabulary: vocabulary.map((item, index) => ({ ...item, pinyin: vocabularyPinyin[index] })),
      }
    })
    .catch(() => {
      // 添削が取れなくても会話は続ける。返答だけで成立する。
      return EMPTY_SUPPORT
    })

  supportRequest.then((support) => options.onSupport?.(support)).catch(() => undefined)

  const payload = await requestChat(options, 'reply')
  const reply = payload.reply || { zh: '', ja: '', pinyin: '', hskLevel: options.hskLevel }
  const normalizedReply = { ...reply, pinyin: await fillPinyin(reply.zh, reply.pinyin) }

  if (options.includeSampleReplies && normalizedReply.zh) {
    void requestChat(options, 'samples', normalizedReply.zh)
      .then(async (samplePayload) => {
        const candidates = (samplePayload.sampleReplies || []).slice(0, 3)
        if (candidates.length !== 3) return
        const pinyin = await Promise.all(
          candidates.map((sample) => fillPinyin(sample.zh, sample.pinyin))
        )
        options.onSampleReplies?.(
          candidates.map((sample, index) => ({ ...sample, pinyin: pinyin[index] }))
        )
      })
      .catch(() => {
        // サンプル回答が取れなくても本体の会話は続ける。
      })
  }

  // ピンインは辞書で作る。LLM に作らせると多音字が揺れるうえ、
  // 出力トークンの3分の1を占めて返答そのものを待たせていた。
  return {
    reply: normalizedReply,
    expression: resolveExpression(payload.expression, reply.zh, reply.ja),
  }
}
