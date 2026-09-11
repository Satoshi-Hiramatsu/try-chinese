import type { TtsDebugResult, TtsDebugRun } from '../types'
import { DEBUG_RUN_STORES, loadRecentDebugRuns, saveDebugRun } from './debugStorage'

/** 一時URLはセッション外で無効になるため、各試行の分も含めて保存対象から外す。 */
function persistentResult(result: TtsDebugResult): TtsDebugResult {
  const { audioUrl: _audioUrl, attempts, ...stored } = result
  if (!attempts) return stored
  return {
    ...stored,
    attempts: attempts.map(({ audioUrl: _attemptAudioUrl, ...attempt }) => attempt),
  }
}

function persistentRun(run: TtsDebugRun): TtsDebugRun {
  return { ...run, results: run.results.map(persistentResult) }
}

export async function saveTtsDebugRun(run: TtsDebugRun): Promise<void> {
  await saveDebugRun(DEBUG_RUN_STORES.tts, run, persistentRun)
}

export async function loadRecentTtsDebugRuns(limit = 10): Promise<TtsDebugRun[]> {
  return await loadRecentDebugRuns<TtsDebugRun>(DEBUG_RUN_STORES.tts, limit)
}
