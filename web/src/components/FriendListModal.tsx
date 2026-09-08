import { useState, useRef, useMemo, useEffect } from 'react'
import type { Friend } from '../types'
import {
  UsersIcon,
  CloseIcon,
  PlusIcon,
  AlertIcon,
  TrashIcon,
  SettingsIcon,
  SparklesIcon,
  MaleIcon,
  FemaleIcon,
} from './Icons'
import { FriendAvatar } from './FriendAvatar'
import { CharacterPortrait } from './CharacterPortrait'
import { PORTRAITS } from '../data/portraits'
import {
  CHARACTER_VOICE_OPTIONS,
  type CharacterVoiceOption,
} from '../data/characterVoices'
import { loadCustomVoices } from '../services/storage'

interface FriendListModalProps {
  isOpen: boolean
  onClose: () => void
  friends: Friend[]
  currentFriendId?: string
  onSelectFriend: (friend: Friend) => void
  onCreateFriend: (newFriend: Friend) => void
  onUpdateFriend?: (updatedFriend: Friend) => void
  onDeleteFriend?: (id: string) => void
}

/** 立ち絵の選択肢（性別ごとに絞り込んで表示する） */
const PORTRAIT_LIST = Object.values(PORTRAITS)

export function FriendListModal({
  isOpen,
  onClose,
  friends,
  currentFriendId,
  onSelectFriend,
  onCreateFriend,
  onUpdateFriend,
  onDeleteFriend,
}: FriendListModalProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list')
  const [editingFriendId, setEditingFriendId] = useState<string | null>(null)

  // フォーム状態
  const [name, setName] = useState('')
  const [portraitId, setPortraitId] = useState('pt-meiling')
  const [personality, setPersonality] = useState('')
  const [hobbiesInput, setHobbiesInput] = useState('')
  const [tone, setTone] = useState('')
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female')
  const [selectedVoiceId, setSelectedVoiceId] = useState('char-xiaoxiao')
  const [formError, setFormError] = useState('')

  // カスタム声質を含めた全声質リスト
  const [allVoiceOptions, setAllVoiceOptions] = useState<CharacterVoiceOption[]>([])

  useEffect(() => {
    if (isOpen) {
      const customs = loadCustomVoices()
      setAllVoiceOptions([...CHARACTER_VOICE_OPTIONS, ...customs])
    }
  }, [isOpen])

  // 性別にマッチする声質オプション
  const matchedVoiceOptions = useMemo(() => {
    return allVoiceOptions.filter((v) => v.gender === voiceGender)
  }, [allVoiceOptions, voiceGender])

  // Keep hooks unconditional across modal open/close renders.
  const scrollRef = useRef<HTMLDivElement>(null)

  if (!isOpen) return null

  const handleStartCreate = () => {
    setEditingFriendId(null)
    setName('')
    setPortraitId('pt-meiling')
    setPersonality('')
    setHobbiesInput('')
    setTone('')
    setVoiceGender('female')
    setSelectedVoiceId('char-xiaoxiao')
    setFormError('')
    setActiveTab('create')
  }

  const handleStartEdit = (friend: Friend) => {
    setEditingFriendId(friend.id || null)
    setName(friend.name)
    setPortraitId(friend.portraitId || 'pt-meiling')
    setPersonality(friend.personality)
    setHobbiesInput(friend.hobbies.join(', '))
    setTone(friend.tone || '')
    const gender = friend.voice?.gender || 'female'
    setVoiceGender(gender)

    // 音声マッチング
    const matchedVoice = allVoiceOptions.find(
      (v) =>
        v.kokoroVoice === friend.voice?.voiceModel ||
        v.edgeVoiceName === friend.voice?.voiceName
    )
    setSelectedVoiceId(
      matchedVoice ? matchedVoice.id : gender === 'male' ? 'char-yunxi' : 'char-xiaoxiao'
    )

    setFormError('')
    setActiveTab('create')
  }

  const handleGenderChange = (newGender: 'female' | 'male') => {
    setVoiceGender(newGender)
    // 性別に合わせてデフォルト声質を選択
    if (newGender === 'male') {
      setSelectedVoiceId('char-yunxi')
    } else {
      setSelectedVoiceId('char-xiaoxiao')
    }
    // 立ち絵の性別が食い違う場合は同性の立ち絵に切り替える
    setPortraitId((current) => {
      const spec = PORTRAITS[current]
      if (spec && spec.gender === newGender) return current
      const fallback = PORTRAIT_LIST.find((p) => p.gender === newGender)
      return fallback ? fallback.id : current
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('名前を入力してください')
      return
    }
    if (!personality.trim()) {
      setFormError('性格・特徴を入力してください')
      return
    }

    const hobbies = hobbiesInput
      .split(/[,、\s]+/)
      .map((h) => h.trim())
      .filter(Boolean)

    // 選択された声質オプションを取得
    const voiceOpt =
      allVoiceOptions.find((v) => v.id === selectedVoiceId) ||
      allVoiceOptions.find((v) => v.gender === voiceGender) ||
      CHARACTER_VOICE_OPTIONS[0]

    const updatedOrNewFriend: Friend = {
      id: editingFriendId || `custom-${Date.now()}`,
      name: name.trim(),
      portraitId,
      personality: personality.trim(),
      hobbies: hobbies.length > 0 ? hobbies : ['日常会話'],
      tone: tone.trim() || undefined,
      voice: {
        quality: 'natural',
        gender: voiceGender,
        rate: voiceOpt.defaultRate,
        pitch: voiceOpt.defaultPitch,
        voiceName: voiceOpt.edgeVoiceName,
        voiceModel: voiceOpt.kokoroVoice,
        ttsModel: 'hexgrad/kokoro-82m',
      },
    }

    if (editingFriendId && onUpdateFriend) {
      onUpdateFriend(updatedOrNewFriend)
    } else {
      onCreateFriend(updatedOrNewFriend)
    }

    setActiveTab('list')
    setEditingFriendId(null)
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
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-xl w-full max-h-[88vh] flex flex-col shadow-2xl border border-rose-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleCardWheel}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-stone-100 flex items-center justify-between flex-shrink-0 bg-white">
          <div>
            <h3 className="text-xl font-bold text-stone-900 m-0 flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-rose-500" />
              <span>外国人の友達（Friend）</span>
            </h3>
            <p className="text-xs text-stone-500 m-0 mt-0.5">
              共通の趣味を持つ会話相手を切り替え・新規作成・編集できます
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

        {/* Tabs */}
        <div className="px-5 sm:px-6 pt-3 pb-1 flex-shrink-0 bg-white">
          <div className="flex gap-2 p-1 bg-stone-100/80 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setActiveTab('list')
                setEditingFriendId(null)
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              友達一覧 ({friends.length})
            </button>
            <button
              type="button"
              onClick={handleStartCreate}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>{editingFriendId ? '友達を編集' : '新しい友達を作る'}</span>
            </button>
          </div>
        </div>

        {/* Content Container */}
        <div
          ref={scrollRef}
          className="px-5 sm:px-6 py-3 flex-1 overflow-y-auto overscroll-contain"
        >
          {/* Tab 1: 友達一覧 */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {friends.map((friend) => {
                const isSelected = friend.id === currentFriendId
                const isCustom = friend.id?.startsWith('custom-')

                return (
                  <div
                    key={friend.id || friend.name}
                    className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-rose-50/80 border-rose-300 shadow-xs'
                        : 'bg-white border-stone-200/80 hover:border-rose-200'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <FriendAvatar friend={friend} size="md" shape="rounded" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4
                            lang="zh-CN"
                            className="font-chinese text-sm font-bold text-stone-900 m-0 truncate"
                          >
                            {friend.name}
                          </h4>
                          <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded font-medium flex items-center gap-1">
                            {friend.voice?.gender === 'male' ? (
                              <>
                                <MaleIcon className="w-3 h-3 text-blue-600" />
                                <span>男性声</span>
                              </>
                            ) : (
                              <>
                                <FemaleIcon className="w-3 h-3 text-rose-500" />
                                <span>女性声</span>
                              </>
                            )}
                          </span>
                          {isCustom && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-medium">
                              カスタム
                            </span>
                          )}
                          {isSelected && (
                            <span className="text-[10px] px-2 py-0.5 bg-rose-500 text-white rounded-full font-bold">
                              会話中
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-600 mt-1 mb-2 leading-relaxed">
                          {friend.personality}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {friend.hobbies.map((h) => (
                            <span
                              key={h}
                              className="text-[10px] px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md font-medium"
                            >
                              #{h}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(friend)}
                          className="px-2.5 py-1 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer border border-stone-200"
                          title="友達のプロフィール・声質を設定"
                        >
                          <SettingsIcon className="w-3 h-3" />
                          <span>設定</span>
                        </button>

                        {!isSelected ? (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectFriend(friend)
                              onClose()
                            }}
                            className="px-3 py-1 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
                          >
                            話す
                          </button>
                        ) : (
                          <span className="text-xs text-rose-600 font-bold px-2 py-1">
                            選択中
                          </span>
                        )}
                      </div>

                      {isCustom && onDeleteFriend && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`「${friend.name}」を削除しますか？`)) {
                              onDeleteFriend(friend.id!)
                            }
                          }}
                          className="text-[11px] text-stone-400 hover:text-rose-500 transition-colors p-1 flex items-center gap-1 cursor-pointer"
                          title="友達を削除"
                        >
                          <TrashIcon className="w-3 h-3" />
                          <span>削除</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tab 2: 友達を作る / 編集する */}
          {activeTab === 'create' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <AlertIcon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 立ち絵の選択 */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  立ち絵（キャラクター画像）:
                </label>
                <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                  {PORTRAIT_LIST.filter((p) => p.gender === voiceGender).map((spec) => (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => setPortraitId(spec.id)}
                      className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-pointer bg-rose-50/60 ${
                        portraitId === spec.id
                          ? 'border-rose-500 ring-2 ring-rose-400/40 scale-105 shadow-sm'
                          : 'border-stone-200 hover:border-stone-400 opacity-80 hover:opacity-100'
                      }`}
                      title={spec.id}
                      aria-pressed={portraitId === spec.id}
                    >
                      <CharacterPortrait
                        spec={spec}
                        expression="smile"
                        crop="face"
                        animate={false}
                        className="w-full h-full"
                      />
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5">
                  ※ 立ち絵は会話内容に合わせて喜怒哀楽など10パターンの表情に自動で切り替わります。
                </p>
              </div>

              {/* 名前 */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  名前（中国語名・よみ）:
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: 林小雨 (Lin Xiaoyu)"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none font-chinese"
                />
              </div>

              {/* 性格・プロフィール */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  性格・特徴:
                </label>
                <textarea
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder="例: 西安在住の歴史が大好きな大学院生。優しく丁寧で、中国の昔話やお茶について教えるのが好き。"
                  rows={2}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none resize-none"
                />
              </div>

              {/* 趣味 */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  共通の趣味・関心（カンマやスペース区切り）:
                </label>
                <input
                  type="text"
                  value={hobbiesInput}
                  onChange={(e) => setHobbiesInput(e.target.value)}
                  placeholder="例: 兵馬俑, 中国茶, 羊肉泡饃, 読書"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none"
                />
              </div>

              {/* 口調・トーン */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  口調・トーン（任意）:
                </label>
                <input
                  type="text"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="例: 丁寧で穏やかな敬語口調、または同年代の親しいタメ口"
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none"
                />
              </div>

              {/* 声の性別 */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  会話相手の声（性別）:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenderChange('female')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      voiceGender === 'female'
                        ? 'border-rose-400 bg-rose-500 text-white shadow-xs'
                        : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <FemaleIcon className="w-3.5 h-3.5" />
                    <span>女性声 (Female)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenderChange('male')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      voiceGender === 'male'
                        ? 'border-rose-400 bg-rose-500 text-white shadow-xs'
                        : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <MaleIcon className="w-3.5 h-3.5" />
                    <span>男性声 (Male)</span>
                  </button>
                </div>
              </div>

              {/* 声質キャラクターの選択 */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                  <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
                  <span>声質キャラクター（話者）:</span>
                </label>
                <select
                  value={selectedVoiceId}
                  onChange={(e) => setSelectedVoiceId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none bg-white font-medium"
                >
                  {matchedVoiceOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} {opt.isCustom ? '[カスタム]' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-stone-500 mt-1">
                  ※ 会話画面の「声質」ボタンから、さらに詳細なピッチ・速度の微調整や独自ボイスの作成も可能です。
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('list')
                    setEditingFriendId(null)
                  }}
                  className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-100 cursor-pointer"
                >
                  戻る
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingFriendId ? '設定を保存する' : '作成して会話する！'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
