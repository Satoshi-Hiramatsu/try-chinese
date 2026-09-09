import type { TtsCatalogModel } from '../services/ttsCatalog'
import type { TtsDebugAttempt, TtsDebugRatings, TtsDebugResult } from '../types'
import type { SyntheticEvent } from 'react'
import { describeTuning } from '../data/ttsVoiceTuning'

interface Props {
  /** カタログ取得前や履歴復元時はモデル情報が無いことがある。 */
  model?: TtsCatalogModel
  result: TtsDebugResult
  onRetry: () => void
  onChange: (result: TtsDebugResult) => void
}

const STATUS_LABELS: Record<TtsDebugResult['status'], string> = {
  pending: '待機中',
  running: '実行中',
  success: '成功',
  error: '失敗',
  cancelled: '停止',
}

function formatMs(value?: number): string {
  return value === undefined ? '—' : value.toLocaleString() + ' ms'
}

function Rating({ label, value, onChange }: {
  label: string
  value?: number
  onChange: (value?: number) => void
}) {
  return <label>{label}<input type={'number'} min={1} max={5} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)} /></label>
}

/** 連続生成の各回。1回目と2回目以降の差が見えるよう、回ごとに1行で並べる。 */
function AttemptRow({ attempt, onChange }: { attempt: TtsDebugAttempt; onChange: (attempt: TtsDebugAttempt) => void }) {
  const played = () => {
    const at = Date.now()
    onChange({
      ...attempt,
      timing: { ...attempt.timing, playbackStartedAt: at },
      metrics: { ...attempt.metrics, requestToPlaybackMs: at - attempt.timing.requestStartedAt },
    })
  }
  const ended = () => onChange({ ...attempt, timing: { ...attempt.timing, playbackEndedAt: Date.now() } })
  const metadata = (event: SyntheticEvent<HTMLAudioElement>) => {
    const duration = event.currentTarget.duration
    if (Number.isFinite(duration)) onChange({ ...attempt, metrics: { ...attempt.metrics, audioDurationMs: Math.round(duration * 1000) } })
  }
  return (
    <li className={'tts-debug-attempt'} data-status={attempt.status}>
      <div className={'tts-debug-attempt-head'}>
        <b>{attempt.index}回目</b>
        <span className={'tts-debug-status'} data-status={attempt.status}>{STATUS_LABELS[attempt.status]}</span>
        <span>ヘッダー {formatMs(attempt.metrics.requestToHeadersMs)}</span>
        <span>初回チャンク {formatMs(attempt.metrics.requestToFirstChunkMs)}</span>
        <span>受信完了 {formatMs(attempt.metrics.requestToCompleteMs)}</span>
        <span>音声長 {formatMs(attempt.metrics.audioDurationMs)}</span>
      </div>
      {attempt.errorMessage ? <p className={'tts-debug-error'}>{attempt.errorMessage}</p> : null}
      {attempt.audioUrl ? <audio controls preload={'metadata'} src={attempt.audioUrl} onPlay={played} onEnded={ended} onLoadedMetadata={metadata} /> : null}
    </li>
  )
}

export function TtsDebugResultCard({ model, result, onRetry, onChange }: Props) {
  const rate = (key: keyof TtsDebugRatings, value?: number) => onChange({ ...result, ratings: { ...result.ratings, [key]: value } })
  const attempts = result.attempts || []
  const updateAttempt = (next: TtsDebugAttempt) => onChange({
    ...result,
    attempts: attempts.map((attempt) => attempt.index === next.index ? next : attempt),
  })
  const metrics = result.metrics
  const attemptCount = metrics.attemptCount ?? attempts.length

  return (
    <article className={'tts-debug-card'}>
      <header>
        <div><b>{model?.displayName || result.modelId}</b><small>{result.modelId}</small></div>
        <strong className={'tts-debug-status'} data-status={result.status}>{STATUS_LABELS[result.status]}</strong>
      </header>
      <dl className={'tts-debug-metrics'}>
        <div><dt>初回チャンク(1回目)</dt><dd>{formatMs(metrics.requestToFirstChunkMs)}</dd></div>
        <div><dt>初回チャンク平均</dt><dd>{formatMs(metrics.averageRequestToFirstChunkMs)}</dd></div>
        <div><dt>2回目以降平均</dt><dd>{formatMs(metrics.warmAverageRequestToFirstChunkMs)}</dd></div>
        <div><dt>応答ヘッダー平均</dt><dd>{formatMs(metrics.averageRequestToHeadersMs)}</dd></div>
        <div><dt>受信完了平均</dt><dd>{formatMs(metrics.averageRequestToCompleteMs)}</dd></div>
        <div><dt>成功/実行</dt><dd>{metrics.successCount ?? 0}/{attemptCount || '—'}</dd></div>
        <div><dt>HTTP/Voice</dt><dd>{result.httpStatus ?? '—'}/{result.voiceId || '既定'}</dd></div>
        <div><dt>形式</dt><dd>{result.responseFormat || result.contentType || '—'}</dd></div>
        <div><dt>推定費用</dt><dd>{metrics.estimatedCostUsd === undefined ? '算出不可' : '$' + (metrics.estimatedCostUsd * (attemptCount || 1)).toFixed(6)}</dd></div>
      </dl>
      {describeTuning(result.tuning) ? <small className={'tts-debug-model-note'}>調整:{describeTuning(result.tuning)}</small> : null}
      {result.generationId ? <small>Generation:{result.generationId}</small> : null}
      {result.errorMessage ? <p className={'tts-debug-error'}>{result.errorMessage}</p> : null}
      {attempts.length
        ? <ul className={'tts-debug-attempts'}>{attempts.map((attempt) => <AttemptRow key={attempt.index} attempt={attempt} onChange={updateAttempt} />)}</ul>
        : null}
      <div className={'tts-debug-ratings'}>
        <Rating label={'発音'} value={result.ratings?.pronunciation} onChange={(v) => rate('pronunciation', v)} />
        <Rating label={'自然さ'} value={result.ratings?.naturalness} onChange={(v) => rate('naturalness', v)} />
        <Rating label={'キャラクター'} value={result.ratings?.characterConsistency} onChange={(v) => rate('characterConsistency', v)} />
        <Rating label={'日中一貫性'} value={result.ratings?.jaZhConsistency} onChange={(v) => rate('jaZhConsistency', v)} />
      </div>
      <textarea value={result.memo || ''} onChange={(event) => onChange({ ...result, memo: event.target.value })} placeholder={'比較メモ'} />
      <footer>
        {model ? <a href={model.sourceUrl} target={'_blank'} rel={'noreferrer'}>モデル情報</a> : <span />}
        <button type={'button'} onClick={onRetry} disabled={result.status === 'running'}>再試行</button>
      </footer>
    </article>
  )
}
