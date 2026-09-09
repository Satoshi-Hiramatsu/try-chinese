import type { OpenRouterTtsModel } from '../data/openRouterTtsModels'
import type { TtsDebugRatings, TtsDebugResult } from '../types'
import type { SyntheticEvent } from 'react'

interface Props {
  model: OpenRouterTtsModel
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

export function TtsDebugResultCard({ model, result, onRetry, onChange }: Props) {
  const rate = (key: keyof TtsDebugRatings, value?: number) => onChange({ ...result, ratings: { ...result.ratings, [key]: value } })
  const played = () => {
    const at = Date.now()
    onChange({ ...result, timing: { ...result.timing, playbackStartedAt: at }, metrics: { ...result.metrics, requestToPlaybackMs: at - result.timing.requestStartedAt } })
  }
  const ended = () => onChange({ ...result, timing: { ...result.timing, playbackEndedAt: Date.now() } })
  const metadata = (event: SyntheticEvent<HTMLAudioElement>) => {
    const duration = event.currentTarget.duration
    if (Number.isFinite(duration)) onChange({ ...result, metrics: { ...result.metrics, audioDurationMs: Math.round(duration * 1000) } })
  }
  return (
    <article className={'tts-debug-card'}>
      <header><div><b>{model.displayName}</b><small>{model.id}</small></div><strong className={'tts-debug-status'} data-status={result.status}>{STATUS_LABELS[result.status]}</strong></header>
      <dl className={'tts-debug-metrics'}>
        <div><dt>応答ヘッダー</dt><dd>{formatMs(result.metrics.requestToHeadersMs)}</dd></div>
        <div><dt>最初のチャンク</dt><dd>{formatMs(result.metrics.requestToFirstChunkMs)}</dd></div>
        <div><dt>受信完了</dt><dd>{formatMs(result.metrics.requestToCompleteMs)}</dd></div>
        <div><dt>再生開始</dt><dd>{formatMs(result.metrics.requestToPlaybackMs)}</dd></div>
        <div><dt>音声長</dt><dd>{formatMs(result.metrics.audioDurationMs)}</dd></div>
        <div><dt>HTTP/Voice</dt><dd>{result.httpStatus ?? '—'}/{result.voiceId || '既定'}</dd></div>
      </dl>
      {result.generationId ? <small>Generation:{result.generationId}</small> : null}
      {result.errorMessage ? <p className={'tts-debug-error'}>{result.errorMessage}</p> : null}
      {result.audioUrl ? <audio controls preload={'metadata'} src={result.audioUrl} onPlay={played} onEnded={ended} onLoadedMetadata={metadata} /> : null}
      <div className={'tts-debug-ratings'}>
        <Rating label={'発音'} value={result.ratings?.pronunciation} onChange={(v) => rate('pronunciation', v)} />
        <Rating label={'自然さ'} value={result.ratings?.naturalness} onChange={(v) => rate('naturalness', v)} />
        <Rating label={'キャラクター'} value={result.ratings?.characterConsistency} onChange={(v) => rate('characterConsistency', v)} />
        <Rating label={'日中一貫性'} value={result.ratings?.jaZhConsistency} onChange={(v) => rate('jaZhConsistency', v)} />
      </div>
      <textarea value={result.memo || ''} onChange={(event) => onChange({ ...result, memo: event.target.value })} placeholder={'比較メモ'} />
      <footer><a href={model.sourceUrl} target={'_blank'} rel={'noreferrer'}>モデル情報</a><button type={'button'} onClick={onRetry} disabled={result.status === 'running'}>再試行</button></footer>
    </article>
  )
}
