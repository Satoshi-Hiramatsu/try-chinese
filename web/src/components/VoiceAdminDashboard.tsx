/**
 * 声の管理ダッシュボード（開発者向け）。
 *
 * 全キャラクターの Fish Audio 話者ID・調整値を一覧し、カード上で直接変更・試聴する。
 * 開発者モード（#dev）の「声の管理」タブに置く。個人利用前提のため認証は設けない。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Friend, TtsDebugRatings, TtsDebugRun, TtsVoiceTuning, Voice } from '../types'
import {
  SpeakerIcon,
  StopCircleIcon,
  SettingsIcon,
  SparklesIcon,
  CheckIcon,
  MaleIcon,
  FemaleIcon,
  EditIcon,
} from './Icons'
import { FriendAvatar } from './FriendAvatar'
import { speakChinese, stopSpeaking } from '../services/speech'
import { loadRecentTtsDebugRuns } from '../services/ttsDebugStorage'
import { describeTuning, normalizeTuning } from '../data/ttsVoiceTuning'
import { FIXED_TTS_MODEL, findDuplicateAssignments, isFishReferenceId } from '../data/fishVoice'
import { formatVoiceExport } from '../data/voiceExport'

interface VoiceAdminDashboardProps {
  friends: Friend[]
  /** 1人分の声設定を保存する。 */
  onSaveVoice: (friendId: string, voice: Voice) => void
  /** 個別の声設定画面を開く。 */
  onEditFriend: (friend: Friend) => void
}

type FilterKey = 'all' | 'female' | 'male' | 'unassigned'

/** 検証モードの履歴から取り出した「話者ID＋調整値」の組み合わせ。Fish で生成したものだけ。 */
interface DebugCombination {
  key: string
  voiceId: string
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

function ratingAverage(ratings?: TtsDebugRatings): number | undefined {
  if (!ratings) return undefined
  const values = Object.values(ratings).filter((value): value is number => typeof value === 'number')
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** 検証履歴を、キャラクターへ割り当てられる組み合わせの一覧に畳む。Fish 以外のモデルは対象外。 */
function toCombinations(runs: TtsDebugRun[]): DebugCombination[] {
  const seen = new Map<string, DebugCombination>()
  for (const run of runs) {
    for (const result of run.results) {
      if (result.status !== 'success') continue
      if (!result.modelId.startsWith('fish-audio/') || !isFishReferenceId(result.voiceId)) continue
      const tuning = normalizeTuning(result.tuning)
      const key = `${result.voiceId}::${tuning ? JSON.stringify(tuning) : ''}`
      if (seen.has(key)) continue
      seen.set(key, {
        key,
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

/** 声の無い友達に話者IDだけを与えるときの土台。 */
function baseVoice(friend: Friend): Voice {
  return friend.voice ?? { gender: 'female', voiceModel: '' }
}

export function VoiceAdminDashboard({
  friends,
  onSaveVoice,
  onEditFriend,
}: VoiceAdminDashboardProps) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [playingFriendId, setPlayingFriendId] = useState<string | null>(null)
  const [isSequential, setIsSequential] = useState(false)
  const [message, setMessage] = useState('')
  const [isImportOpen, setIsImportOpen] = useState(false)
  /** 「設定をコードとして書き出し」パネルの開閉。本番で作った割り当てをコードへ持ち帰る入口。 */
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [combinations, setCombinations] = useState<DebugCombination[]>([])
  const [selectedCombination, setSelectedCombination] = useState<string>('')
  const queueRef = useRef<Friend[]>([])

  useEffect(() => {
    if (!isImportOpen) return
    void loadRecentTtsDebugRuns(20)
      .then((runs) => setCombinations(toCombinations(runs)))
      .catch(() => setMessage('検証履歴を読み込めませんでした。'))
  }, [isImportOpen])

  const stopAll = useCallback(() => {
    queueRef.current = []
    stopSpeaking()
    setPlayingFriendId(null)
    setIsSequential(false)
  }, [])

  // タブを離れたら鳴らしっぱなしにしない
  useEffect(() => () => stopAll(), [stopAll])

  const duplicated = useMemo(() => findDuplicateAssignments(friends), [friends])

  const visibleFriends = useMemo(() => {
    if (filter === 'female') return friends.filter((friend) => friend.voice?.gender !== 'male')
    if (filter === 'male') return friends.filter((friend) => friend.voice?.gender === 'male')
    if (filter === 'unassigned') return friends.filter((friend) => !friend.voice?.voiceModel)
    return friends
  }, [filter, friends])

  const exportText = useMemo(
    () => (isExportOpen ? formatVoiceExport(friends, new Date().toISOString()) : ''),
    [friends, isExportOpen]
  )

  const unassignedCount = friends.filter((friend) => !friend.voice?.voiceModel).length
  const femaleCount = friends.filter((friend) => friend.voice?.gender !== 'male').length
  const maleCount = friends.filter((friend) => friend.voice?.gender === 'male').length

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText)
      setMessage('声設定のコードをコピーしました。')
    } catch {
      setMessage('コピーできませんでした。下の欄を選択して手動でコピーしてください。')
    }
  }

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
      onError: (err) => {
        setPlayingFriendId(null)
        setMessage(`${shortName(friend)} の試聴に失敗しました。${err instanceof Error ? err.message : ''}`)
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
    const targets = visibleFriends.filter((friend) => friend.id && friend.voice?.voiceModel)
    if (targets.length === 0) return
    // API利用料が発生するため、対象人数を明示してから実行する。
    if (!confirm(`${targets.length}人分をまとめて試聴します。人数分のAPI利用料がかかります。続けますか？`)) return
    setMessage('')
    queueRef.current = [...targets]
    setIsSequential(true)
    playNextInQueue()
  }

  const handleChangeFriendVoiceId = (friend: Friend, voiceId: string) => {
    if (!friend.id) return
    const trimmed = voiceId.trim()
    if (trimmed && !isFishReferenceId(trimmed)) {
      setMessage(`${shortName(friend)}: 話者IDは32桁の16進数です。`)
      return
    }
    onSaveVoice(friend.id, { ...baseVoice(friend), voiceModel: trimmed })
  }

  const handleApplyCombination = (friend: Friend) => {
    if (!friend.id) return
    const combination = combinations.find((item) => item.key === selectedCombination)
    if (!combination) return
    const next: Voice = { ...baseVoice(friend), voiceModel: combination.voiceId }
    if (combination.tuning) next.voiceTuning = combination.tuning
    else delete next.voiceTuning
    onSaveVoice(friend.id, next)
    setMessage(`${shortName(friend)} に ${combination.voiceId} を割り当てました。`)
  }

  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `すべて (${friends.length})` },
    { key: 'female', label: `女性 (${femaleCount})` },
    { key: 'male', label: `男性 (${maleCount})` },
    { key: 'unassigned', label: `未割り当て (${unassignedCount})` },
  ]

  return (
    <div className="bg-white rounded-3xl w-full flex flex-col border border-rose-100 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-stone-900 m-0 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-rose-500" />
              <span>声の管理</span>
            </h2>
            <p className="text-xs text-stone-500 m-0 mt-0.5">
              全{friends.length}人の話者ID（{FIXED_TTS_MODEL}）をまとめて確認し、割り当てを変更できます。
            </p>
          </div>
        </div>

        {/* 一括操作 */}
        <div className="px-5 py-3 border-b border-stone-100 bg-stone-50/70 flex-shrink-0 space-y-2">
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
                  <span>表示中を通し試聴 ({visibleFriends.filter((friend) => friend.voice?.voiceModel).length}人)</span>
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
            <button
              type="button"
              onClick={() => setIsExportOpen((current) => !current)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer flex items-center gap-1.5 ${
                isExportOpen
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <EditIcon className="w-3.5 h-3.5 text-sky-600" />
              <span>設定をコードとして書き出し</span>
            </button>
          </div>

          {message && (
            <p role="status" className="m-0 text-[11px] text-stone-600 bg-white border border-stone-200 rounded-xl px-3 py-1.5">
              {message}
            </p>
          )}
        </div>

        {/* コードとして書き出しパネル */}
        {isExportOpen && (
          <div className="px-5 py-3 border-b border-stone-100 bg-sky-50/40 flex-shrink-0 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-stone-700" htmlFor="admin-export">
                全{friends.length}人の声設定（presetFriends.ts へ転記する形式）:
              </label>
              <button
                type="button"
                onClick={copyExport}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-700 cursor-pointer flex items-center gap-1.5"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>クリップボードにコピー</span>
              </button>
            </div>
            <textarea
              id="admin-export"
              readOnly
              value={exportText}
              onFocus={(e) => e.currentTarget.select()}
              spellCheck={false}
              className="w-full h-40 px-3 py-2 text-[11px] font-mono bg-white border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none resize-y"
            />
            <p className="m-0 text-[11px] text-stone-500">
              APIキーは含まれません。このブラウザに保存されている割り当てだけが出ます。
            </p>
          </div>
        )}

        {/* 検証履歴からの取り込みパネル */}
        {isImportOpen && (
          <div className="px-5 py-3 border-b border-stone-100 bg-amber-50/40 flex-shrink-0">
            {combinations.length === 0 ? (
              <p className="m-0 text-xs text-stone-600">
                Fish Audio で生成した検証結果がありません。TTSモデル検証モードで話者IDを指定して生成すると、ここに候補が並びます。
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
                      {combination.voiceId}
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
        <div className="px-5 py-4">
          {visibleFriends.length === 0 ? (
            <p className="py-10 text-center text-xs text-stone-400">該当するキャラクターがいません。</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {visibleFriends.map((friend) => {
                const isPlaying = playingFriendId === friend.id
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
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 space-y-1.5">
                      <input
                        type="text"
                        key={friend.voice?.voiceModel || ''}
                        defaultValue={friend.voice?.voiceModel || ''}
                        onBlur={(e) => {
                          if (e.target.value.trim() !== (friend.voice?.voiceModel || '')) {
                            handleChangeFriendVoiceId(friend, e.target.value)
                          }
                        }}
                        placeholder="話者ID (reference_id)"
                        spellCheck={false}
                        aria-label={`${shortName(friend)} の話者ID`}
                        className="w-full px-2 py-1.5 text-[11px] font-mono bg-white border border-stone-300 rounded-lg focus:border-rose-500 focus:outline-none"
                      />
                      <p className="m-0 text-[10px] text-stone-500 truncate" title={tuningSummary || undefined}>
                        速さ {friend.voice?.rate ?? 1}
                        {tuningSummary ? ` · ${tuningSummary}` : ''}
                      </p>
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
                        aria-label={`${shortName(friend)} の声を詳しく設定`}
                        className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 cursor-pointer"
                        title="声設定を開く"
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
        <div className="px-5 py-3 border-t border-stone-100 bg-stone-50/80 flex-shrink-0">
          <p className="m-0 text-[11px] text-stone-500">
            変更は即座に保存されます。試聴と通し試聴にはAPI利用料がかかります。
          </p>
        </div>
    </div>
  )
}
