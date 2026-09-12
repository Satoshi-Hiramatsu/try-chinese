import { useEffect, useState } from 'react'
import type { Friend } from '../types'
import { DEFAULT_VOICE_PITCH, MAX_VOICE_PITCH, MIN_VOICE_PITCH } from '../types'
import { CloseIcon, SpeakerIcon, StopCircleIcon, CheckIcon, RotateCwIcon } from './Icons'
import { FriendAvatar } from './FriendAvatar'
import { speakChinese, stopSpeaking } from '../services/speech'
import { clampVoicePitch } from '../data/fishVoice'

/**
 * 利用者向けの声の調整。触れるのは「声の高さ」だけ。
 *
 * 話者や調整値はプリセットのまま使い、高さだけを友達ごとに覚える（storage.ts の saveFriendPitch）。
 * プリセットの声を後から直しても届くよう、声そのものは上書きしない。
 */

interface VoicePitchModalProps {
  isOpen: boolean
  onClose: () => void
  friend: Friend
  /** 標準（1.0）に戻したときは null を渡し、保存を消す。 */
  onSave: (pitch: number | null) => void
}

const PITCH_STEP = 0.05
const SAMPLE_TEXT = '你好！很高兴认识你。今天想聊点什么？'

/** スライダーの値を「低め / 標準 / 高め」の言葉にする。 */
function describePitch(pitch: number): string {
  if (pitch === DEFAULT_VOICE_PITCH) return '標準'
  const steps = Math.round((pitch - DEFAULT_VOICE_PITCH) / PITCH_STEP)
  return steps < 0 ? `低め ${-steps}` : `高め ${steps}`
}

export function VoicePitchModal({ isOpen, onClose, friend, onSave }: VoicePitchModalProps) {
  const [pitch, setPitch] = useState(() => clampVoicePitch(friend.voice?.pitch))
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState('')

  const hasVoice = Boolean(friend.voice?.voiceModel)
  const sampleText = friend.initialMessage?.zh || SAMPLE_TEXT

  useEffect(() => {
    if (!isOpen) return
    setPitch(clampVoicePitch(friend.voice?.pitch))
    setError('')
  }, [friend, isOpen])

  useEffect(() => {
    if (!isOpen) stopSpeaking()
  }, [isOpen])

  if (!isOpen) return null

  const preview = () => {
    if (isPlaying) {
      stopSpeaking()
      setIsPlaying(false)
      return
    }
    if (!friend.voice || !hasVoice) return
    setError('')
    setIsPlaying(true)
    speakChinese(sampleText, { ...friend.voice, pitch }, {
      onEnd: () => setIsPlaying(false),
      onError: (err) => {
        setIsPlaying(false)
        setError(err instanceof Error ? err.message : '試聴できませんでした。')
      },
    })
  }

  const save = () => {
    stopSpeaking()
    onSave(pitch === DEFAULT_VOICE_PITCH ? null : pitch)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-pitch-title"
    >
      <div
        className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-stone-200/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <FriendAvatar friend={friend} size="sm" />
            <div className="min-w-0">
              <h2 id="voice-pitch-title" className="text-base font-bold text-stone-800 m-0 truncate">
                声の高さ
              </h2>
              <p className="text-[11px] text-stone-500 m-0 truncate">{friend.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 cursor-pointer"
            aria-label="閉じる"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 text-left">
          {!hasVoice && (
            <p className="m-0 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              この友達の声はまだ準備中です。高さは保存できますが、読み上げは鳴りません。
            </p>
          )}

          <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800">高さ</span>
              <span className="text-xs font-bold text-rose-700">{describePitch(pitch)}</span>
            </div>
            <input
              type="range"
              min={MIN_VOICE_PITCH}
              max={MAX_VOICE_PITCH}
              step={PITCH_STEP}
              value={pitch}
              onChange={(e) => setPitch(clampVoicePitch(Number(e.target.value)))}
              aria-label="声の高さ"
              className="w-full mt-2 accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
              <span>低め</span>
              <span>標準</span>
              <span>高め</span>
            </div>
          </div>

          {error && <p className="m-0 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={preview}
              disabled={!hasVoice}
              className={`flex-1 py-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isPlaying ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              {isPlaying ? <StopCircleIcon className="w-4 h-4" /> : <SpeakerIcon className="w-4 h-4" />}
              <span>{isPlaying ? '停止' : '試聴する'}</span>
            </button>
            <button
              type="button"
              onClick={() => setPitch(DEFAULT_VOICE_PITCH)}
              disabled={pitch === DEFAULT_VOICE_PITCH}
              className="py-2.5 px-3 rounded-2xl border border-stone-300 bg-white text-stone-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCwIcon className="w-3.5 h-3.5" />
              <span>標準に戻す</span>
            </button>
          </div>
          <p className="m-0 text-[11px] text-stone-400">試聴には API の利用料が少しかかります。</p>
        </div>

        <div className="px-5 py-3.5 border-t border-stone-100 bg-stone-50/80 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-200/60 cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={save}
            className="px-5 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <CheckIcon className="w-4 h-4" />
            <span>保存する</span>
          </button>
        </div>
      </div>
    </div>
  )
}
