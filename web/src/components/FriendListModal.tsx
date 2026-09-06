import { useState } from 'react'
import type { Friend } from '../types'

interface FriendListModalProps {
  isOpen: boolean
  onClose: () => void
  friends: Friend[]
  currentFriendId?: string
  onSelectFriend: (friend: Friend) => void
  onCreateFriend: (newFriend: Friend) => void
  onDeleteFriend?: (id: string) => void
}

const PRESET_AVATARS = ['👩🏻‍🦰', '🧑🏻‍💻', '👩🏻‍🎨', '🏃🏻‍♂️', '🧑🏻‍🏫', '👩🏻‍⚕️', '🧑🏻‍🍳', '👩🏻‍🎓', '🧑🏻‍🎤', '🧋', '🐼', '🐱']

export function FriendListModal({
  isOpen,
  onClose,
  friends,
  currentFriendId,
  onSelectFriend,
  onCreateFriend,
  onDeleteFriend,
}: FriendListModalProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list')

  // 新規友達作成フォーム状態
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState('👩🏻‍🦰')
  const [personality, setPersonality] = useState('')
  const [hobbiesInput, setHobbiesInput] = useState('')
  const [tone, setTone] = useState('')
  const [formError, setFormError] = useState('')

  if (!isOpen) return null

  const handleCreate = (e: React.FormEvent) => {
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

    const newFriend: Friend = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      avatar: avatar || '🧑🏻',
      personality: personality.trim(),
      hobbies: hobbies.length > 0 ? hobbies : ['日常会話'],
      tone: tone.trim() || undefined,
    }

    onCreateFriend(newFriend)
    setActiveTab('list')
    // フォームリセット
    setName('')
    setPersonality('')
    setHobbiesInput('')
    setTone('')
    setFormError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-rose-100 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-xl font-bold text-stone-900 m-0 flex items-center gap-2">
              <span>👥</span>
              <span>外国人の友達（Friend）</span>
            </h3>
            <p className="text-xs text-stone-500 m-0 mt-0.5">
              共通の趣味を持つ会話相手を切り替え・新規作成できます
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-2xl font-bold p-1 leading-none"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 my-4 p-1 bg-stone-100/80 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'list'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            友達一覧 ({friends.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'create'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            ＋ 新しい友達を作る
          </button>
        </div>

        {/* Tab 1: 友達一覧 */}
        {activeTab === 'list' && (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
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
                    <div className="text-3xl p-2 bg-gradient-to-br from-rose-100/60 to-amber-100/60 rounded-xl select-none flex-shrink-0">
                      {friend.avatar}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-stone-900 m-0 truncate">
                          {friend.name}
                        </h4>
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
                    {!isSelected ? (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectFriend(friend)
                          onClose()
                        }}
                        className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors"
                      >
                        話す
                      </button>
                    ) : (
                      <span className="text-xs text-rose-600 font-bold px-2 py-1">
                        選択中
                      </span>
                    )}

                    {isCustom && onDeleteFriend && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`「${friend.name}」を削除しますか？`)) {
                            onDeleteFriend(friend.id!)
                          }
                        }}
                        className="text-[11px] text-stone-400 hover:text-rose-500 transition-colors"
                        title="友達を削除"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Tab 2: 新しい友達を作る */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
                ⚠️ {formError}
              </div>
            )}

            {/* アバター選択 */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                アバターアイコン:
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-2xl p-2 bg-stone-100 rounded-xl select-none mr-2">
                  {avatar}
                </span>
                {PRESET_AVATARS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setAvatar(emoji)}
                    className={`text-xl p-1.5 rounded-lg border transition-all ${
                      avatar === emoji
                        ? 'border-rose-500 bg-rose-50 scale-110'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
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
                className="w-full px-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none"
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

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-100"
              >
                戻る
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                作成して会話する！
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
