import { useState, useEffect, useRef } from 'react'
import type { Friend, Voice } from '../types'
import {
  CloseIcon,
  SpeakerIcon,
  StopCircleIcon,
  SparklesIcon,
  CheckIcon,
  ChevronDownIcon,
} from './Icons'
import { FriendAvatar } from './FriendAvatar'
import {
  getChineseVoices,
  speakChinese,
  stopSpeaking,
  getAvailableVoices,
} from '../services/speech'
import { loadApiKey, loadTtsProvider, saveTtsProvider, loadTtsModel } from '../services/storage'

interface VoiceSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  friend: Friend
  onSaveVoice: (updatedVoice: Voice) => void
}

interface CharacterVoiceOption {
  id: string
  name: string
  gender: 'female' | 'male'
  character: string
  recommendFor: string
  desc: string
  edgeVoiceName: string
  qwenVoice: string
  kokoroVoice: string
  defaultRate: number
  defaultPitch: number
}

const CHARACTER_VOICE_OPTIONS: CharacterVoiceOption[] = [
  {
    id: 'char-yunxi',
    name: '青年男性・知性的で温かみのある声 (Yunxi)',
    gender: 'male',
    character: '落ち着き・論理的',
    recommendFor: '王浩 (ITエンジニア)',
    desc: '20代の落ち着いた爽やかなトーン。明瞭で聞き取りやすいネイティブ発音。',
    edgeVoiceName: 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'loongjohn',
    kokoroVoice: 'zm_yunxi',
    defaultRate: 0.95,
    defaultPitch: 0.85,
  },
  {
    id: 'char-yunjian',
    name: '男性・快活でエネルギッシュな声 (Yunjian)',
    gender: 'male',
    character: '元気・前向き',
    recommendFor: '張偉 (フィットネス)',
    desc: 'ハキハキと力強いトーン。スポーツや日常のテンポ良い会話に最適。',
    edgeVoiceName: 'Microsoft Yunjian Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'loongjohn',
    kokoroVoice: 'zm_yunjian',
    defaultRate: 1.05,
    defaultPitch: 0.95,
  },
  {
    id: 'char-xiaoxiao',
    name: '女性・明るく親しみやすい友達声 (Xiaoxiao)',
    gender: 'female',
    character: '明るい・フランク',
    recommendFor: '陳美玲 (上海大学生)',
    desc: '同年代の友達と雑談しているような自然で生き生きとしたトーン。',
    edgeVoiceName: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaoxiao',
    defaultRate: 0.96,
    defaultPitch: 1.05,
  },
  {
    id: 'char-xiaoyi',
    name: '女性・優しく愛らしいのんびり声 (Xiaoyi)',
    gender: 'female',
    character: '愛嬌・癒やし',
    recommendFor: '李雪 (成都デザイナー)',
    desc: '柔らかく優しいニュアンス。初心者の聞き取りにも最適な心地よい声。',
    edgeVoiceName: 'Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaoyi',
    defaultRate: 0.88,
    defaultPitch: 1.18,
  },
  {
    id: 'char-xiaochen',
    name: '女性・穏やかで上品な大人の声 (Xiaochen)',
    gender: 'female',
    character: '上品・穏やか',
    recommendFor: '林子涵 (杭州写真家)',
    desc: '品格があり旅情を感じさせる、クリアで落ち着きのある発音。',
    edgeVoiceName: 'Microsoft Xiaochen Online (Natural) - Chinese (Mainland)',
    qwenVoice: 'longanhuan_v3.6',
    kokoroVoice: 'zf_xiaobei',
    defaultRate: 0.92,
    defaultPitch: 0.96,
  },
]

export function VoiceSettingsModal({
  isOpen,
  onClose,
  friend,
  onSaveVoice,
}: VoiceSettingsModalProps) {
  const [provider, setProvider] = useState<'browser' | 'openrouter'>(() => loadTtsProvider('openrouter'))
  const [gender, setGender] = useState<'female' | 'male'>(friend.voice?.gender || 'female')
  const [rate, setRate] = useState<number>(friend.voice?.rate ?? 0.95)
  const [pitch, setPitch] = useState<number>(friend.voice?.pitch ?? 1.0)
  const [voiceName, setVoiceName] = useState<string>(friend.voice?.voiceName || '')
  const [voiceModel, setVoiceModel] = useState<string>(friend.voice?.voiceModel || 'longanhuan_v3.6')
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    const matched = CHARACTER_VOICE_OPTIONS.find((opt) =>
      opt.recommendFor.includes(friend.name.replace(/\s*\(.*?\)/g, ''))
    )
    return matched ? matched.id : 'char-yunxi'
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [isPlayingPreview, setIsPlayingPreview] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const hasApiKey = Boolean(loadApiKey())
  const currentTtsModel = loadTtsModel()

  useEffect(() => {
    if (isOpen) {
      setProvider(friend.voice?.ttsProvider || loadTtsProvider('openrouter'))
      setGender(friend.voice?.gender || 'female')
      setRate(friend.voice?.rate ?? 0.95)
      setPitch(friend.voice?.pitch ?? 1.0)
      setVoiceName(friend.voice?.voiceName || '')
      setVoiceModel(friend.voice?.voiceModel || 'longanhuan_v3.6')

      const matched = CHARACTER_VOICE_OPTIONS.find((opt) =>
        opt.recommendFor.includes(friend.name.replace(/\s*\(.*?\)/g, '')) ||
        opt.kokoroVoice === friend.voice?.voiceModel ||
        opt.edgeVoiceName === friend.voice?.voiceName
      )
      if (matched) {
        setSelectedPresetId(matched.id)
      }

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

  const handlePreview = (targetVoice?: Partial<Voice>) => {
    if (isPlayingPreview) {
      stopSpeaking()
      setIsPlayingPreview(false)
      return
    }

    const previewVoice: Voice = {
      quality: 'natural',
      gender: targetVoice?.gender ?? gender,
      rate: targetVoice?.rate ?? rate,
      pitch: targetVoice?.pitch ?? pitch,
      voiceName: targetVoice?.voiceName ?? voiceName ?? undefined,
      voiceModel: targetVoice?.voiceModel ?? voiceModel ?? undefined,
      ttsProvider: targetVoice?.ttsProvider ?? provider,
    }

    const testText = `你好！我是${friend.name.replace(/\s*\(.*?\)/g, '')}。很高兴和你用中文聊天！`

    setIsPlayingPreview(true)
    speakChinese(testText, previewVoice, {
      onEnd: () => setIsPlayingPreview(false),
      onError: () => setIsPlayingPreview(false),
    })
  }

  const handleApplyCharacterPreset = (preset: CharacterVoiceOption) => {
    setSelectedPresetId(preset.id)
    const selectedVoiceModel = currentTtsModel.includes('kokoro')
      ? preset.kokoroVoice
      : preset.qwenVoice

    setGender(preset.gender)
    setRate(preset.defaultRate)
    setPitch(preset.defaultPitch)
    setVoiceName(preset.edgeVoiceName)
    setVoiceModel(selectedVoiceModel)

    // その声質で試聴
    handlePreview({
      gender: preset.gender,
      rate: preset.defaultRate,
      pitch: preset.defaultPitch,
      voiceName: preset.edgeVoiceName,
      voiceModel: selectedVoiceModel,
      ttsProvider: provider,
    })
  }

  const handleSave = () => {
    stopSpeaking()
    setIsPlayingPreview(false)

    saveTtsProvider(provider)

    const updatedVoice: Voice = {
      quality: 'natural',
      gender,
      rate,
      pitch,
      voiceName: voiceName || undefined,
      voiceModel: voiceModel || undefined,
      ttsProvider: provider,
    }

    onSaveVoice(updatedVoice)
    onClose()
  }

  const handleCardWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current && !scrollRef.current.contains(e.target as Node)) {
      scrollRef.current.scrollTop += e.deltaY
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in"
      onClick={() => {
        stopSpeaking()
        onClose()
      }}
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl border border-rose-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleCardWheel}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-stone-100 flex items-center justify-between flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <FriendAvatar friend={friend} size="sm" shape="circle" />
            <div>
              <h3 className="text-lg font-bold text-stone-900 m-0 flex items-center gap-2">
                <span>{friend.name} の声質カスタマイズ</span>
              </h3>
              <p className="text-xs text-stone-500 m-0 mt-0.5">
                友達キャラクターごとの声のトーンや話者を個別に設定できます
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

        <div
          ref={scrollRef}
          className="px-5 sm:px-6 py-4 space-y-5 text-sm text-stone-700 flex-1 overflow-y-auto overscroll-contain"
        >
          {/* TTS エンジン選択タブ */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-stone-700 block">
                音声合成 (TTS) エンジン:
              </label>
              <span className="text-[10px] text-stone-400">
                モデル: <span className="font-mono text-stone-600 font-semibold">{currentTtsModel.split('/')[1] || currentTtsModel}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProvider('openrouter')}
                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  provider === 'openrouter'
                    ? 'border-rose-400 bg-rose-50/80 text-rose-900 shadow-2xs font-semibold'
                    : 'border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3 text-amber-500" />
                    <span>OpenRouter AI音声</span>
                  </span>
                  {provider === 'openrouter' && <CheckIcon className="w-3.5 h-3.5 text-rose-600" />}
                </div>
                <p className="text-[10px] text-stone-500 m-0 mt-0.5">
                  {hasApiKey ? '推奨・ネイティブ四声 (設定済み)' : '要APIキー (設定で入力)'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setProvider('browser')}
                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  provider === 'browser'
                    ? 'border-rose-400 bg-rose-50/80 text-rose-900 shadow-2xs font-semibold'
                    : 'border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">🌐 ブラウザ / Edge</span>
                  {provider === 'browser' && <CheckIcon className="w-3.5 h-3.5 text-rose-600" />}
                </div>
                <p className="text-[10px] text-stone-500 m-0 mt-0.5">
                  完全無料・キー不要 (端末内蔵音声)
                </p>
              </button>
            </div>
          </div>

          {/* 声質キャラクター選択 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4 text-amber-500" />
                <span>声質キャラクター（話者）を選ぶ:</span>
              </label>
              {provider === 'openrouter' && currentTtsModel.includes('kokoro') && (
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded-md">
                  5人個別声質対応
                </span>
              )}
            </div>

            {/* Qwen Flash選択時のガイドアラート */}
            {provider === 'openrouter' && currentTtsModel.includes('qwen') && (
              <div className="mb-2.5 p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-[11px] text-amber-800 leading-relaxed">
                <div className="font-bold flex items-center gap-1 text-amber-900">
                  <span>💡</span>
                  <span>各友達で別々の声質にしたい場合:</span>
                </div>
                <p className="m-0 mt-0.5 text-amber-700">
                  現在選択中の「Qwen TTS」は、OpenRouter公式仕様により話者が<strong>男性1種 (loongjohn)・女性1種 (longanhuan) の計2種</strong>のみとなります。5人全員を別々の声質で演じ分けるには、設定画面から<strong>「Kokoro 82M」</strong>または<strong>「ブラウザ / Edge」</strong>をお選びください。
                </p>
              </div>
            )}

            <div className="space-y-2">
              {CHARACTER_VOICE_OPTIONS.map((opt) => {
                const isSelected = selectedPresetId === opt.id

                const displayVoiceId =
                  provider === 'browser'
                    ? (opt.edgeVoiceName.includes('Online') ? opt.edgeVoiceName.split(' ')[1] : opt.edgeVoiceName)
                    : currentTtsModel.includes('kokoro')
                      ? opt.kokoroVoice
                      : opt.qwenVoice

                return (
                  <div
                    key={opt.id}
                    onClick={() => handleApplyCharacterPreset(opt)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-rose-400 bg-rose-50/60 shadow-2xs ring-1 ring-rose-400/40'
                        : 'border-stone-200 hover:border-stone-300 bg-stone-50/40 hover:bg-stone-100/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{opt.gender === 'male' ? '👨' : '👩'}</span>
                        <span className="text-xs font-bold text-stone-900">{opt.name}</span>
                        {opt.recommendFor.includes(friend.name.replace(/\s*\(.*?\)/g, '')) && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-rose-500 text-white font-bold rounded-md">
                            推奨
                          </span>
                        )}
                      </div>
                      {isSelected && <CheckIcon className="w-4 h-4 text-rose-600 flex-shrink-0" />}
                    </div>
                    <p className="text-[11px] text-stone-600 m-0 mt-1 leading-relaxed">
                      {opt.desc}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-stone-400">
                      <span>おすすめ: {opt.recommendFor}</span>
                      <span className="font-mono text-stone-500 font-medium">話者ID: {displayVoiceId}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 高度な調整（アコーディオン） */}
          <div className="border border-stone-200/80 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-2.5 bg-stone-50/70 hover:bg-stone-100/60 flex items-center justify-between text-xs font-bold text-stone-700 cursor-pointer"
            >
              <span>⚙️ 話す速度・ピッチの微調整 (任意)</span>
              <ChevronDownIcon
                className={`w-4 h-4 text-stone-400 transition-transform ${
                  showAdvanced ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showAdvanced && (
              <div className="p-4 space-y-4 bg-white border-t border-stone-100">
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

                {/* 音の高さ (pitch) - ブラウザ標準時のみ有効 */}
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
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={pitch}
                    onChange={(e) => setPitch(parseFloat(e.target.value))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-stone-400 mt-1">
                    <span>男性低音 (0.7)</span>
                    <span>標準 (1.0)</span>
                    <span>高音 (1.3)</span>
                  </div>
                </div>

                {/* ブラウザ固有の音声選択 (ブラウザ標準時) */}
                {provider === 'browser' && availableVoices.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      OS / ブラウザ内蔵の音声リスト:
                    </label>
                    <select
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs bg-white focus:border-rose-500 focus:outline-none"
                    >
                      <option value="">自動選択 (推奨)</option>
                      {availableVoices.map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-stone-100 bg-stone-50/80 flex-shrink-0 flex items-center justify-between">
          <button
            type="button"
            onClick={() => handlePreview()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
          >
            {isPlayingPreview ? (
              <>
                <StopCircleIcon className="w-4 h-4 text-rose-600" />
                <span>停止</span>
              </>
            ) : (
              <>
                <SpeakerIcon className="w-4 h-4 text-rose-500" />
                <span>選択中の声質を試聴する</span>
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
