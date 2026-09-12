import { useState, useEffect, useRef, useMemo } from 'react'
import type { Friend, TtsVoiceTuning, Voice, VoiceModelBinding } from '../types'
import {
  CloseIcon,
  SpeakerIcon,
  StopCircleIcon,
  SparklesIcon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
  MaleIcon,
  FemaleIcon,
  GlobeIcon,
  SettingsIcon,
  RotateCwIcon,
} from './Icons'
import { FriendAvatar } from './FriendAvatar'
import {
  getChineseVoices,
  speakChinese,
  stopSpeaking,
  getAvailableVoices,
} from '../services/speech'
import {
  loadTtsProvider,
  saveTtsProvider,
  loadTtsModel,
  loadCustomVoices,
  saveCustomVoice,
  deleteCustomVoice,
} from '../services/storage'
import {
  CHARACTER_VOICE_OPTIONS,
  hasPresetVoiceForModel,
  resolveVoiceIdForModel,
  type CharacterVoiceOption,
} from '../data/characterVoices'
import { getTtsTuningCapability, normalizeTuning } from '../data/ttsVoiceTuning'
import { switchVoiceModel, rememberCurrentBinding } from '../data/voiceAssignment'
import {
  getTtsCatalogShared,
  invalidateTtsCatalog,
  type TtsCatalogModel,
} from '../services/ttsCatalog'
import { VoiceTuningFields } from './VoiceTuningFields'
import { loadUsableApiKey } from '../services/openRouterKey'
import { canSpeakWithFreeModel } from '../services/freeMode'

/**
 * 声質キャラクターの話者IDを、選択中のモデルの話者へ読み替える。
 * ブラウザ音声は端末側の音声名で鳴らすため、表示用に Kokoro の話者IDを流用する。
 */
function presetVoiceForModel(preset: CharacterVoiceOption, modelId: string): string {
  return resolveVoiceIdForModel(preset, modelId) || preset.kokoroVoice
}

/** 声質キャラクター一覧で話者を選べるモデルか。 */
function usesCharacterPresets(
  provider: 'browser' | 'openrouter',
  modelId: string,
  options: readonly CharacterVoiceOption[]
): boolean {
  return provider === 'browser' || hasPresetVoiceForModel(options, modelId)
}

interface VoiceSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  friend: Friend
  onSaveVoice: (updatedVoice: Voice) => void
}

export function VoiceSettingsModal({
  isOpen,
  onClose,
  friend,
  onSaveVoice,
}: VoiceSettingsModalProps) {
  const [provider, setProvider] = useState<'browser' | 'openrouter'>(() =>
    loadTtsProvider('openrouter')
  )
  const [gender, setGender] = useState<'female' | 'male'>(
    friend.voice?.gender || 'female'
  )
  const [rate, setRate] = useState<number>(friend.voice?.rate ?? 0.95)
  const [pitch, setPitch] = useState<number>(friend.voice?.pitch ?? 1.0)
  const [voiceName, setVoiceName] = useState<string>(friend.voice?.voiceName || '')
  const [voiceModel, setVoiceModel] = useState<string>(
    friend.voice?.voiceModel || 'longanhuan_v3.6'
  )

  // 性別・カスタム切り替えタブ ('all' | 'male' | 'female' | 'custom')
  const [voiceTab, setVoiceTab] = useState<'all' | 'male' | 'female' | 'custom'>(
    () => (friend.voice?.gender === 'male' ? 'male' : 'female')
  )

  // カスタム声質リスト
  const [customVoices, setCustomVoices] = useState<CharacterVoiceOption[]>(() =>
    loadCustomVoices()
  )

  // カスタム声質作成フォームの表示状態
  const [isCreatingCustom, setIsCreatingCustom] = useState(false)
  const [customFormName, setCustomFormName] = useState('')
  const [customFormGender, setCustomFormGender] = useState<'female' | 'male'>('female')
  const [customFormKokoro, setCustomFormKokoro] = useState('zf_xiaoxiao')
  const [customFormEdge, setCustomFormEdge] = useState(
    'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)'
  )
  const [customFormRate, setCustomFormRate] = useState(0.95)
  const [customFormPitch, setCustomFormPitch] = useState(1.0)
  const [customFormDesc, setCustomFormDesc] = useState('')

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

  // 使えるキー（有効、または未確認で前回無効ではない）があるか。無ければ再生は無料モードになる。
  const hasApiKey = Boolean(loadUsableApiKey())
  const [currentTtsModel, setCurrentTtsModel] = useState(friend.voice?.ttsModel || loadTtsModel())
  const [previewError, setPreviewError] = useState('')
  /** OpenRouterで音声出力できるモデル一覧。話者はモデルごとに異なるため実行時に取得する。 */
  const [catalog, setCatalog] = useState<TtsCatalogModel[]>([])
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'ready'>('idle')
  /** OpenRouterから取得できず、コード内の既知モデルだけを表示している状態。 */
  const [catalogStale, setCatalogStale] = useState(false)
  /** 取得のやり直し用。値が変わるたびに取得し直す。 */
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  /** 話者一覧を持たないモデルで声を固定するための調整値。 */
  const [tuning, setTuning] = useState<TtsVoiceTuning>(() => friend.voice?.voiceTuning || {})
  /** モデルIDごとに覚えておく話者ID・調整値。モデルを往復しても設定を失わないために持つ。 */
  const [voiceByModel, setVoiceByModel] = useState<Record<string, VoiceModelBinding> | undefined>(
    () => friend.voice?.voiceByModel
  )

  // 全声質リスト（プリセット＋カスタム）
  const allVoices = useMemo(() => {
    return [...CHARACTER_VOICE_OPTIONS, ...customVoices]
  }, [customVoices])

  // タブに応じたフィルタリング
  const filteredVoices = useMemo(() => {
    if (voiceTab === 'male') {
      return allVoices.filter((v) => v.gender === 'male')
    }
    if (voiceTab === 'female') {
      return allVoices.filter((v) => v.gender === 'female')
    }
    if (voiceTab === 'custom') {
      return allVoices.filter((v) => v.isCustom)
    }
    return allVoices
  }, [allVoices, voiceTab])

  const maleCount = useMemo(
    () => allVoices.filter((v) => v.gender === 'male').length,
    [allVoices]
  )
  const femaleCount = useMemo(
    () => allVoices.filter((v) => v.gender === 'female').length,
    [allVoices]
  )

  useEffect(() => {
    if (isOpen) {
      const currentCustoms = loadCustomVoices()
      setCustomVoices(currentCustoms)
      setCurrentTtsModel(friend.voice?.ttsModel || loadTtsModel())
      setPreviewError('')
      setProvider(friend.voice?.ttsProvider || loadTtsProvider('openrouter'))
      setGender(friend.voice?.gender || 'female')
      setRate(friend.voice?.rate ?? 0.95)
      setPitch(friend.voice?.pitch ?? 1.0)
      setVoiceName(friend.voice?.voiceName || '')
      setVoiceModel(friend.voice?.voiceModel || 'longanhuan_v3.6')
      setTuning(friend.voice?.voiceTuning || {})
      setVoiceByModel(friend.voice?.voiceByModel)

      // 初回タブ選択: 友達の性別に合わせる
      setVoiceTab(friend.voice?.gender === 'male' ? 'male' : 'female')
      setIsCreatingCustom(false)

      const combined = [...CHARACTER_VOICE_OPTIONS, ...currentCustoms]
      const matched = combined.find(opt => opt.kokoroVoice === friend.voice?.voiceModel)
        ?? combined.find(opt => opt.qwenVoice === friend.voice?.voiceModel)
        ?? combined.find(opt => opt.edgeVoiceName === friend.voice?.voiceName)
      setSelectedPresetId(matched?.id ?? '')

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

  // 利用できるモデルと話者はOpenRouter側で随時変わるため、開いた時点で取得する。
  // 取得状態を依存に入れると、取得開始の状態更新でこの効果自身がキャンセルされてしまうため、
  // 依存は「開いているか」「どのエンジンか」だけに絞る。
  useEffect(() => {
    if (!isOpen || provider !== 'openrouter') return
    let cancelled = false
    setCatalogState('loading')
    // 取得できないときも既知のモデルが返るため、失敗でセレクトが空になることはない。
    getTtsCatalogShared().then(({ models, stale }) => {
      if (cancelled) return
      setCatalog(models)
      setCatalogStale(stale)
      setCatalogState('ready')
    })
    return () => {
      cancelled = true
    }
  }, [catalogAttempt, isOpen, provider])

  const catalogModel = useMemo(
    () => catalog.find((model) => model.id === currentTtsModel),
    [catalog, currentTtsModel]
  )
  const tuningCapability = useMemo(() => getTtsTuningCapability(currentTtsModel), [currentTtsModel])
  const showsPresetList = usesCharacterPresets(provider, currentTtsModel, allVoices)
  const modelVoices = catalogModel?.supportedVoices ?? []
  // 選択中モデルがカタログに無いときも、そのモデルを選択肢として残す。
  const modelOptions = useMemo(() => {
    if (catalog.some((model) => model.id === currentTtsModel)) return catalog
    return [
      {
        id: currentTtsModel,
        displayName: currentTtsModel,
        languages: [] as readonly string[],
        priceNote: '',
      } as TtsCatalogModel,
      ...catalog,
    ]
  }, [catalog, currentTtsModel])
  const chineseModels = modelOptions.filter((model) => model.languages.includes('zh'))
  const otherModels = modelOptions.filter((model) => !model.languages.includes('zh'))

  /** いま画面で編集している内容を Voice の形にまとめる。 */
  const buildDraftVoice = (): Voice => ({
    ttsModel: currentTtsModel,
    quality: 'natural',
    gender,
    rate,
    pitch,
    voiceName: voiceName || undefined,
    voiceModel: voiceModel || undefined,
    ttsProvider: provider,
    voiceTuning: normalizeTuning(tuning),
    voiceByModel,
  })

  if (!isOpen) return null

  const handlePreview = (targetVoice?: Partial<Voice>) => {
    if (isPlayingPreview && !targetVoice) {
      stopSpeaking()
      setIsPlayingPreview(false)
      return
    }

    stopSpeaking()
    setPreviewError('')
    const previewVoice: Voice = {
      ttsModel: targetVoice?.ttsModel ?? currentTtsModel,
      quality: 'natural',
      gender: targetVoice?.gender ?? gender,
      rate: targetVoice?.rate ?? rate,
      pitch: targetVoice?.pitch ?? pitch,
      voiceName: targetVoice?.voiceName ?? voiceName ?? undefined,
      voiceModel: targetVoice?.voiceModel ?? voiceModel ?? undefined,
      ttsProvider: targetVoice?.ttsProvider ?? provider,
      voiceTuning: targetVoice?.voiceTuning ?? normalizeTuning(tuning),
    }

    const testText = `你好！我是${friend.name.replace(/\s*\(.*?\)/g, '')}。很高兴和你用中文聊天！`

    setIsPlayingPreview(true)
    speakChinese(testText, previewVoice, {
      onEnd: () => setIsPlayingPreview(false),
      onError: (error) => {
        setIsPlayingPreview(false)
        setPreviewError(error instanceof Error ? error.message : 'Audio playback failed')
      },
    })
  }

  const handleApplyCharacterPreset = (preset: CharacterVoiceOption) => {
    setSelectedPresetId(preset.id)
    // モデルは選択中のものを保つ。話者IDだけをそのモデル向けに読み替える。
    const selectedVoiceModel = presetVoiceForModel(preset, currentTtsModel)
    setVoiceByModel((current) => ({
      ...(current || {}),
      [currentTtsModel]: { voiceModel: selectedVoiceModel, voiceTuning: normalizeTuning(tuning) },
    }))

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
      ttsModel: currentTtsModel,
      ttsProvider: provider,
    })
  }

  /**
   * 音声モデルを切り替える。
   *
   * 切替前の話者ID・調整値はモデルIDごとに覚えておき、戻ってきたときに復元する。
   * 初めて選ぶモデルでは、声質キャラクターの対応表かカタログの既定話者から埋める。
   */
  const handleChangeModel = (modelId: string) => {
    setPreviewError('')

    const preset = allVoices.find((option) => option.id === selectedPresetId)
    const presetVoice = preset ? resolveVoiceIdForModel(preset, modelId) : undefined
    const next = catalog.find((model) => model.id === modelId)
    // 話者一覧を公開しないモデル（Fish Audio など）は空にして、IDの入力で固定する。
    const catalogVoice = next && next.supportedVoices.length > 0 ? next.defaultVoice : undefined
    const switched = switchVoiceModel(buildDraftVoice(), modelId, presetVoice || catalogVoice)

    setCurrentTtsModel(modelId)
    setVoiceByModel(switched.voiceByModel)
    setVoiceModel(switched.voiceModel || '')
    setTuning(switched.voiceTuning || {})
  }

  /** モデル一覧を取得し直す。通信できずに既知モデルだけを出しているときに使う。 */
  const handleReloadCatalog = () => {
    invalidateTtsCatalog()
    setCatalogAttempt((current) => current + 1)
  }

  // カスタム声質の作成・保存
  const handleSaveCustomOption = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customFormName.trim()) return

    const newId = `custom-voice-${Date.now()}`
    const newCustom: CharacterVoiceOption = {
      id: newId,
      name: customFormName.trim(),
      gender: customFormGender,
      character: 'カスタム',
      recommendFor: `${customFormName.trim()} (独自設定)`,
      desc: customFormDesc.trim() || 'ユーザーが独自に作成した声質設定です。',
      edgeVoiceName: customFormEdge,
      qwenVoice: customFormGender === 'male' ? 'loongjohn' : 'longanhuan_v3.6',
      kokoroVoice: customFormKokoro,
      defaultRate: customFormRate,
      defaultPitch: customFormPitch,
      isCustom: true,
    }

    saveCustomVoice(newCustom)
    const updated = loadCustomVoices()
    setCustomVoices(updated)
    setIsCreatingCustom(false)
    handleApplyCharacterPreset(newCustom)
  }

  // カスタム声質の削除
  const handleDeleteCustomOption = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('このカスタム声質を削除しますか？')) {
      deleteCustomVoice(id)
      const updated = loadCustomVoices()
      setCustomVoices(updated)
      if (selectedPresetId === id) {
        setSelectedPresetId(CHARACTER_VOICE_OPTIONS[0].id)
      }
    }
  }

  const handleSave = () => {
    stopSpeaking()
    setIsPlayingPreview(false)

    saveTtsProvider(provider)

    // 選択中モデルの話者ID・調整値も voiceByModel に残し、次に開いたとき復元できるようにする。
    const updatedVoice = rememberCurrentBinding(buildDraftVoice())

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
                モデル:{' '}
                <span className="font-mono text-stone-600 font-semibold">
                  {currentTtsModel.split('/')[1] || currentTtsModel}
                </span>
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
                  {provider === 'openrouter' && (
                    <CheckIcon className="w-3.5 h-3.5 text-rose-600" />
                  )}
                </div>
                <p className="text-[10px] text-stone-500 m-0 mt-0.5">
                  {hasApiKey
                    ? '推奨・ネイティブ四声 (設定済み)'
                    : 'キー未入力 · 無料モデルで再生'}
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
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <GlobeIcon className="w-3.5 h-3.5 text-sky-600" />
                    <span>ブラウザ / Edge</span>
                  </span>
                  {provider === 'browser' && (
                    <CheckIcon className="w-3.5 h-3.5 text-rose-600" />
                  )}
                </div>
                <p className="text-[10px] text-stone-500 m-0 mt-0.5">
                  完全無料・キー不要 (端末内蔵音声)
                </p>
              </button>
            </div>
          </div>

          {/* 無料モードの注記。保存値は変えず、再生時にだけ差し替わることを伝える */}
          {provider === 'openrouter' && !hasApiKey && (
            <p className="m-0 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
              いまは無料モード（APIキー未入力）のため、再生時は Fish Audio S2.1 Pro (Free) に自動で切り替わります。
              {canSpeakWithFreeModel(
                {
                  quality: 'natural',
                  gender,
                  ttsProvider: provider,
                  ttsModel: currentTtsModel,
                  voiceModel: voiceModel || undefined,
                  voiceByModel: friend.voice?.voiceByModel,
                },
                { globalProvider: loadTtsProvider('openrouter'), globalModel: loadTtsModel() }
              )
                ? ' この友達は Fish の話者IDがあるので、その声で鳴ります。'
                : ' この友達は Fish の話者IDが無いため、ブラウザ音声で鳴ります。'}
              ここでの設定はそのまま保存され、キーを入れると有効になります。
            </p>
          )}

          {/* 音声モデル選択（OpenRouter利用時のみ。話者はモデルごとに異なる） */}
          {provider === 'openrouter' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5" htmlFor="tts-model-select">
                  <SparklesIcon className="w-4 h-4 text-amber-500" />
                  <span>音声モデルを選ぶ:</span>
                </label>
                {catalogState === 'loading' ? (
                  <span className="text-[10px] text-stone-400">モデル一覧を取得中…</span>
                ) : (
                  <span className="text-[10px] text-stone-400">
                    {modelOptions.length}件から選べます
                  </span>
                )}
              </div>
              <select
                id="tts-model-select"
                value={currentTtsModel}
                onChange={(e) => handleChangeModel(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none cursor-pointer"
              >
                {chineseModels.length > 0 && (
                  <optgroup label="中国語・日本語向け">
                    {chineseModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName}
                        {model.priceNote ? `（${model.priceNote}）` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherModels.length > 0 && (
                  <optgroup label="その他のモデル">
                    {otherModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName}
                        {model.priceNote ? `（${model.priceNote}）` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="m-0 mt-1 text-[10px] text-stone-500 leading-snug">
                {catalogModel?.note || 'モデルによって使える話者と音質が変わります。'}
              </p>
              {catalogStale && catalogState === 'ready' && (
                <div className="mt-1.5 flex items-start justify-between gap-2 p-2 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="m-0 text-[10px] text-amber-800 leading-snug">
                    最新のモデル一覧を取得できなかったため、既知のモデルのみ表示しています。価格と話者一覧は表示されません。
                  </p>
                  <button
                    type="button"
                    onClick={handleReloadCatalog}
                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer"
                  >
                    <RotateCwIcon className="w-3 h-3" />
                    <span>再取得</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 声質キャラクター選択セクション */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4 text-amber-500" />
                <span>{showsPresetList ? '声質キャラクター（話者）を選ぶ:' : '話者を選ぶ:'}</span>
              </label>
              {provider === 'openrouter' && currentTtsModel.includes('kokoro') && (
                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded-md">
                  全8話者個別対応
                </span>
              )}
            </div>

            <p className="mb-3 text-xs text-stone-600">
              {provider !== 'openrouter'
                ? '端末にない声は再現できません。声質を変えるにはAI音声を選んでください。'
                : currentTtsModel.includes('kokoro')
                  ? '話者を選ぶとKokoroの中国語8話者で声質を切り替えます。API利用料がかかります。ピッチ調整はブラウザ音声専用です。'
                  : currentTtsModel.includes('qwen')
                    ? '声質キャラクターはQwenの話者に読み替えて適用します。API利用料がかかります。'
                    : 'このモデルの話者から選びます。API利用料がかかります。ピッチ調整はブラウザ音声専用です。'}
            </p>
            {previewError && <p role="alert" className="mb-3 text-xs text-red-700">{previewError}</p>}

            {/* モデル固有の話者選択（声質キャラクター一覧に対応表を持たないモデル） */}
            {!showsPresetList && (
              <div className="mb-3 p-3 rounded-2xl border border-stone-200 bg-stone-50/60 space-y-2">
                {modelVoices.length > 0 ? (
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1" htmlFor="tts-voice-select">
                      話者（全{modelVoices.length}件）:
                    </label>
                    <select
                      id="tts-voice-select"
                      value={voiceModel}
                      onChange={(e) => setVoiceModel(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none cursor-pointer"
                    >
                      {!modelVoices.includes(voiceModel) && <option value={voiceModel}>{voiceModel || '（未選択）'}</option>}
                      {catalogModel && catalogModel.voicePresets.length > 0 && (
                        <optgroup label="おすすめ">
                          {catalogModel.voicePresets.map((preset) => (
                            <option key={`preset-${preset.id}`} value={preset.id}>{preset.label}</option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="すべての話者">
                        {modelVoices.map((voice) => (
                          <option key={voice} value={voice}>{voice}</option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                ) : (
                  <p className="m-0 text-[11px] text-stone-600 leading-snug">
                    このモデルは話者一覧を公開していません。下の設定で声を固定・調整できます。
                  </p>
                )}

                <VoiceTuningFields
                  capability={tuningCapability}
                  tuning={tuning}
                  onChange={setTuning}
                  voiceId={modelVoices.length === 0 ? voiceModel : undefined}
                  onVoiceIdChange={modelVoices.length === 0 ? setVoiceModel : undefined}
                />

                <button
                  type="button"
                  onClick={() => handlePreview()}
                  className="w-full py-2 text-xs font-bold rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-stone-700 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <SpeakerIcon className="w-3.5 h-3.5 text-rose-500" />
                  <span>この設定で試聴</span>
                </button>
              </div>
            )}

            {/* 声質キャラクター一覧。話者IDを読み替えられるモデルとブラウザ音声のみ表示する。 */}
            {showsPresetList && (
            <>
            <div className="flex gap-1.5 p-1 bg-stone-100 rounded-xl mb-3">
              <button
                type="button"
                onClick={() => {
                  setVoiceTab('all')
                  setIsCreatingCustom(false)
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  voiceTab === 'all'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                すべて ({allVoices.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoiceTab('male')
                  setIsCreatingCustom(false)
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  voiceTab === 'male'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <MaleIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>男性 ({maleCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoiceTab('female')
                  setIsCreatingCustom(false)
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  voiceTab === 'female'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <FemaleIcon className="w-3.5 h-3.5 text-rose-500" />
                <span>女性 ({femaleCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoiceTab('custom')
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  voiceTab === 'custom'
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <SettingsIcon className="w-3.5 h-3.5 text-stone-600" />
                <span>カスタム</span>
                {customVoices.length > 0 && (
                  <span className="text-[10px] px-1 bg-stone-200 text-stone-700 rounded-full font-bold">
                    {customVoices.length}
                  </span>
                )}
              </button>
            </div>

            {/* カスタム作成ボタン・作成フォーム */}
            {voiceTab === 'custom' && !isCreatingCustom && (
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => setIsCreatingCustom(true)}
                  className="w-full py-2.5 px-3 rounded-2xl border-2 border-dashed border-rose-300 hover:border-rose-400 bg-rose-50/50 hover:bg-rose-50 text-rose-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>＋ 独自の声質キャラクターを作成</span>
                </button>
              </div>
            )}

            {/* 新規カスタム声質作成フォーム */}
            {isCreatingCustom && (
              <form
                onSubmit={handleSaveCustomOption}
                className="mb-3 p-3.5 rounded-2xl border border-rose-200 bg-rose-50/40 space-y-3 animate-fade-in"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-900 flex items-center gap-1">
                    <SparklesIcon className="w-3.5 h-3.5 text-rose-500" />
                    <span>オリジナル声質キャラクターの作成</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCreatingCustom(false)}
                    className="text-stone-400 hover:text-stone-600 text-xs cursor-pointer"
                  >
                    閉じる
                  </button>
                </div>

                {/* 名前 */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    声の名前・キャラクター名:
                  </label>
                  <input
                    type="text"
                    required
                    value={customFormName}
                    onChange={(e) => setCustomFormName(e.target.value)}
                    placeholder="例: 私の落ち着いた低音ボイス"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none"
                  />
                </div>

                {/* 性別 */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    声の性別:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomFormGender('female')}
                      className={`py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        customFormGender === 'female'
                          ? 'border-rose-400 bg-rose-500 text-white shadow-xs'
                          : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <FemaleIcon className="w-3.5 h-3.5" />
                      <span>女性声</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomFormGender('male')}
                      className={`py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                        customFormGender === 'male'
                          ? 'border-rose-400 bg-rose-500 text-white shadow-xs'
                          : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      <MaleIcon className="w-3.5 h-3.5" />
                      <span>男性声</span>
                    </button>
                  </div>
                </div>

                {/* 話者選択 (Kokoro 8話者) */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    AI音声話者 (Kokoro ID):
                  </label>
                  <select
                    value={customFormKokoro}
                    onChange={(e) => setCustomFormKokoro(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none"
                  >
                    <optgroup label="男性ボイス (zm_)">
                      <option value="zm_yunxi">zm_yunxi (青年・知性・爽やか)</option>
                      <option value="zm_yunjian">zm_yunjian (元気・快活・スポーツ)</option>
                      <option value="zm_yunyang">zm_yunyang (誠実・落ち着き・プロ)</option>
                      <option value="zm_yunxia">zm_yunxia (少年・活力・フランク)</option>
                    </optgroup>
                    <optgroup label="女性ボイス (zf_)">
                      <option value="zf_xiaoxiao">zf_xiaoxiao (親しみ・自然・友達)</option>
                      <option value="zf_xiaoyi">zf_xiaoyi (優しい・のんびり・癒やし)</option>
                      <option value="zf_xiaoni">zf_xiaoni (キュート・元気・少女)</option>
                      <option value="zf_xiaobei">zf_xiaobei (明瞭・上品・クリア)</option>
                    </optgroup>
                  </select>
                </div>

                {/* Edge/ブラウザ音声名 */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    ブラウザ / Edge音声 (端末再生時):
                  </label>
                  <select
                    value={customFormEdge}
                    onChange={(e) => setCustomFormEdge(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none"
                  >
                    <option value="Microsoft Yunxi Online (Natural) - Chinese (Mainland)">
                      Microsoft Yunxi Online (Natural) - 男性爽やか
                    </option>
                    <option value="Microsoft Yunjian Online (Natural) - Chinese (Mainland)">
                      Microsoft Yunjian Online (Natural) - 男性快活
                    </option>
                    <option value="Microsoft Yunyang Online (Natural) - Chinese (Mainland)">
                      Microsoft Yunyang Online (Natural) - 男性誠実プロ
                    </option>
                    <option value="Microsoft Yunxia Online (Natural) - Chinese (Mainland)">
                      Microsoft Yunxia Online (Natural) - 少年フランク
                    </option>
                    <option value="Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)">
                      Microsoft Xiaoxiao Online (Natural) - 女性友達
                    </option>
                    <option value="Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)">
                      Microsoft Xiaoyi Online (Natural) - 女性優しい
                    </option>
                    <option value="Microsoft Xiaochen Online (Natural) - Chinese (Mainland)">
                      Microsoft Xiaochen Online (Natural) - 女性上品
                    </option>
                    <option value="Microsoft Xiaoni Online (Natural) - Chinese (Mainland)">
                      Microsoft Xiaoni Online (Natural) - 少女キュート
                    </option>
                    <option value="Microsoft Xiaobei Online (Natural) - Chinese (Mainland)">
                      Microsoft Xiaobei Online (Natural) - 女性クリア
                    </option>
                  </select>
                </div>

                {/* 速度・ピッチ */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
                      速度: {customFormRate.toFixed(2)}x
                    </label>
                    <input
                      type="range"
                      min="0.7"
                      max="1.3"
                      step="0.05"
                      value={customFormRate}
                      onChange={(e) => setCustomFormRate(parseFloat(e.target.value))}
                      className="w-full accent-rose-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-0.5">
                      ピッチ: {customFormPitch.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0.7"
                      max="1.3"
                      step="0.05"
                      value={customFormPitch}
                      onChange={(e) => setCustomFormPitch(parseFloat(e.target.value))}
                      className="w-full accent-rose-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 説明・メモ */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    特徴・メモ（任意）:
                  </label>
                  <input
                    type="text"
                    value={customFormDesc}
                    onChange={(e) => setCustomFormDesc(e.target.value)}
                    placeholder="例: 早口で明るい関西風のトーン"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      handlePreview({
                        gender: customFormGender,
                        rate: customFormRate,
                        pitch: customFormPitch,
                        voiceName: customFormEdge,
                        voiceModel: customFormKokoro,
                        ttsProvider: provider,
                      })
                    }}
                    className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer flex items-center gap-1"
                  >
                    <SpeakerIcon className="w-3.5 h-3.5 text-rose-500" />
                    <span>試聴</span>
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold rounded-xl bg-rose-500 hover:bg-rose-600 text-white shadow-xs cursor-pointer"
                  >
                    作成して適用
                  </button>
                </div>
              </form>
            )}

            {/* 声質一覧表示 */}
            <div className="space-y-2">
              {filteredVoices.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-400 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                  該当する声質キャラクターがありません
                </div>
              ) : (
                filteredVoices.map((opt) => {
                  const isSelected = selectedPresetId === opt.id

                  const displayVoiceId =
                    provider === 'browser'
                      ? opt.edgeVoiceName.includes('Online')
                        ? opt.edgeVoiceName.split(' ')[1]
                        : opt.edgeVoiceName
                      : presetVoiceForModel(opt, currentTtsModel)

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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="p-1 rounded-lg bg-stone-100 flex items-center justify-center">
                            {opt.gender === 'male' ? (
                              <MaleIcon className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <FemaleIcon className="w-3.5 h-3.5 text-rose-500" />
                            )}
                          </span>
                          <span className="text-xs font-bold text-stone-900">
                            {opt.name}
                          </span>
                          {opt.recommendFor.includes(
                            friend.name.replace(/\s*\(.*?\)/g, '')
                          ) && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-rose-500 text-white font-bold rounded-md">
                              推奨
                            </span>
                          )}
                          {opt.isCustom && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold rounded-md">
                              カスタム
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {opt.isCustom && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCustomOption(opt.id, e)}
                              className="p-1 text-stone-400 hover:text-rose-500 rounded transition-colors cursor-pointer"
                              title="このカスタム声質を削除"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isSelected && (
                            <CheckIcon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-stone-600 m-0 mt-1 leading-relaxed">
                        {opt.desc}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-stone-400">
                        <span>おすすめ: {opt.recommendFor}</span>
                        <span className="font-mono text-stone-500 font-medium">
                          話者ID: {displayVoiceId}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            </>
            )}
          </div>

          {/* 高度な微調整（アコーディオン） */}
          <div className="border border-stone-200/80 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-2.5 bg-stone-50/70 hover:bg-stone-100/60 flex items-center justify-between text-xs font-bold text-stone-700 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <SettingsIcon className="w-3.5 h-3.5 text-stone-500" />
                <span>話す速度・ピッチの微調整 (任意)</span>
              </span>
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
                      {rate <= 0.85
                        ? 'ゆっくり（初心者向け）'
                        : rate >= 1.1
                          ? '速め'
                          : '標準速度'}
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
                      声の高さ (ピッチ):{' '}
                      <span className="font-mono text-rose-600">{pitch.toFixed(2)}</span>
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
