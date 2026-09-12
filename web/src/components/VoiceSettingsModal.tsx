import { useEffect, useState } from 'react'
import type { Friend, TtsVoiceTuning, Voice } from '../types'
import { MAX_VOICE_PITCH, MIN_VOICE_PITCH } from '../types'
import { CloseIcon, SpeakerIcon, StopCircleIcon, CheckIcon, MaleIcon, FemaleIcon, RotateCwIcon } from './Icons'
import { FriendAvatar } from './FriendAvatar'
import { speakChinese, stopSpeaking } from '../services/speech'
import { getTtsTuningCapability, normalizeTuning } from '../data/ttsVoiceTuning'
import { FIXED_TTS_MODEL, clampVoicePitch, isFishReferenceId } from '../data/fishVoice'
import { VoiceTuningFields } from './VoiceTuningFields'

/**
 * 開発者向けの声設定（Fish Audio S2.1 Pro 専用）。
 *
 * 話者ID（reference_id）・調整値・速さ・高さ・性別を作り込み、試聴して保存する。
 * 利用者には出さない。利用者が触れるのは VoicePitchModal の「声の高さ」だけ。
 */

interface VoiceSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  friend: Friend
  onSaveVoice: (updatedVoice: Voice) => void
  /** プリセットの友達で、このブラウザに声の上書きがあるとき true。「プリセットに戻す」を出す */
  canResetToPreset?: boolean
  /** 声の上書きを捨てて presetFriends.ts の値に戻す。呼び出し側でモーダルを閉じる */
  onResetToPreset?: () => void
}

const SAMPLE_TEXT = '你好！很高兴认识你。今天想聊点什么？'

export function VoiceSettingsModal({
  isOpen,
  onClose,
  friend,
  onSaveVoice,
  canResetToPreset = false,
  onResetToPreset,
}: VoiceSettingsModalProps) {
  const [gender, setGender] = useState<Voice['gender']>(friend.voice?.gender || 'female')
  const [voiceModel, setVoiceModel] = useState(friend.voice?.voiceModel || '')
  const [rate, setRate] = useState(friend.voice?.rate ?? 1.0)
  const [pitch, setPitch] = useState(clampVoicePitch(friend.voice?.pitch))
  const [tuning, setTuning] = useState<TtsVoiceTuning>(friend.voice?.voiceTuning ?? {})
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState('')

  const capability = getTtsTuningCapability(FIXED_TTS_MODEL)
  const sampleText = friend.initialMessage?.zh || SAMPLE_TEXT
  const trimmedVoiceModel = voiceModel.trim()
  const voiceModelValid = isFishReferenceId(trimmedVoiceModel)

  // 別の友達を開いたときは、その友達の値で入力欄を作り直す。
  useEffect(() => {
    if (!isOpen) return
    setGender(friend.voice?.gender || 'female')
    setVoiceModel(friend.voice?.voiceModel || '')
    setRate(friend.voice?.rate ?? 1.0)
    setPitch(clampVoicePitch(friend.voice?.pitch))
    setTuning(friend.voice?.voiceTuning ?? {})
    setError('')
  }, [friend, isOpen])

  useEffect(() => {
    if (!isOpen) stopSpeaking()
  }, [isOpen])

  if (!isOpen) return null

  const buildVoice = (): Voice => {
    const voice: Voice = { gender, voiceModel: trimmedVoiceModel, rate, pitch }
    const normalized = normalizeTuning(tuning)
    if (normalized) voice.voiceTuning = normalized
    return voice
  }

  const preview = () => {
    if (isPlaying) {
      stopSpeaking()
      setIsPlaying(false)
      return
    }
    if (!voiceModelValid) {
      setError('話者ID（32桁の16進数）を入力してください。')
      return
    }
    setError('')
    setIsPlaying(true)
    speakChinese(sampleText, buildVoice(), {
      onEnd: () => setIsPlaying(false),
      onError: (err) => {
        setIsPlaying(false)
        setError(err instanceof Error ? err.message : '試聴に失敗しました。')
      },
    })
  }

  const save = () => {
    if (!voiceModelValid) {
      setError('話者ID（32桁の16進数）を入力してください。')
      return
    }
    stopSpeaking()
    onSaveVoice(buildVoice())
    onClose()
  }

  const genderButton = (value: Voice['gender'], label: string, Icon: typeof MaleIcon) => (
    <button
      type="button"
      onClick={() => setGender(value)}
      className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl border cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
        gender === value ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
      }`}
      aria-pressed={gender === value}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-settings-title"
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl border border-stone-200/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FriendAvatar friend={friend} size="sm" />
            <div className="min-w-0">
              <h2 id="voice-settings-title" className="text-base font-bold text-stone-800 m-0 truncate">
                {friend.name} の声（開発者）
              </h2>
              <p className="text-[11px] text-stone-500 m-0">{FIXED_TTS_MODEL} · 話者IDと調整値を作り込む</p>
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

        <div className="px-5 sm:px-6 py-4 space-y-4 text-left flex-1 overflow-y-auto overscroll-contain">
          <div className="flex gap-2">
            {genderButton('female', '女性', FemaleIcon)}
            {genderButton('male', '男性', MaleIcon)}
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1" htmlFor="voice-settings-reference">
              話者ID（Fish Audio reference_id）
            </label>
            <input
              id="voice-settings-reference"
              type="text"
              value={voiceModel}
              onChange={(e) => setVoiceModel(e.target.value)}
              placeholder="例: 4d9ea3a384294fe39dc9e235f7052ede"
              spellCheck={false}
              className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none ${
                voiceModel && !voiceModelValid ? 'border-rose-400 focus:border-rose-500' : 'border-stone-300 focus:border-rose-500'
              }`}
            />
            <p className="text-[10px] text-stone-500 m-0 mt-1">
              指定しないと生成のたびに声が変わる。
              <a href="https://fish.audio/" target="_blank" rel="noreferrer" className="text-rose-600 hover:underline ml-1">
                fish.audio で話者を探す
              </a>
            </p>
          </div>

          <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">話す速さ</span>
                <span className="text-xs font-mono font-bold text-rose-700">{rate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.3}
                step={0.01}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                aria-label="話す速さ"
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800">声の高さ（利用者も変えられる）</span>
                <span className="text-xs font-mono font-bold text-rose-700">{pitch.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={MIN_VOICE_PITCH}
                max={MAX_VOICE_PITCH}
                step={0.01}
                value={pitch}
                onChange={(e) => setPitch(clampVoicePitch(Number(e.target.value)))}
                aria-label="声の高さ"
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80">
            <p className="text-xs font-bold text-stone-800 m-0 mb-1">声の固定・調整</p>
            <p className="text-[10px] text-stone-500 m-0 mb-2">{capability.summary}</p>
            <VoiceTuningFields capability={capability} tuning={tuning} onChange={setTuning} />
          </div>

          {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 m-0">{error}</p>}

          <button
            type="button"
            onClick={preview}
            className={`w-full py-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              isPlaying ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            {isPlaying ? <StopCircleIcon className="w-4 h-4" /> : <SpeakerIcon className="w-4 h-4" />}
            <span>{isPlaying ? '停止' : '試聴する'}</span>
          </button>

          {canResetToPreset && onResetToPreset && (
            <button
              type="button"
              onClick={() => {
                if (!confirm(`${friend.name} の声の上書きを捨てて、プリセットの値に戻します。よろしいですか？`)) return
                stopSpeaking()
                onResetToPreset()
              }}
              className="w-full py-2 rounded-2xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCwIcon className="w-3.5 h-3.5" />
              <span>プリセットの声に戻す</span>
            </button>
          )}
        </div>

        <div className="px-5 sm:px-6 py-3.5 border-t border-stone-100 bg-stone-50/80 flex-shrink-0 flex justify-end gap-2">
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
