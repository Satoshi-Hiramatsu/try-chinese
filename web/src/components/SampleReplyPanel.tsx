import type { SampleReply, SampleReplyStyle } from '../types'
import { BulbIcon, SpeakerIcon, StopCircleIcon } from './Icons'
import { TonePinyin } from './TonePinyin'

const STYLE_LABELS: Record<SampleReplyStyle, string> = {
  simple: '短く返す',
  natural: '自然に返す',
  expand: '話を広げる',
}

interface SampleReplyPanelProps {
  sampleReplies: SampleReply[]
  playingText?: string | null
  onPlayText?: (text: string) => void
  onStopText?: () => void
  enableToneColoring?: boolean
  compact?: boolean
}

export function SampleReplyPanel({
  sampleReplies,
  playingText,
  onPlayText,
  onStopText,
  enableToneColoring = false,
  compact = false,
}: SampleReplyPanelProps) {
  if (sampleReplies.length === 0) return null

  return (
    <section
      className={`rounded-xl border border-sky-200/80 bg-sky-50/90 ${
        compact ? 'p-2.5' : 'p-3'
      }`}
      aria-label="中国語のサンプル回答"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center gap-1.5 text-sky-800">
        <BulbIcon className="h-3.5 w-3.5 text-sky-600" />
        <span className="text-[11px] font-bold">こんなふうに返せます</span>
        <span className="text-[10px] text-sky-600/80">聞いて、まねしてみよう</span>
      </div>

      <ol className="m-0 space-y-1.5 p-0">
        {sampleReplies.map((sample) => {
          const isPlaying = playingText === sample.zh
          return (
            <li
              key={sample.style}
              className="flex items-center gap-2 rounded-lg border border-sky-100 bg-white/90 px-2.5 py-2"
            >
              <span className="w-16 flex-shrink-0 text-[10px] font-bold text-sky-700">
                {STYLE_LABELS[sample.style]}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  lang="zh-CN"
                  className={`m-0 font-chinese font-bold leading-snug text-stone-900 ${
                    compact ? 'text-sm' : 'text-sm sm:text-base'
                  }`}
                >
                  {sample.zh}
                </p>
                <TonePinyin
                  pinyin={sample.pinyin}
                  enableColoring={enableToneColoring}
                  className="m-0 mt-0.5 block text-[10px] leading-snug text-stone-500"
                />
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  if (isPlaying) onStopText?.()
                  else onPlayText?.(sample.zh)
                }}
                className={`flex-shrink-0 rounded-lg p-1.5 transition-colors cursor-pointer ${
                  isPlaying
                    ? 'bg-sky-600 text-white'
                    : 'text-sky-600 hover:bg-sky-100 hover:text-sky-800'
                }`}
                aria-label={isPlaying ? 'サンプル回答の音声を停止' : 'サンプル回答の発音を聞く'}
                title={isPlaying ? '音声を停止' : '発音を聞く'}
              >
                {isPlaying ? (
                  <StopCircleIcon className="h-3.5 w-3.5" />
                ) : (
                  <SpeakerIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
