import type { TtsDebugResult, TtsDebugRun } from '../types'

const DATABASE_NAME = 'shabe-china-debug'
const DATABASE_VERSION = 1
const RUN_STORE = 'ttsDebugRuns'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(RUN_STORE)) {
        database.createObjectStore(RUN_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDBを開けませんでした。'))
  })
}

/** 一時URLはセッション外で無効になるため、各試行の分も含めて保存対象から外す。 */
function persistentResult(result: TtsDebugResult): TtsDebugResult {
  const { audioUrl: _audioUrl, attempts, ...stored } = result
  if (!attempts) return stored
  return {
    ...stored,
    attempts: attempts.map(({ audioUrl: _attemptAudioUrl, ...attempt }) => attempt),
  }
}

export async function saveTtsDebugRun(run: TtsDebugRun): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const database = await openDatabase()
  try {
    const storedRun: TtsDebugRun = { ...run, results: run.results.map(persistentResult) }
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(RUN_STORE, 'readwrite')
      transaction.objectStore(RUN_STORE).put(storedRun)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('検証結果を保存できませんでした。'))
      transaction.onabort = () => reject(transaction.error || new Error('検証結果の保存が中断されました。'))
    })
  } finally {
    database.close()
  }
}

export async function loadRecentTtsDebugRuns(limit = 10): Promise<TtsDebugRun[]> {
  if (typeof indexedDB === 'undefined') return []
  const database = await openDatabase()
  try {
    const runs = await new Promise<TtsDebugRun[]>((resolve, reject) => {
      const request = database.transaction(RUN_STORE, 'readonly').objectStore(RUN_STORE).getAll()
      request.onsuccess = () => resolve(request.result as TtsDebugRun[])
      request.onerror = () => reject(request.error || new Error('検証履歴を読み込めませんでした。'))
    })
    return runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, limit)
  } finally {
    database.close()
  }
}
