import { Hono } from 'hono'
import type { ChatRequest, ChatResponse } from '../types'
import { callChatLLM, LlmRequestError } from '../lib/llm'
import { parseFreeModelList, resolveApiKey } from '../lib/apiKey'

export interface ChatEnv {
  OPENROUTER_API_KEY?: string
  OPENAI_API_KEY?: string
  OPENROUTER_MODEL?: string
  /**
   * 利用者キーが無いときに所有者キーで使う無料 LLM（カンマ区切り、先頭から順に試す）。
   * 無料モデルは混雑で 429 になりやすいため、予備を続けて書いておける。
   */
  OPENROUTER_FREE_MODELS?: string
}

/** 上流の状態番号のうち、そのまま利用者へ返す意味があるもの。 */
const PASS_THROUGH_STATUSES = new Set([402, 429])

/** 次の無料モデルを試す価値がある失敗か。残高切れは別のモデルでも同じなので試さない。 */
function shouldTryNextFreeModel(error: unknown): boolean {
  return !(error instanceof LlmRequestError && error.status === 402)
}

/**
 * 日本語訳として成立しているか。
 * 無料モデルは1〜2割の確率で ja に中国語をそのまま返す。
 * 日本語の文なら仮名がほぼ必ず含まれるので、それを目安にする。
 */
export function looksLikeJapanese(text: string | undefined): boolean {
  return /[぀-ヿ]/.test(text || '')
}

/** 無料モードで、返答の日本語訳が崩れているときに同じモデルでやり直す回数。 */
const FREE_MODE_JA_RETRIES = 1

const chatRoute = new Hono<{ Bindings: ChatEnv }>()

chatRoute.post('/chat', async (c) => {
  let body: ChatRequest
  try {
    body = await c.req.json<ChatRequest>()
  } catch {
    return c.json({ error: 'リクエストボディが有効な JSON ではありません。' }, 400)
  }

  const { message, friend, hskLevel, history, config, part } = body

  // 1. バリデーション
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return c.json({ error: 'message は必須の文字列です。' }, 400)
  }

  if (!friend || typeof friend !== 'object' || !friend.name) {
    return c.json({ error: 'friend (名前を含むオブジェクト) は必須です。' }, 400)
  }

  const levelNum = Number(hskLevel)
  if (isNaN(levelNum) || levelNum < 1 || levelNum > 6) {
    return c.json({ error: 'hskLevel は 1 から 6 の数値である必要があります。' }, 400)
  }

  // 2. API キーの取得（BYO-AI: リクエストヘッダー/ボディ優先、次に Workers 環境変数）
  const resolved = resolveApiKey(c, config?.llm?.apiKey)

  if (!resolved) {
    return c.json({
      error: 'APIキーが見つかりません。リクエストの config.llm.apiKey、x-api-key ヘッダー、または環境変数を設定してください。',
    }, 401)
  }

  // 3. モデルの解決
  //    利用者キー: リクエスト指定 > Workers 環境変数 > デフォルト値
  //    所有者キーで代行: 無料 LLM の一覧に固定し、リクエストの指定は無視する
  let candidateModels: (string | undefined)[]
  if (resolved.source === 'env') {
    candidateModels = parseFreeModelList(c.env?.OPENROUTER_FREE_MODELS)
    if (candidateModels.length === 0) {
      return c.json(
        { error: '会話には OpenRouter API キーが必要です。タイトル画面の「APIキー」から設定してください。' },
        402
      )
    }
  } else {
    candidateModels = [config?.llm?.model || c.env?.OPENROUTER_MODEL || undefined]
  }

  // 4. LLM 呼び出し。無料モデルは混雑しやすいので、失敗したら次の候補を試す。
  const resolvedPart = part === 'reply' || part === 'support' ? part : 'all'
  let lastError: unknown
  for (const [index, model] of candidateModels.entries()) {
    try {
      let result: ChatResponse = await callChatLLM({
        message,
        friend,
        hskLevel: levelNum,
        history,
        apiKey: resolved.key,
        model,
        part: resolvedPart,
      })
      // 無料モードだけ、日本語訳が崩れていたら同じモデルで少しだけやり直す。
      // 有料キーの経路は品質が安定しているので、待ち時間を増やさない。
      if (resolved.source === 'env' && resolvedPart !== 'support') {
        for (let retry = 0; retry < FREE_MODE_JA_RETRIES && !looksLikeJapanese(result.reply.ja); retry += 1) {
          result = await callChatLLM({
            message,
            friend,
            hskLevel: levelNum,
            history,
            apiKey: resolved.key,
            model,
            part: resolvedPart,
          })
        }
      }
      return c.json(result)
    } catch (error) {
      lastError = error
      if (index < candidateModels.length - 1 && shouldTryNextFreeModel(error)) continue
      break
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : '予期せぬエラーが発生しました。'
  if (lastError instanceof LlmRequestError && PASS_THROUGH_STATUSES.has(lastError.status)) {
    return c.json({ error: errorMessage }, lastError.status as 402 | 429)
  }
  return c.json({ error: errorMessage }, 500)
})

export default chatRoute
