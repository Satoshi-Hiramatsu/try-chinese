/**
 * リクエストごとの OpenRouter API キーの解決と、所有者キーで代行するときの制限。
 *
 * 利用者がキーを持っていれば、それをそのまま上流へ渡す（BYO-AI）。
 * 持っていなければ Worker の環境変数のキー（所有者の無料専用キー）で代行するが、
 * このキーは無料モデル以外には使わせない。OpenRouter 側はキー単位で
 * モデルを制限できないため、ここで弾かないと所有者に課金が回る。
 */

export interface KeyEnv {
  OPENROUTER_API_KEY?: string
  OPENAI_API_KEY?: string
}

export interface ResolvedApiKey {
  key: string
  /** user: 利用者が持ち込んだキー / env: Worker の環境変数のキーで代行 */
  source: 'user' | 'env'
}

interface HeaderReader {
  req: { header: (name: string) => string | undefined }
  env?: KeyEnv
}

/** ヘッダー・本文の順に利用者のキーを探し、無ければ環境変数のキーで代行する。 */
export function resolveApiKey(c: HeaderReader, bodyKey?: string): ResolvedApiKey | undefined {
  const headerKey =
    c.req.header('x-openrouter-key') ||
    c.req.header('x-api-key') ||
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
  const userKey = (bodyKey || headerKey || '').trim()
  if (userKey) return { key: userKey, source: 'user' }
  const envKey = (c.env?.OPENROUTER_API_KEY || c.env?.OPENAI_API_KEY || '').trim()
  return envKey ? { key: envKey, source: 'env' } : undefined
}

/** OpenRouter の無料モデル。モデルIDの末尾が :free のものだけを無料とみなす。 */
export function isFreeModel(modelId: string): boolean {
  return /:free$/i.test(modelId.trim())
}

/** 所有者キーで代行するリクエストがそのモデルを使ってよいか。 */
export function isModelAllowedForKey(modelId: string, resolved: ResolvedApiKey): boolean {
  return resolved.source === 'user' || isFreeModel(modelId)
}

/** 利用者キーが無いときに 402 で返す案内。 */
export const FREE_MODE_PAID_MODEL_ERROR =
  'このモデルには OpenRouter API キーが必要です。キーを入れるか、無料モデルをお使いください。'

/** 環境変数の無料 LLM 一覧（カンマ区切り）。先頭から順に試す。 */
export function parseFreeModelList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '' && isFreeModel(id))
}
