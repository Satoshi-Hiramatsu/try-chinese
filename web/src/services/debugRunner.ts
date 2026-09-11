/**
 * 開発者モードの共通計測基盤。
 *
 * STT・LLM・TTS のどれも「開始 → 初回応答 → 完了」の3点と、
 * 同じ条件での反復実行の平均という同じ形で測る。
 * 段ごとに違うのは「1回の試行をどう実行するか」だけなので、
 * その差分だけを呼び出し側から渡してもらう。
 *
 * 副作用を持たない純粋関数と、実行関数を受け取るループだけを置く
 * （web/test から DOM なしで読めるようにするため）。
 */

export const DEBUG_MAX_ITERATIONS = 5
export const DEBUG_DEFAULT_ITERATIONS = 3

export type DebugStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled'

/** 1回分の試行で記録する時刻。段によって埋まらない項目がある。 */
export interface DebugTiming {
  requestStartedAt: number
  responseHeadersAt?: number
  firstChunkAt?: number
  responseCompletedAt?: number
}

/** 段をまたいで同じ意味を持つ所要時間。 */
export interface DebugLatencyMetrics {
  requestToHeadersMs?: number
  requestToFirstChunkMs?: number
  requestToCompleteMs?: number
}

/** 集計に必要な最小限の形。各段の試行型はこれを満たしていればよい。 */
export interface DebugAttemptLike {
  index: number
  status: DebugStatus
  metrics: DebugLatencyMetrics
  errorMessage?: string
}

export interface DebugLatencySummary {
  attemptCount: number
  successCount: number
  averageRequestToHeadersMs?: number
  averageRequestToFirstChunkMs?: number
  averageRequestToCompleteMs?: number
  /** 2回目以降だけの平均。ウォームアップの影響を除いて比較するために使う。 */
  warmAverageRequestToFirstChunkMs?: number
}

type LatencyKey = keyof DebugLatencyMetrics

/** 反復回数を許容範囲に丸める。 */
export function clampIterations(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.min(DEBUG_MAX_ITERATIONS, Math.floor(value)))
}

export function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

/** 成功した試行の所要時間だけを集める。失敗や停止は平均を歪めるため数えない。 */
export function collectLatencies(attempts: readonly DebugAttemptLike[], key: LatencyKey): number[] {
  return attempts
    .filter((attempt) => attempt.status === 'success')
    .map((attempt) => attempt.metrics[key])
    .filter((value): value is number => value !== undefined)
}

/**
 * 各試行の計測値をまとめる。
 * 1回目はコネクション確立やモデルのウォームアップを含むため、
 * 2回目以降だけの平均も併せて出す。
 */
export function summarizeLatencies(attempts: readonly DebugAttemptLike[]): DebugLatencySummary {
  const warm = attempts.slice(1)
  return {
    attemptCount: attempts.length,
    successCount: attempts.filter((attempt) => attempt.status === 'success').length,
    averageRequestToHeadersMs: average(collectLatencies(attempts, 'requestToHeadersMs')),
    averageRequestToFirstChunkMs: average(collectLatencies(attempts, 'requestToFirstChunkMs')),
    averageRequestToCompleteMs: average(collectLatencies(attempts, 'requestToCompleteMs')),
    warmAverageRequestToFirstChunkMs: average(collectLatencies(warm, 'requestToFirstChunkMs')),
  }
}

/**
 * 反復全体の状態を1つに畳む。
 * 1回でも成功していれば成功扱いにする。比較が目的なので、
 * 一部が失敗しても取れた計測値は活かす。
 */
export function resolveAggregateStatus(attempts: readonly DebugAttemptLike[]): DebugStatus {
  if (attempts.length === 0) return 'pending'
  const hasSuccess = attempts.some((attempt) => attempt.status === 'success')
  if (hasSuccess) return 'success'
  const failed = attempts.some((attempt) => attempt.status === 'error')
  const cancelled = attempts.some((attempt) => attempt.status === 'cancelled')
  if (cancelled && !failed) return 'cancelled'
  if (failed) return 'error'
  return attempts[0].status
}

/** 停止した試行を表す最小の記録。実行前に中断されたときに積む。 */
export function createCancelledAttempt(index: number, now = Date.now()): DebugAttemptLike & { timing: DebugTiming } {
  return {
    index,
    status: 'cancelled',
    timing: { requestStartedAt: now },
    metrics: {},
    errorMessage: '停止しました',
  }
}

/** 開始時刻からの経過時間。時刻が未取得のときは undefined のままにする。 */
export function elapsedSince(startedAt: number, at?: number): number | undefined {
  return at === undefined ? undefined : at - startedAt
}

/** 中断による失敗かどうか。AbortController と signal の両方から判定する。 */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return error instanceof DOMException && error.name === 'AbortError'
}

export interface RunDebugSequenceOptions<TAttempt extends DebugAttemptLike> {
  iterations: number
  signal: AbortSignal
  /** 1回分の試行。段ごとに差し替える唯一の部分。 */
  runAttempt: (index: number) => Promise<TAttempt>
  /** 停止時に積む記録。段ごとの試行型に合わせて作る。 */
  createCancelled: (index: number) => TAttempt
  /** 1回終わるたびの通知。残りがあるかを渡し、途中経過の見せ方を任せる。 */
  onAttempt?: (attempts: readonly TAttempt[], hasMore: boolean) => void
}

/**
 * 同じ条件で連続実行し、各回の試行を順に返す。
 * 1回目と2回目以降の差を見るため、並列ではなく逐次で回す。
 */
export async function runDebugSequence<TAttempt extends DebugAttemptLike>(
  options: RunDebugSequenceOptions<TAttempt>
): Promise<TAttempt[]> {
  const attempts: TAttempt[] = []
  const total = clampIterations(options.iterations)

  for (let index = 1; index <= total; index += 1) {
    if (options.signal.aborted) {
      attempts.push(options.createCancelled(index))
      break
    }
    const attempt = await options.runAttempt(index)
    attempts.push(attempt)
    // 停止で打ち切ったときは「残りがある」とは扱わない。
    options.onAttempt?.(attempts, index < total && attempt.status !== 'cancelled')
    if (attempt.status === 'cancelled') break
  }

  return attempts
}
