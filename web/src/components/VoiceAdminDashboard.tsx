/**
 * 声の管理ダッシュボード（管理者画面）
 *
 * 全キャラクターの顔を並べ、割り当てた音声モデル・話者ID・調整値を一覧して直せる。
 * 1人ずつモーダルを開き直さずに、20人分の割り当て状況（未設定・重複）を俯瞰することが目的。
 * URLハッシュ `#admin` から開く。個人利用前提のため認証は設けない。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Friend, TtsDebugRatings, TtsDebugRun, TtsVoiceTuning, Voice } from '../types'
import {
  CloseIcon,
  SpeakerIcon,
  StopCircleIcon,
  SettingsIcon,
  SparklesIcon,
  AlertIcon,
  CheckIcon,
  RotateCwIcon,
  MaleIcon,
  FemaleIcon,
} from './Icons'
import { FriendAvatar } from './FriendAvatar'
import { speakChinese, stopSpeaking } from '../services/speech'
import { getTtsCatalogShared, invalidateTtsCatalog, type TtsCatalogModel } from '../services/ttsCatalog'
import { loadRecentTtsDebugRuns } from '../services/ttsDebugStorage'
import { describeTuning, normalizeTuning } from '../data/ttsVoiceTuning'
import {
  findDuplicateAssignments,
  rememberCurrentBinding,
  switchVoiceModel,
} from '../data/voiceAssignment'
import { CHARACTER_VOICE_OPTIONS, resolveVoiceIdForModel } from '../data/characterVoices'
import { loadCustomVoices, loadTtsModel } from '../services/storage'

interface VoiceAdminDashboardProps {
  isOpen: boolean
  onClose: () => void
  friends: Friend[]
  /** 1人分の声設定を保存する。 */
  onSaveVoice: (friendId: string, voice: Voice) => void
  /** 個別の声質カスタマイズ画面を開く。 */
  onEditFriend: (friend: Friend) => void
}

type FilterKey = 'all' | 'female' | 'male' | 'unassigned'

/** 検証モードの履歴から取り出した「モデル＋話者ID＋調整値」の組み合わせ。 */
interface DebugCombination {
  key: string
  modelId: string
  voiceId?: string
  tuning?: TtsVoiceTuning
  createdAt: string
  ratingAverage?: number
  memo?: string
}

/** 表示名から括弧書きの英語表記を落とす。試聴文と一覧の見出しに使う。 */
function shortName(friend: Friend): string {
  return friend.name.replace(/\s*\(.*?\)/g, '')
}

function previewText(friend: Friend): string {
  return `你好！我是${shortName(friend)}。很高兴和你用中文聊天！`
}

/** モデルIDの表示用短縮。`provider/model` の後半だけを出す。 */
function shortModel(modelId?: string): string {
  if (!modelId) return '未設定'
  return modelId.split('/')[1] || modelId
}

function ratingAverage(ratings?: TtsDebugRatings): number | undefined {
  if (!ratings) return undefined
  const values = Object.values(ratings).filter((value): value is number => typeof value === 'number')
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** 検証履歴を、キャラクターへ割り当てられる組み合わせの一覧に畳む。 */
function toCombinations(runs: TtsDebugRun[]): DebugCombination[] {
  const seen = new Map<string, DebugCombination>()
  for (const run of runs) {
    for (const result of run.results) {
      if (result.status !== 'success') continue
      const tuning = normalizeTuning(result.tuning)
      const key = `${result.modelId}::${result.voiceId || ''}::${tuning ? JSON.stringify(tuning) : ''}`
      if (seen.has(key)) continue
      seen.set(key, {
        key,
        modelId: result.modelId,
        voiceId: result.voiceId,
        tuning,
        createdAt: run.createdAt,
        ratingAverage: ratingAverage(result.ratings),
        memo: result.memo,
      })
    }
  }
  return [...seen.values()].sort((left, right) => {
    const leftScore = left.ratingAverage ?? -1
    const rightScore = right.ratingAverage ?? -1
    if (leftScore !== rightScore) return rightScore - leftScore
    return right.createdAt.localeCompare(left.createdAt)
  })
}

export function VoiceAdminDashboard({
  isOpen,
  onClose,
  friends,
  onSaveVoice,
  onEditFriend,
}: VoiceAdminDashboardProps) {
  const [catalog, setCatalog] = useState<TtsCatalogModel[]>([])
  const [catalogStale, setCatalogStale] = useState(false)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [bulkModel, setBulkModel] = useState<string>(() => loadTtsModel())
  const [filter, setFilter] = useState<FilterKey>('all')
  const [playingFriendId, setPlayingFriendId] = useState<string | null>(null)
  const [isSequential, setIsSequential] = useState(false)
  const [message, setMessage] = useState('')
  /** 一括適用の直前状態。1段階だけ戻せるようにする。 */
  const [undoSnapshot, setUndoSnapshot] = useState<{ voices: Record<string, Voice | undefined>; label: string } | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [combinations, setCombinations] = useState<DebugCombination[]>([])
  const [selectedCombination, setSelectedCombination] = useState<string>('')
  const queueRef = useRef<Friend[]>([])

  const presetOptions = useMemo(() => [...CHARACTER_VOICE_OPTIONS, ...loadCustomVoices()], [isOpen])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    getTtsCatalogShared().then(({ models, stale }) => {
      if (cancelled) return
      setCatalog(models)
      setCatalogStale(stale)
    })
    return () => {
      cancelled = true
    }
  }, [catalogAttempt, isOpen])

  useEffect(() => {
    if (!isOpen || !isImportOpen) return
    void loadRecentTtsDebugRuns(20)
      .then((runs) => setCombinations(toCombinations(runs)))
      .catch(() => setMessage('検証履歴を読み込めませんでした。'))
  }, [isImportOpen, isOpen])

  const stopAll = useCallback(() => {
    queueRef.current = []
    stopSpeaking()
    setPlayingFriendId(null)
    setIsSequential(false)
  }, [])

  useEffect(() => {
    if (!isOpen) stopAll()
  }, [isOpen, stopAll])

  useEffect(() => () => stopAll(), [stopAll])

  const duplicated = useMemo(() => findDuplicateAssignments(friends), [friends])

  const visibleFriends = useMemo(() => {
    if (filter === 'female') return friends.filter((friend) => friend.voice?.gender !== 'male')
    if (filter === 'male') return friends.filter((friend) => friend.voice?.gender === 'male')
    if (filter === 'unassigned') return friends.filter((friend) => !friend.voice?.voiceModel)
    return friends
  }, [filter, friends])

  const unassignedCount = friends.filter((friend) => !friend.voice?.voiceModel).length
  const femaleCount = friends.filter((friend) => friend.voice?.gender !== 'male').length
  const maleCount = friends.filter((friend) => friend.voice?.gender === 'male').length

  if (!isOpen) return null

  const playFriend = (friend: Friend) => {
    if (!friend.id) return
    if (playingFriendId === friend.id && !isSequential) {
      stopAll()
      return
    }
    queueRef.current = []
    stopSpeaking()
    setIsSequential(false)
    setPlayingFriendId(friend.id)
    setMessage('')
    speakChinese(previewText(friend), friend.voice, {
      onEnd: () => setPlayingFriendId(null),
      onError: () => {
        setPlayingFriendId(null)
        setMessage(`${shortName(friend)} の試聴に失敗しました。話者IDとAPIキーをご確認ください。`)
      },
    })
  }

  const playNextInQueue = () => {
    const next = queueRef.current.shift()
    if (!next || !next.id) {
      setPlayingFriendId(null)
      setIsSequential(false)
      return
    }
    setPlayingFriendId(next.id)
    speakChinese(previewText(next), next.voice, {
      onEnd: playNextInQueue,
      onError: playNextInQueue,
    })
  }

  const handleSequentialPreview = () => {
    if (isSequential) {
      stopAll()
      return
    }
    const targets = visibleFriends.filter((friend) => friend.id)
    if (targets.length === 0) return
    // API利用料が発生するため、対象人数を明示してから実行する。
    if (!confirm(`${targets.length}人分をまとめて試聴します。人数分のAPI利用料がかかります。続けますか？`)) return
    setMessage('')
    queueRef.current = [...targets]
    setIsSequential(true)
    playNextInQueue()
  }

  const handleBulkApplyModel = () => {
    const targets = friends.filter((friend) => friend.id)
    if (targets.length === 0) return
    const unresolved = targets.filter((friend) => {
      const restored = friend.voice?.voiceByModel?.[bulkModel]?.voiceModel
      if (restored) return false
      const preset = presetOptions.find(
        (option) =>
          option.kokoroVoice === friend.voice?.voiceModel || option.edgeVoiceName === friend.voice?.voiceName
      )
      return !(preset && resolveVoiceIdForModel(preset, bulkModel))
    }).length

    const warning = unresolved > 0 ? `\nうち${unresolved}人は話者IDが未解決になります（モデル既定の声で再生されます）。` : ''
    if (!confirm(`${targets.length}人の音声モデルを ${bulkModel} に変更します。${warning}\n話者IDと調整値は各キャラクターの記録から復元します。`)) return

    const snapshot: Record<string, Voice | undefined> = {}
    for (const friend of targets) {
      if (!friend.id) continue
      snapshot[friend.id] = friend.voice
      const base: Voice = friend.voice || { quality: 'natural', gender: 'female' }
      const preset = presetOptions.find(
        (option) => option.kokoroVoice === base.voiceModel || option.edgeVoiceName === base.voiceName
      )
      const fallback = preset ? resolveVoiceIdForModel(preset, bulkModel) : undefined
      const next = switchVoiceModel({ ...base, ttsProvider: 'openrouter' }, bulkModel, fallback)
      onSaveVoice(friend.id, next)
    }
    setUndoSnapshot({ voices: snapshot, label: `${targets.length}人を ${shortModel(bulkModel)} に変更` })
    setMessage(`${targets.length}人の音声モデルを ${shortModel(bulkModel)} に変更しました。`)
  }

  const handleUndo = () => {
    if (!undoSnapshot) return
    for (const [friendId, voice] of Object.entries(undoSnapshot.voices)) {
      if (voice) onSaveVoice(friendId, voice)
    }
    setMessage('一括変更を元に戻しました。')
    setUndoSnapshot(null)
  }

  const handleChangeFriendModel = (friend: Friend, modelId: string) => {
    if (!friend.id) return
    const base: Voice = friend.voice || { quality: 'natural', gender: 'female' }
    const preset = presetOptions.find(
      (option) => option.kokoroVoice === base.voiceModel || option.edgeVoiceName === base.voiceName
    )
    const fallback = preset ? resolveVoiceIdForModel(preset, modelId) : undefined
    onSaveVoice(friend.id, switchVoiceModel({ ...base, ttsProvider: 'openrouter' }, modelId, fallback))
  }

  const handleChangeFriendVoiceId = (friend: Friend, voiceId: string) => {
    if (!friend.id) return
    const base: Voice = friend.voice || { quality: 'natural', gender: 'female' }
    onSaveVoice(friend.id, rememberCurrentBinding({ ...base, voiceModel: voiceId || undefined }))
  }

  const handleApplyCombination = (friend: Friend) => {
    if (!friend.id) return
    const combination = combinations.find((item) => item.key === selectedCombination)
    if (!combination) return
    const base: Voice = friend.voice || { quality: 'natural', gender: 'female' }
    const next = rememberCurrentBinding({
      ...base,
      ttsProvider: 'openrouter',
      ttsModel: combination.modelId,
      voiceModel: combination.voiceId,
      voiceTuning: combination.tuning,
    })
    onSaveVoice(friend.id, next)
    setMessage(`${shortName(friend)} に ${shortModel(combination.modelId)} / ${combination.voiceId || '話者未指定'} を割り当てました。`)
  }

  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `すべて (${friends.length})` },
    { key: 'female', label: `女性 (${femaleCount})` },
    { key: 'male', label: `男性 (${maleCount})` },
    { key: 'unassigned', label: `未割り当て (${unassignedCount})` },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs p-2 sm:p-4 flex items-center justify-center animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl border border-rose-100 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-stone-900 m-0 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-rose-500" />
              <span>声の管理ダッシュボード</span>
            </h2>
            <p className="text-xs text-stone-500 m-0 mt-0.5">
              全{friends.length}人の音声モデル・話者IDをまとめて確認し、割り当てを変更できます。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* 一括操作 */}
        <div className="px-5 py-3 border-b border-stone-100 bg-stone-50/70 flex-shrink-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold text-stone-700" htmlFor="admin-bulk-model">
              全員のモデル:
            </label>
            <select
              id="admin-bulk-model"
              value={bulkModel}
              onChange={(e) => setBulkModel(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none cursor-pointer min-w-[16rem]"
            >
              {!catalog.some((model) => model.id === bulkModel) && (
                <option value={bulkModel}>{bulkModel}</option>
              )}
              {catalog.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                  {model.priceNote ? `（${model.priceNote}）` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkApplyModel}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-500 hover:bg-rose-600 text-white shadow-xs cursor-pointer"
            >
              全員に適用
            </button>
            {undoSnapshot && (
              <button
                type="button"
                onClick={handleUndo}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 cursor-pointer flex items-center gap-1"
              >
                <RotateCwIcon className="w-3.5 h-3.5" />
                <span>元に戻す</span>
              </button>
            )}
            {catalogStale && (
              <button
                type="button"
                onClick={() => {
                  invalidateTtsCatalog()
                  setCatalogAttempt((current) => current + 1)
                }}
                className="px-2.5 py-1.5 text-[11px] font-bold rounded-xl bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer flex items-center gap-1"
              >
                <AlertIcon className="w-3.5 h-3.5" />
                <span>一覧が古い可能性・再取得</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 bg-stone-100 rounded-xl">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filter === tab.key ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSequentialPreview}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 cursor-pointer flex items-center gap-1.5"
            >
              {isSequential ? (
                <>
                  <StopCircleIcon className="w-3.5 h-3.5 text-rose-600" />
                  <span>通し試聴を停止</span>
                </>
              ) : (
                <>
                  <SpeakerIcon className="w-3.5 h-3.5 text-rose-500" />
                  <span>表示中を通し試聴 ({visibleFriends.length}人)</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsImportOpen((current) => !current)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer flex items-center gap-1.5 ${
                isImportOpen
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
              <span>検証モードの結果から取り込み</span>
            </button>
          </div>

          {message && (
            <p role="status" className="m-0 text-[11px] text-stone-600 bg-white border border-stone-200 rounded-xl px-3 py-1.5">
              {message}
            </p>
          )}
        </div>

        {/* 検証履歴からの取り込みパネル */}
        {isImportOpen && (
          <div className="px-5 py-3 border-b border-stone-100 bg-amber-50/40 flex-shrink-0">
            {combinations.length === 0 ? (
              <p className="m-0 text-xs text-stone-600">
                保存された検証結果がありません。TTSモデル検証モードで生成すると、ここに候補が並びます。
              </p>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700 block" htmlFor="admin-combination">
                  取り込む組み合わせ（成功した生成のみ・評価の高い順）:
                </label>
                <select
                  id="admin-combination"
                  value={selectedCombination}
                  onChange={(e) => setSelectedCombination(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none cursor-pointer"
                >
                  <option value="">（選択してください）</option>
                  {combinations.map((combination) => (
                    <option key={combination.key} value={combination.key}>
                      {shortModel(combination.modelId)} / {combination.voiceId || '話者未指定'}
                      {combination.ratingAverage !== undefined ? ` ★${combination.ratingAverage.toFixed(1)}` : ''}
                      {describeTuning(combination.tuning) ? ` / ${describeTuning(combination.tuning)}` : ''}
                      {combination.memo ? ` / ${combination.memo}` : ''}
                    </option>
                  ))}
                </select>
                <p className="m-0 text-[11px] text-stone-500">
                  選んだあと、各カードの「取り込む」を押すとそのキャラクターへ割り当てます。
                </p>
              </div>
            )}
          </div>
        )}

        {/* キャラクター一覧 */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {visibleFriends.length === 0 ? (
            <p className="py-10 text-center text-xs text-stone-400">該当するキャラクターがいません。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {visibleFriends.map((friend) => {
                const isPlaying = playingFriendId === friend.id
                const modelId = friend.voice?.ttsModel || ''
                const catalogModel = catalog.find((model) => model.id === modelId)
                const modelVoices = catalogModel?.supportedVoices ?? []
                const isDuplicated = friend.id ? duplicated.has(friend.id) : false
                const tuningSummary = describeTuning(friend.voice?.voiceTuning)

                return (
                  <div
                    key={friend.id}
                    className={`p-3 rounded-2xl border bg-white transition-all ${
                      isPlaying ? 'border-rose-400 ring-2 ring-rose-300/50 shadow-xs' : 'border-stone-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FriendAvatar friend={friend} size="md" shape="circle" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          {friend.voice?.gender === 'male' ? (
                            <MaleIcon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                          ) : (
                            <FemaleIcon className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                          )}
                          <span className="text-xs font-bold text-stone-900 truncate">{shortName(friend)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {!friend.voice?.voiceModel && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-md">
                              話者ID未設定
                            </span>
                          )}
                          {isDuplicated && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-800 font-bold rounded-md">
                              話者ID重複
                            </span>
                          )}
                          {friend.voice?.ttsProvider === 'browser' && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-sky-100 text-sky-800 font-bold rounded-md">
                              ブラウザ音声
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 space-y-1.5">
                      <select
                        value={modelId}
                        onChange={(e) => handleChangeFriendModel(friend, e.target.value)}
                        aria-label={`${shortName(friend)} の音声モデル`}
                        className="w-full px-2 py-1.5 text-[11px] bg-white border border-stone-300 rounded-lg focus:border-rose-500 focus:outline-none cursor-pointer"
                      >
                        {!catalog.some((model) => model.id === modelId) && (
                          <option value={modelId}>{modelId || '（未設定）'}</option>
                        )}
                        {catalog.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName}
                          </option>
                        ))}
                      </select>

                      {modelVoices.length > 0 ? (
                        <select
                          value={friend.voice?.voiceModel || ''}
                          onChange={(e) => handleChangeFriendVoiceId(friend, e.target.value)}
                          aria-label={`${shortName(friend)} の話者`}
                          className="w-full px-2 py-1.5 text-[11px] font-mono bg-white border border-stone-300 rounded-lg focus:border-rose-500 focus:outline-none cursor-pointer"
                        >
                          <option value="">（モデル既定の話者）</option>
                          {!modelVoices.includes(friend.voice?.voiceModel || '') && friend.voice?.voiceModel && (
                            <option value={friend.voice.voiceModel}>{friend.voice.voiceModel}</option>
                          )}
                          {modelVoices.map((voice) => (
                            <option key={voice} value={voice}>
                              {voice}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          defaultValue={friend.voice?.voiceModel || ''}
                          onBlur={(e) => {
                            if (e.target.value.trim() !== (friend.voice?.voiceModel || '')) {
                              handleChangeFriendVoiceId(friend, e.target.value.trim())
                            }
                          }}
                          placeholder="話者ID (reference_id)"
                          aria-label={`${shortName(friend)} の話者ID`}
                          className="w-full px-2 py-1.5 text-[11px] font-mono bg-white border border-stone-300 rounded-lg focus:border-rose-500 focus:outline-none"
                        />
                      )}

                      {tuningSummary && (
                        <p className="m-0 text-[10px] text-stone-500 truncate" title={tuningSummary}>
                          調整: {tuningSummary}
                        </p>
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => playFriend(friend)}
                        className="flex-1 py-1.5 text-[11px] font-bold rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer flex items-center justify-center gap-1"
                      >
                        {isPlaying ? (
                          <>
                            <StopCircleIcon className="w-3.5 h-3.5 text-rose-600" />
                            <span>停止</span>
                          </>
                        ) : (
                          <>
                            <SpeakerIcon className="w-3.5 h-3.5 text-rose-500" />
                            <span>試聴</span>
                          </>
                        )}
                      </button>
                      {isImportOpen && selectedCombination && (
                        <button
                          type="button"
                          onClick={() => handleApplyCombination(friend)}
                          className="px-2 py-1.5 text-[11px] font-bold rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 cursor-pointer flex items-center gap-1"
                          title="選択中の検証結果をこのキャラクターへ割り当てる"
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                          <span>取り込む</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          stopAll()
                          onEditFriend(friend)
                        }}
                        aria-label={`${shortName(friend)} の声質を詳しく設定`}
                        className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
                        title="声質カスタマイズを開く"
                      >
                        <SettingsIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-stone-100 bg-stone-50/80 flex-shrink-0 flex items-center justify-between">
          <p className="m-0 text-[11px] text-stone-500">
            変更は即座に保存されます。試聴と通し試聴にはAPI利用料がかかります。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-stone-200 hover:bg-stone-300 text-stone-700 cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
