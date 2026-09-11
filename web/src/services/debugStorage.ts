/**
 * 開発者モードの検証履歴を IndexedDB に保存する共通層。
 *
 * STT・LLM・TTS で保存する中身は違うが、
 * 「id で引ける実行記録を、新しい順に数件読み出す」形は同じなので、
 * ストア名だけを変えて同じ入出力を使う。
 *
 * v1 では TTS のストアしか無かった。v2 で STT と LLM のストアを足す。
 * 既存データは作り直さず、足りないストアを追加するだけで移行する。
 */

const DATABASE_NAME = 'shabe-china-debug'
const DATABASE_VERSION = 2

export const DEBUG_RUN_STORES = {
  tts: 'ttsDebugRuns',
  stt: 'sttDebugRuns',
  llm: 'llmDebugRuns',
} as const

export type DebugRunStore = (typeof DEBUG_RUN_STORES)[keyof typeof DEBUG_RUN_STORES]

/** 履歴として保存できる実行記録の最小条件。 */
export interface DebugRunRecord {
  id: string
  createdAt: string
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      // 既にあるストアはそのまま残す。v1 の TTS 履歴は失わない。
      for (const store of Object.values(DEBUG_RUN_STORES)) {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store, { keyPath: 'id' })
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDBを開けませんでした。'))
  })
}

/**
 * 実行記録を1件保存する。
 * sanitize は一時URLのようにセッションを跨げない値を落とすために使う。
 */
export async function saveDebugRun<TRun extends DebugRunRecord>(
  store: DebugRunStore,
  run: TRun,
  sanitize?: (run: TRun) => TRun
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const database = await openDatabase()
  try {
    const stored = sanitize ? sanitize(run) : run
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, 'readwrite')
      transaction.objectStore(store).put(stored)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('検証結果を保存できませんでした。'))
      transaction.onabort = () => reject(transaction.error || new Error('検証結果の保存が中断されました。'))
    })
  } finally {
    database.close()
  }
}

/** 新しい順に数件返す。 */
export async function loadRecentDebugRuns<TRun extends DebugRunRecord>(
  store: DebugRunStore,
  limit = 10
): Promise<TRun[]> {
  if (typeof indexedDB === 'undefined') return []
  const database = await openDatabase()
  try {
    const runs = await new Promise<TRun[]>((resolve, reject) => {
      const request = database.transaction(store, 'readonly').objectStore(store).getAll()
      request.onsuccess = () => resolve(request.result as TRun[])
      request.onerror = () => reject(request.error || new Error('検証履歴を読み込めませんでした。'))
    })
    return sortRecentFirst(runs).slice(0, limit)
  } finally {
    database.close()
  }
}

/** 新しい順に並べ替える。保存順は保証されないため読み出し側で揃える。 */
export function sortRecentFirst<TRun extends DebugRunRecord>(runs: readonly TRun[]): TRun[] {
  return [...runs].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
