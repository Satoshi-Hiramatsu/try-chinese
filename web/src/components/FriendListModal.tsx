import { useState } from 'react'
import type { Friend } from '../types'
import {
  UsersIcon,
  CloseIcon,
  PlusIcon,
  AlertIcon,
  TrashIcon,
} from './Icons'
import { FriendAvatar } from './FriendAvatar'

interface FriendListModalProps {
  isOpen: boolean
  onClose: () => void
  friends: Friend[]
  currentFriendId?: string
  onSelectFriend: (friend: Friend) => void
  onCreateFriend: (newFriend: Friend) => void
  onDeleteFriend?: (id: string) => void
}

const PRESET_AVATARS = [
  { path: '/avatars/meiling.jpg', label: '美玲' },
  { path: '/avatars/wanghao.jpg', label: '王浩' },
  { path: '/avatars/lixue.jpg', label: '李雪' },
  { path: '/avatars/zhangwei.jpg', label: '張偉' },
]

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
  const [avatar, setAvatar] = useState('/avatars/meiling.jpg')
  const [personality, setPersonality] = useState('')
  const [hobbiesInput, setHobbiesInput] = useState('')
  const [tone, setTone] = useState('')
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female')
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
      avatar: avatar || '/avatars/meiling.jpg',
      personality: personality.trim(),
      hobbies: hobbies.length > 0 ? hobbies : ['日常会話'],
      tone: tone.trim() || undefined,
      voice: {
        quality: 'natural',
        gender: voiceGender,
        rate: 0.95,
        pitch: voiceGender === 'female' ? 1.05 : 0.95,
      },
    }

    onCreateFriend(newFriend)
    setActiveTab('list')
    // フォームリセット
    setName('')
    setPersonality('')
    setHobbiesInput('')
    setTone('')
    setVoiceGender('female')
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
              <UsersIcon className="w-5 h-5 text-rose-500" />
              <span>外国人の友達（Friend）</span>
            </h3>
            <p className="text-xs text-stone-500 m-0 mt-0.5">
              共通の趣味を持つ会話相手を切り替え・新規作成できます
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
        <div className="flex gap-2 my-4 p-1 bg-stone-100/80 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
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
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'create'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>新しい友達を作る</span>
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
                    <FriendAvatar friend={friend} size="md" shape="rounded" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 lang="zh-CN" className="font-chinese text-sm font-bold text-stone-900 m-0 truncate">
                          {friend.name}
                        </h4>
                        <span className="text-[10px] px-1.5 py-0.2 bg-stone-100 text-stone-600 rounded font-medium">
                          {friend.voice?.gender === 'male' ? '👨 男性声' : '👩 女性声'}
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
                    {!isSelected ? (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectFriend(friend)
                          onClose()
                        }}
                        className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
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

        {/* Tab 2: 新しい友達を作る */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                <AlertIcon className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* アバター選択 */}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1.5">
                アバター画像（アニメ調）:
              </label>
              <div className="flex flex-wrap gap-2.5 items-center">
                {PRESET_AVATARS.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => setAvatar(item.path)}
                    className={`w-14 h-14 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer p-0.5 ${
                      avatar === item.path
                        ? 'border-rose-500 ring-2 ring-rose-400/40 scale-105 shadow-sm'
                        : 'border-stone-200 hover:border-stone-400 opacity-75 hover:opacity-100'
                    }`}
                    title={item.label}
                  >
                    <img
                      src={item.path}
                      alt={item.label}
                      className="w-full h-full object-cover rounded-xl scale-[2.1] origin-[50%_36%]"
                    />
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
                  onClick={() => setVoiceGender('female')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    voiceGender === 'female'
                      ? 'border-rose-400 bg-rose-500 text-white shadow-xs'
                      : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  👩 女性声 (Female)
                </button>
                <button
                  type="button"
                  onClick={() => setVoiceGender('male')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    voiceGender === 'male'
                      ? 'border-rose-400 bg-rose-500 text-white shadow-xs'
                      : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  👨 男性声 (Male)
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-100 cursor-pointer"
              >
                戻る
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
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
