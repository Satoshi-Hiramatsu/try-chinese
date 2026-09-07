import { useState, useEffect } from 'react'
import type { Friend, Voice } from '../types'
import {
  CloseIcon,
  SpeakerIcon,
  StopCircleIcon,
  SparklesIcon,
  CheckIcon,
} from './Icons'
import { FriendAvatar } from './FriendAvatar'
import {
  getChineseVoices,
  speakChinese,
  stopSpeaking,
  getAvailableVoices,
} from '../services/speech'

interface VoiceSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  friend: Friend
  onSaveVoice: (updatedVoice: Voice) => void
}

const VOICE_PRESETS = [
  {
    name: '女性・明るく親しみやすい',
    voice: { quality: 'natural' as const, gender: 'female' as const, rate: 0.95, pitch: 1.05 },
    desc: '標準的な同年代の友達トーン',
  },
  {
    name: '女性・ゆったり愛らしい声',
    voice: { quality: 'natural' as const, gender: 'female' as const, rate: 0.88, pitch: 1.18 },
    desc: '初心者の聞き取りに最適なスピード',
  },
  {
    name: '女性・落ち着いた穏やかな声',
    voice: { quality: 'natural' as const, gender: 'female' as const, rate: 0.92, pitch: 0.96 },
    desc: '品があり優しい大人のトーン',
  },
  {
    name: '男性・落ち着いた知的トーン',
    voice: { quality: 'natural' as const, gender: 'male' as const, rate: 0.95, pitch: 0.85 },
    desc: '安定感のある聞き取りやすい低音',
  },
  {
    name: '男性・元気で快活な声',
    voice: { quality: 'natural' as const, gender: 'male' as const, rate: 1.05, pitch: 0.95 },
    desc: 'テンポ良くエネルギッシュな会話',
  },
]

export function VoiceSettingsModal({
  isOpen,
  onClose,
  friend,
  onSaveVoice,
}: VoiceSettingsModalProps) {
  const [gender, setGender] = useState<'female' | 'male'>(friend.voice?.gender || 'female')
  const [rate, setRate] = useState<number>(friend.voice?.rate ?? 0.95)
  const [pitch, setPitch] = useState<number>(friend.voice?.pitch ?? 1.0)
  const [voiceName, setVoiceName] = useState<string>(friend.voice?.voiceName || '')
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [isPlayingPreview, setIsPlayingPreview] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setGender(friend.voice?.gender || 'female')
      setRate(friend.voice?.rate ?? 0.95)
      setPitch(friend.voice?.pitch ?? 1.0)
      setVoiceName(friend.voice?.voiceName || '')

      getAvailableVoices().then(() => {
        setAvailableVoices(getChineseVoices())
      })
    }
  }, [isOpen, friend])

  useEffect(() => {
    return () => {
      stopSpeaking()
      setIsPlayingPreview(false)
    }
  }, [])

  if (!isOpen) return null

  const handlePreview = () => {
    if (isPlayingPreview) {
      stopSpeaking()
      setIsPlayingPreview(false)
      return
    }

    const previewVoice: Voice = {
      quality: 'natural',
      gender,
      rate,
      pitch,
      voiceName: voiceName || undefined,
    }

    const testText = `你好！我是${friend.name.replace(/\s*\(.*?\)/g, '')}。今天过得怎么样？很高兴和你用中文聊天！`

    setIsPlayingPreview(true)
    speakChinese(testText, previewVoice, {
      onEnd: () => setIsPlayingPreview(false),
      onError: () => setIsPlayingPreview(false),
    })
  }

  const handleApplyPreset = (presetVoice: { quality: 'natural'; gender: 'female' | 'male'; rate: number; pitch: number }) => {
    setGender(presetVoice.gender)
    setRate(presetVoice.rate)
    setPitch(presetVoice.pitch)
    setVoiceName('') // プリセット適用時は自動ボイス選択に
  }

  const handleSave = () => {
    stopSpeaking()
    setIsPlayingPreview(false)

    const updatedVoice: Voice = {
      quality: 'natural',
      gender,
      rate,
      pitch,
      voiceName: voiceName || undefined,
    }

    onSaveVoice(updatedVoice)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-rose-100 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <FriendAvatar friend={friend} size="sm" shape="circle" />
            <div>
              <h3 className="text-lg font-bold text-stone-900 m-0 flex items-center gap-2">
                <span>{friend.name} の声質カスタマイズ</span>
              </h3>
              <p className="text-xs text-stone-500 m-0 mt-0.5">
                性別・話す速度・音の高さを調整できます
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopSpeaking()
              onClose()
            }}
            aria-label="閉じる"
            className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5 text-sm text-stone-700 max-h-[70vh] overflow-y-auto pr-1">
          {/* プリセット選択 */}
          <div>
            <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5 mb-2">
              <SparklesIcon className="w-4 h-4 text-amber-500" />
              <span>声質プリセットから選ぶ:</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VOICE_PRESETS.map((p, idx) => {
                const isMatched =
                  gender === p.voice.gender &&
                  Math.abs(rate - p.voice.rate) < 0.03 &&
                  Math.abs(pitch - p.voice.pitch) < 0.03

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPreset(p.voice)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isMatched
                        ? 'border-rose-400 bg-rose-50/70 text-rose-900 shadow-2xs font-semibold'
                        : 'border-stone-200 hover:border-stone-300 bg-stone-50/50 hover:bg-stone-100/60 text-stone-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{p.name}</span>
                      {isMatched && <CheckIcon className="w-3.5 h-3.5 text-rose-600" />}
                    </div>
                    <p className="text-[10px] text-stone-500 m-0 mt-0.5">{p.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 性別設定 */}
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1.5">
              声の性別:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  gender === 'female'
                    ? 'border-rose-400 bg-rose-500 text-white shadow-xs'
                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <span>👩 女性声 (Female)</span>
              </button>
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  gender === 'male'
                    ? 'border-rose-400 bg-rose-500 text-white shadow-xs'
                    : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                <span>👨 男性声 (Male)</span>
              </button>
            </div>
          </div>

          {/* 話す速度 (rate) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-700">
                話す速度: <span className="font-mono text-rose-600">{rate.toFixed(2)}x</span>
              </label>
              <span className="text-[11px] text-stone-400">
                {rate <= 0.85 ? 'ゆっくり（初心者向け）' : rate >= 1.1 ? '速め' : '標準速度'}
              </span>
            </div>
            <input
              type="range"
              min="0.7"
              max="1.3"
              step="0.05"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-1">
              <span>0.7x (ゆっくり)</span>
              <span>1.0x (標準)</span>
              <span>1.3x (速め)</span>
            </div>
          </div>

          {/* 音の高さ (pitch) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-stone-700">
                声の高さ (ピッチ): <span className="font-mono text-rose-600">{pitch.toFixed(2)}</span>
              </label>
              <span className="text-[11px] text-stone-400">
                {pitch < 0.95 ? '低め・落ち着き' : pitch > 1.05 ? '高め・明るい' : '標準'}
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.25"
              step="0.05"
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-stone-400 mt-1">
              <span>低音 (0.8)</span>
              <span>標準 (1.0)</span>
              <span>高音 (1.25)</span>
            </div>
          </div>

          {/* 特定のブラウザ音声選択（任意） */}
          {availableVoices.length > 0 && (
            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">
                ブラウザ搭載の音声モデル (任意):
              </label>
              <select
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-rose-400 text-stone-700"
              >
                <option value="">自動選択 (推奨・性別/品質に合わせて最適化)</option>
                {availableVoices.map((v, i) => (
                  <option key={i} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 音声に関する親切な案内 */}
          <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1 text-amber-800">
              <span>💡 音声に関するヒント</span>
            </div>
            <p className="m-0 leading-relaxed text-stone-600">
              お使いのブラウザによって認識される音声モデルの数や種類が異なります。Google Chrome等で男性音声が入っていない環境でも、ピッチ自動補正により自然な男性の低音ボイスを生成します。
              さらにリアルな男性AI音声（Yunxi等）をお求めの場合は、<strong>Microsoft Edge</strong> でのご利用もおすすめです。
            </p>
          </div>
        </div>

        {/* Footer: 試聴 & 保存 */}
        <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between gap-3">
          {/* 試聴ボタン */}
          <button
            type="button"
            onClick={handlePreview}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isPlayingPreview
                ? 'bg-rose-100 text-rose-700 animate-pulse border border-rose-200'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
            }`}
          >
            {isPlayingPreview ? (
              <>
                <StopCircleIcon className="w-4 h-4 text-rose-600" />
                <span>停止</span>
              </>
            ) : (
              <>
                <SpeakerIcon className="w-4 h-4 text-rose-500" />
                <span>声質を試聴する</span>
              </>
            )}
          </button>

          {/* キャンセル & 保存 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopSpeaking()
                onClose()
              }}
              className="px-4 py-2 rounded-xl text-xs text-stone-500 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1"
            >
              <CheckIcon className="w-3.5 h-3.5" />
              <span>保存する</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
