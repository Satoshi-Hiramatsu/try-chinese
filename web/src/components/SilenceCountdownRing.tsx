import { useEffect, useRef, useState } from 'react'

interface SilenceCountdownRingProps {
  /** 無音タイムアウトに到達する絶対時刻(ms)。null のあいだは何も表示しない。 */
  deadline: number | null
  /** 無音の持ち時間(ms)。リングの満タン量。 */
  totalMs: number
  /** 使い切ったときに起きること。send = 自動送信 / stop = マイク停止 */
  mode: 'send' | 'stop'
  className?: string
}

const SIZE = 42
const STROKE = 4.5
const RADIUS = (SIZE - STROKE) / 2 - 1
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const CENTER = SIZE / 2

/** 残量に応じた色。ゲームの残り時間ゲージのように 緑 → 黄 → 赤 と変わる。 */
function ringColor(ratio: number): string {
  if (ratio > 0.55) return '#34d399'
  if (ratio > 0.25) return '#fbbf24'
  return '#f43f5e'
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 無音の残り時間を見せるドーナツ型カウントダウン。
 *
 * ローディングリングの逆で、満タンから減っていく。
 * 声が入って無音が解除されると deadline が先へ延びるので、
 * リングは一気に満タンへ巻き戻り、ぷるんと弾んで「まだ大丈夫」を伝える。
 */
export function SilenceCountdownRing({ deadline, totalMs, mode, className = '' }: SilenceCountdownRingProps) {
  const [ratio, setRatio] = useState(1)
  const [refillKey, setRefillKey] = useState(0)
  const previousDeadlineRef = useRef<number | null>(null)

  // 持ち時間が巻き戻ったら弾ませる（同じ deadline の更新では鳴らさない）
  useEffect(() => {
    const previous = previousDeadlineRef.current
    previousDeadlineRef.current = deadline
    if (deadline !== null && previous !== null && deadline > previous) {
      setRefillKey((prev) => prev + 1)
    }
  }, [deadline])

  useEffect(() => {
    if (deadline === null) {
      setRatio(1)
      return
    }
    let frame = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const remaining = Math.max(0, deadline - Date.now())
      setRatio((prev) => {
        const next = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0
        // 目に見えない差でむだに描き直さない
        return Math.abs(next - prev) < 0.004 && next > 0 ? prev : next
      })
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [deadline, totalMs])

  if (deadline === null) return null

  const remainingMs = Math.max(0, deadline - Date.now())
  const seconds = Math.ceil(remainingMs / 100) / 10
  const secondsLabel = seconds >= 10 ? String(Math.ceil(seconds)) : seconds.toFixed(1)
  const color = ringColor(ratio)
  const isUrgent = ratio <= 0.25
  const reduceMotion = prefersReducedMotion()
  // 減っていく先端。ここに小さな玉を置くと時計のように読み取りやすい。
  const headAngle = (-90 + 360 * ratio) * (Math.PI / 180)
  const headX = CENTER + RADIUS * Math.cos(headAngle)
  const headY = CENTER + RADIUS * Math.sin(headAngle)
  const label = mode === 'send' ? '自動送信まで' : 'マイク停止まで'

  return (
    <div
      className={`flex items-center gap-1.5 flex-shrink-0 ${className}`}
      title={`${label} ${secondsLabel}秒`}
      aria-label={`${label}あと${secondsLabel}秒`}
    >
      <div
        key={refillKey}
        className={`relative ${reduceMotion ? '' : 'silence-ring-refill'} ${isUrgent && !reduceMotion ? 'silence-ring-urgent' : ''}`}
        style={{ width: SIZE, height: SIZE }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="block">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="#f1eeec"
            strokeWidth={STROKE}
          />
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
              style={{ transition: 'stroke 0.3s ease', filter: `drop-shadow(0 0 3px ${color}66)` }}
            />
          </g>
          {ratio > 0.02 && (
            <circle cx={headX} cy={headY} r={STROKE / 2 + 0.5} fill={color} />
          )}
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums"
          style={{ color }}
        >
          {secondsLabel}
        </span>
      </div>
      <span className="text-[10px] text-stone-500 hidden md:inline">{label}</span>
    </div>
  )
}
