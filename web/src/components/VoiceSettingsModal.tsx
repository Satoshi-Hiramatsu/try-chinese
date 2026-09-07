import { useState, useEffect } from 'react'
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
import { loadOpenAiKey, loadTtsProvider, saveTtsProvider } from '../services/storage'

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
  openAiVoiceModel: string
  defaultRate: number
  defaultPitch: number
}

const CHARACTER_VOICE_OPTIONS: CharacterVoiceOption[] = [
  {
    id: 'char-yunxi',
    name: '青年男性・知性的で温かみのある声 (Yunxi / Onyx)',
    gender: 'male',
    character: '落ち着き・論理的',
    recommendFor: '王浩 (ITエンジニア)',
    desc: '20代の落ち着いた爽やかなトーン。明瞭で聞き取りやすい発音。',
    edgeVoiceName: 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)',
    openAiVoiceModel: 'onyx',
    defaultRate: 0.95,
    defaultPitch: 0.85,
  },
  {
    id: 'char-yunjian',
    name: '男性・快活でエネルギッシュな声 (Yunjian / Echo)',
    gender: 'male',
    character: '元気・前向き',
    recommendFor: '張偉 (フィットネス)',
    desc: 'ハキハキと力強いトーン。スポーツや日常のテンポ良い会話に最適。',
    edgeVoiceName: 'Microsoft Yunjian Online (Natural) - Chinese (Mainland)',
    openAiVoiceModel: 'echo',
    defaultRate: 1.05,
    defaultPitch: 0.95,
  },
  {
    id: 'char-xiaoxiao',
    name: '女性・明るく親しみやすい友達声 (Xiaoxiao / Nova)',
    gender: 'female',
    character: '明るい・フランク',
    recommendFor: '陳美玲 (上海大学生)',
    desc: '同年代の友達と雑談しているような自然で生き生きとしたトーン。',
    edgeVoiceName: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
    openAiVoiceModel: 'nova',
    defaultRate: 0.96,
    defaultPitch: 1.05,
  },
  {
    id: 'char-xiaoyi',
    name: '女性・優しく愛らしいのんびり声 (Xiaoyi / Shimmer)',
    gender: 'female',
    character: '愛嬌・癒やし',
    recommendFor: '李雪 (成都デザイナー)',
    desc: '柔らかく優しいニュアンス。初心者の聞き取りにも最適な心地よい声。',
    edgeVoiceName: 'Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)',
    openAiVoiceModel: 'shimmer',
    defaultRate: 0.88,
    defaultPitch: 1.18,
  },
  {
    id: 'char-xiaochen',
    name: '女性・穏やかで上品な大人の声 (Xiaochen / Alloy)',
    gender: 'female',
    character: '上品・穏やか',
    recommendFor: '林子涵 (杭州写真家)',
    desc: '品格があり旅情を感じさせる、クリアで落ち着きのある発音。',
    edgeVoiceName: 'Microsoft Xiaochen Online (Natural) - Chinese (Mainland)',
    openAiVoiceModel: 'alloy',
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
  const [provider, setProvider] = useState<'browser' | 'openai'>(() => loadTtsProvider('browser'))
  const [gender, setGender] = useState<'female' | 'male'>(friend.voice?.gender || 'female')
  const [rate, setRate] = useState<number>(friend.voice?.rate ?? 0.95)
  const [pitch, setPitch] = useState<number>(friend.voice?.pitch ?? 1.0)
  const [voiceName, setVoiceName] = useState<string>(friend.voice?.voiceName || '')
  const [voiceModel, setVoiceModel] = useState<string>(friend.voice?.voiceModel || 'alloy')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [isPlayingPreview, setIsPlayingPreview] = useState(false)

  const hasOpenAiKey = Boolean(loadOpenAiKey())

  useEffect(() => {
    if (isOpen) {
      setProvider(friend.voice?.ttsProvider || loadTtsProvider('browser'))
      setGender(friend.voice?.gender || 'female')
      setRate(friend.voice?.rate ?? 0.95)
      setPitch(friend.voice?.pitch ?? 1.0)
      setVoiceName(friend.voice?.voiceName || '')
      setVoiceModel(friend.voice?.voiceModel || 'alloy')

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
    setGender(preset.gender)
    setRate(preset.defaultRate)
    setPitch(preset.defaultPitch)
    setVoiceName(preset.edgeVoiceName)
    setVoiceModel(preset.openAiVoiceModel)

    // その声質で試聴
    handlePreview({
      gender: preset.gender,
      rate: preset.defaultRate,
      pitch: preset.defaultPitch,
      voiceName: preset.edgeVoiceName,
      voiceModel: preset.openAiVoiceModel,
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
                声質モデル（キャラクター）や声のトーンを変更できます
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
          {/* TTS エンジン選択タブ */}
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1.5">
              音声合成 (TTS) エンジン:
            </label>
            <div className="grid grid-cols-2 gap-2">
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
                  無料・キー不要 (EdgeでNeural音声)
                </p>
              </button>

              <button
                type="button"
                onClick={() => setProvider('openai')}
                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  provider === 'openai'
                    ? 'border-rose-400 bg-rose-50/80 text-rose-900 shadow-2xs font-semibold'
                    : 'border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3 text-amber-500" />
                    <span>OpenAI TTS</span>
                  </span>
                  {provider === 'openai' && <CheckIcon className="w-3.5 h-3.5 text-rose-600" />}
                </div>
                <p className="text-[10px] text-stone-500 m-0 mt-0.5">
                  {hasOpenAiKey ? '超高音質AI音声 (設定済み)' : '要OpenAIキー (設定で入力)'}
                </p>
              </button>
            </div>
          </div>

          {/* 声質キャラクター選択 */}
          <div>
            <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5 mb-2">
              <SparklesIcon className="w-4 h-4 text-amber-500" />
              <span>声質モデル（スピーカー）を選ぶ:</span>
            </label>
            <div className="space-y-2">
              {CHARACTER_VOICE_OPTIONS.map((opt) => {
                const isSelected =
                  gender === opt.gender &&
                  (provider === 'openai'
                    ? voiceModel === opt.openAiVoiceModel
                    : voiceName === opt.edgeVoiceName || Math.abs(pitch - opt.defaultPitch) < 0.06)

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
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-stone-400">
                      <span>おすすめ: {opt.recommendFor}</span>
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

                {/* 特定のブラウザ音声選択 */}
                {availableVoices.length > 0 && (
                  <div>
                    <label className="text-xs font-bold text-stone-700 block mb-1">
                      ブラウザ内蔵の音声モデル (任意):
                    </label>
                    <select
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-rose-400 text-stone-700"
                    >
                      <option value="">自動選択 (推奨・キャラクター設定に合わせる)</option>
                      {availableVoices.map((v, i) => (
                        <option key={i} value={v.name}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 音声に関する親切な案内 */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-amber-800">
              <span>💡 声質に関するアドバイス</span>
            </div>
            <p className="m-0 leading-relaxed text-stone-700">
              <strong>【無料ですぐに最高音質で話す方法】</strong><br />
              Windows標準の <strong>Microsoft Edge</strong> で本アプリを開くと、Microsoftの公式Neural音声（Yunxi、Xiaoxiao等）が標準で利用可能になり、ピッチ調整の違和感なく本物の中国語ネイティブの声で会話できます！
            </p>
            <p className="m-0 leading-relaxed text-stone-700">
              <strong>【Chrome等で超高音質AI音声を使う方法】</strong><br />
              OpenAI APIキーをお持ちの場合、上部の「OpenAI TTS」を選択すると、OnyxやNovaなどの極めて流暢なプロ声優級AI音声がご利用いただけます。
            </p>
          </div>
        </div>

        {/* Footer: 試聴 & 保存 */}
        <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between gap-3">
          {/* 試聴ボタン */}
          <button
            type="button"
            onClick={() => handlePreview()}
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
