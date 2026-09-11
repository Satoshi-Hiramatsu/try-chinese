import type { SttDebugRun } from '../types'
import { DEBUG_RUN_STORES, loadRecentDebugRuns, saveDebugRun } from './debugStorage'

export async function saveSttDebugRun(run: SttDebugRun): Promise<void> {
  await saveDebugRun(DEBUG_RUN_STORES.stt, run)
}

export async function loadRecentSttDebugRuns(limit = 10): Promise<SttDebugRun[]> {
  return await loadRecentDebugRuns<SttDebugRun>(DEBUG_RUN_STORES.stt, limit)
}
