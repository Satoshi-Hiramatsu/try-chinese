import { useState, useRef, useMemo } from 'react'
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
  LockIcon,
} from './Icons'
import { FriendAvatar } from './FriendAvatar'
import { PortraitFace } from './PortraitFace'
import { PORTRAITS, isPortraitLocked } from '../data/portraits'
import { PRESET_FRIENDS } from '../data/presetFriends'
import { borrowVoice, presetVoiceChoices } from '../data/fishVoice'

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
  /** 声を借りるプリセット友達のID。カスタム友達は自分で Fish の話者を用意できないため、既存の声を使う */
  const [selectedVoiceFriendId, setSelectedVoiceFriendId] = useState('')
  const [formError, setFormError] = useState('')

  // 同性のプリセット友達のうち、話者IDが決まっているもの
  const voiceChoices = useMemo(() => presetVoiceChoices(PRESET_FRIENDS, voiceGender), [voiceGender])

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
    setSelectedVoiceFriendId(presetVoiceChoices(PRESET_FRIENDS, 'female')[0]?.friendId || '')
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

    // いま借りている声のプリセット友達を選び直す。見つからなければ先頭
    const choices = presetVoiceChoices(PRESET_FRIENDS, gender)
    const matched = choices.find((choice) => choice.voice.voiceModel === friend.voice?.voiceModel)
    setSelectedVoiceFriendId(matched?.friendId || choices[0]?.friendId || '')

    setFormError('')
    setActiveTab('create')
  }

  const handleGenderChange = (newGender: 'female' | 'male') => {
    setVoiceGender(newGender)
    // 性別に合わせて借りる声も同性の先頭にする
    setSelectedVoiceFriendId(presetVoiceChoices(PRESET_FRIENDS, newGender)[0]?.friendId || '')
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

    // 借りる声。同性のプリセットに話者IDが1人も無ければ声なしで作る（読み上げ時にエラーで気付ける）
    const chosen = voiceChoices.find((choice) => choice.friendId === selectedVoiceFriendId) || voiceChoices[0]
    const editing = editingFriendId ? friends.find((f) => f.id === editingFriendId) : undefined
    // 編集で同じ声を選び直したときは、その友達がすでに持つ高さの調整を保つ
    const voice =
      chosen && editing?.voice && editing.voice.voiceModel === chosen.voice.voiceModel
        ? editing.voice
        : chosen
          ? borrowVoice(chosen.voice)
          : undefined

    const updatedOrNewFriend: Friend = {
      id: editingFriendId || `custom-${Date.now()}`,
      name: name.trim(),
      portraitId,
      personality: personality.trim(),
      hobbies: hobbies.length > 0 ? hobbies : ['日常会話'],
      tone: tone.trim() || undefined,
      voice,
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
                // 表情差分がまだ無いプリセットの友達は、生成が済むまで選べない。
                const isLocked = !isCustom && !isSelected && isPortraitLocked(friend.portraitId)

                return (
                  <div
                    key={friend.id || friend.name}
                    className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-rose-50/80 border-rose-300 shadow-xs'
                        : isLocked
                          ? 'bg-stone-50 border-stone-200/80'
                          : 'bg-white border-stone-200/80 hover:border-rose-200'
                    }`}
                  >
                    <div className={`flex items-start gap-3 min-w-0 ${isLocked ? 'opacity-55' : ''}`}>
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
                          {isLocked && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-stone-200 text-stone-600 rounded font-medium flex items-center gap-1">
                              <LockIcon className="w-3 h-3" />
                              <span>準備中</span>
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
                      {isLocked ? (
                        <p className="text-[11px] text-stone-500 m-0 text-right leading-relaxed max-w-[8.5rem]">
                          立ち絵の表情差分を準備中です
                        </p>
                      ) : (
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
                      )}

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
                      <PortraitFace spec={spec} title={spec.id} />
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-stone-500 mt-1.5">
                  ※ 選んだ立ち絵がノベル画面に表示されます。返答の感情は名前の横にラベルで表示されます。
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

              {/* 借りる声の選択 */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1" htmlFor="friend-voice-choice">
                  <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
                  <span>声（プリセットの友達から借りる）:</span>
                </label>
                {voiceChoices.length === 0 ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 m-0">
                    この性別で声が決まっている友達がまだいません。作成はできますが、読み上げは鳴りません。
                  </p>
                ) : (
                  <select
                    id="friend-voice-choice"
                    value={selectedVoiceFriendId}
                    onChange={(e) => setSelectedVoiceFriendId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none bg-white font-medium"
                  >
                    {voiceChoices.map((choice) => (
                      <option key={choice.friendId} value={choice.friendId}>
                        {choice.friendName} の声
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-stone-500 mt-1">
                  ※ 声の高さは会話画面の「声」ボタンからあとで変えられます。
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
