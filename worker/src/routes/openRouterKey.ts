import { Hono } from 'hono'

/**
 * 利用者が入れた OpenRouter API キーの検査。
 *
 * OpenRouter の `GET /api/v1/key` はキー自身の情報（名前・使用額・上限）を返す。
 * ここでは「有効か」と「上限を使い切っていないか」だけを画面に伝える。
 * アカウント残高は管理キーでしか取れないため扱わない。
 *
 * Worker の環境変数のキーへは絶対にフォールバックしない。
 * 所有者のキーの状態を利用者に見せる理由がないうえ、
 * 「未入力なのに有効と出る」という誤解を生むため。
 */

const KEY_INFO_URL = 'https://openrouter.ai/api/v1/key'
const UPSTREAM_TIMEOUT_MS = 8000

export interface KeyCheckResponse {
  valid: boolean
  /** OpenRouter 側でキーに付けた名前。 */
  label?: string
  /** キーの上限までの残り(USD)。上限なしのキーは null。 */
  limitRemaining?: number | null
  /** 上限を使い切っている。valid でも会話は 402 になる。 */
  exhausted?: boolean
}

/** 上流の応答から、画面に要る項目だけを取り出す。 */
export function normalizeKeyInfo(payload: unknown): KeyCheckResponse {
  const data =
    payload && typeof payload === 'object' && 'data' in payload && payload.data && typeof payload.data === 'object'
      ? (payload.data as Record<string, unknown>)
      : {}
  const label = typeof data.label === 'string' && data.label.trim() !== '' ? data.label.trim() : undefined
  const limitRemaining =
    typeof data.limit_remaining === 'number' && Number.isFinite(data.limit_remaining) ? data.limit_remaining : null
  return {
    valid: true,
    label,
    limitRemaining,
    exhausted: limitRemaining !== null && limitRemaining <= 0,
  }
}

const openRouterKeyRoute = new Hono()

openRouterKeyRoute.get('/openrouter/key', async (c) => {
  const apiKey =
    c.req.header('x-openrouter-key') ||
    c.req.header('x-api-key') ||
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
  if (!apiKey || apiKey.trim() === '') {
    return c.json({ error: '検査するAPIキーを x-api-key ヘッダーで指定してください。' }, 400)
  }

  const noStore = { 'Cache-Control': 'no-store' }
  let upstream: Response
  try {
    upstream = await fetch(KEY_INFO_URL, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    return c.json({ error: 'OpenRouter に接続できませんでした。' }, 502, noStore)
  }

  // 401 は「そのキーが無効」という確定した答えなので、エラーではなく結果として返す。
  if (upstream.status === 401 || upstream.status === 403) {
    return c.json<KeyCheckResponse>({ valid: false }, 200, noStore)
  }
  if (!upstream.ok) {
    return c.json({ error: `OpenRouter が応答しませんでした (${upstream.status})。` }, 502, noStore)
  }

  const payload = await upstream.json().catch(() => undefined)
  return c.json<KeyCheckResponse>(normalizeKeyInfo(payload), 200, noStore)
})

export default openRouterKeyRoute
