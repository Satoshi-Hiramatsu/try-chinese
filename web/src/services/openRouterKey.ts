import { loadApiKey, loadApiKeyStatusRaw, saveApiKeyStatusRaw } from './storage'

/**
 * 利用者の OpenRouter API キーの状態。
 *
 * 金額は出さない。通常キーではアカウント残高が取れないため、
 * 「有効 / 無効 / 切れている」が分かれば足りる。
 *
 * - none: 未入力。無料モードで動く
 * - checking: 検査中
 * - valid: /api/openrouter/key が有効と答えた
 * - invalid: キーの文字列が間違い・削除済み
 * - exhausted: 会話や音声が 402 で返った、またはキーの上限を使い切っている
 * - unreachable: 検査できなかった。前回の結果を last に持つ
 */
export type ApiKeyState = 'none' | 'checking' | 'valid' | 'invalid' | 'exhausted' | 'unreachable'

export interface ApiKeyStatus {
  state: ApiKeyState
  /** OpenRouter 側でキーに付けた名前。 */
  label?: string
  /** 検査した時刻（ミリ秒）。none / checking では持たない。 */
  checkedAt?: number
  /** unreachable のとき、直前に確定していた状態。 */
  last?: ApiKeyState
}

export const NO_KEY_STATUS: ApiKeyStatus = { state: 'none' }

interface KeyCheckPayload {
  valid?: boolean
  label?: string
  exhausted?: boolean
}

const STATES: readonly ApiKeyState[] = ['none', 'checking', 'valid', 'invalid', 'exhausted', 'unreachable']

function isApiKeyState(value: unknown): value is ApiKeyState {
  return typeof value === 'string' && (STATES as readonly string[]).includes(value)
}

/** キャッシュから状態を復元する。壊れていれば捨てる。検査中のまま残っていたら未確認扱いにする。 */
export function loadApiKeyStatus(): ApiKeyStatus | null {
  const raw = loadApiKeyStatusRaw()
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isApiKeyState(record.state) || record.state === 'checking') return null
  return {
    state: record.state,
    label: typeof record.label === 'string' ? record.label : undefined,
    checkedAt: typeof record.checkedAt === 'number' ? record.checkedAt : undefined,
    last: isApiKeyState(record.last) ? record.last : undefined,
  }
}

type Listener = (status: ApiKeyStatus) => void
const listeners = new Set<Listener>()

/** 状態の変化を購読する。会話や音声の途中で 402 を受けたときに画面へ伝えるために使う。 */
export function subscribeApiKeyStatus(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 状態を保存して購読者へ知らせる。checking は保存しない（起動時に残ると意味を持たないため）。 */
export function publishApiKeyStatus(status: ApiKeyStatus): void {
  if (status.state !== 'checking') saveApiKeyStatusRaw(status.state === 'none' ? null : status)
  for (const listener of listeners) listener(status)
}

/**
 * キーを Worker 経由で検査する。
 * 通信できなかったときは unreachable にし、直前の確定状態を last に残す。
 */
export async function checkApiKey(apiKey: string, previous?: ApiKeyStatus | null): Promise<ApiKeyStatus> {
  const trimmed = apiKey.trim()
  if (!trimmed) return NO_KEY_STATUS
  const checkedAt = Date.now()
  const lastKnown = previous && previous.state !== 'checking' && previous.state !== 'none'
    ? previous.state === 'unreachable' ? previous.last : previous.state
    : undefined
  try {
    const response = await fetch('/api/openrouter/key', { headers: { 'x-api-key': trimmed } })
    if (!response.ok) return { state: 'unreachable', last: lastKnown, checkedAt }
    const payload = (await response.json()) as KeyCheckPayload
    if (!payload.valid) return { state: 'invalid', checkedAt }
    return { state: payload.exhausted ? 'exhausted' : 'valid', label: payload.label, checkedAt }
  } catch {
    return { state: 'unreachable', last: lastKnown, checkedAt }
  }
}

/**
 * 会話や音声が OpenRouter から 402 で返ったときに呼ぶ。
 * 以後は無料モードで動き、再検査で有効に戻るまでキーを送らない。
 */
export function markApiKeyExhausted(): void {
  publishApiKeyStatus({ state: 'exhausted', checkedAt: Date.now() })
}

/**
 * その状態のキーを Worker へ送ってよいか。
 * 無効・残高切れは送っても失敗するだけなので、無料モードに落とす。
 * 検査できなかったキーは送る（前回無効と分かっている場合を除く）。
 */
export function isApiKeyUsable(status: ApiKeyStatus | null | undefined): boolean {
  if (!status) return true
  switch (status.state) {
    case 'invalid':
    case 'exhausted':
      return false
    case 'unreachable':
      return status.last !== 'invalid' && status.last !== 'exhausted'
    default:
      return true
  }
}

/**
 * 実際にリクエストへ載せるキー。未入力、または無効・残高切れと分かっているときは空。
 * speech.ts / api.ts はこれが空なら無料モードとして Worker に任せる。
 */
export function loadUsableApiKey(): string {
  const key = loadApiKey()
  if (!key) return ''
  return isApiKeyUsable(loadApiKeyStatus()) ? key : ''
}

/** タイトル画面のメニューや設定画面に添える短い状態表示。 */
export function formatApiKeyStatusNote(status: ApiKeyStatus): string {
  switch (status.state) {
    case 'none':
      return '未設定 · 無料モードで動きます'
    case 'checking':
      return '確認中…'
    case 'valid':
      return '有効 · AI音声で話せます'
    case 'invalid':
      return '無効なキーです · タップして確認'
    case 'exhausted':
      return '残高切れ · 無料モードで動きます'
    case 'unreachable':
      return status.last
        ? `確認できませんでした · 前回: ${formatApiKeyStateLabel(status.last)}`
        : '確認できませんでした'
  }
}

/** 状態の短い名前。バッジや「前回: 有効」の表示に使う。 */
export function formatApiKeyStateLabel(state: ApiKeyState): string {
  switch (state) {
    case 'none':
      return '無料モード'
    case 'checking':
      return '確認中'
    case 'valid':
      return '有効'
    case 'invalid':
      return 'キー無効'
    case 'exhausted':
      return '残高切れ'
    case 'unreachable':
      return '未確認'
  }
}
