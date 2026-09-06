import { useState } from 'react'
import type { Friend } from '../types'
import { CheckIcon, PlusIcon } from './Icons'
import { FriendAvatar } from './FriendAvatar'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  currentHskLevel: number
  onComplete: (selectedHobbies: string[], selectedHskLevel: number, friend: Friend) => void
  initialFriend: Friend
}

const PRESET_HOBBIES = [
  '三国志・歴史',
  '映画・ドラマ',
  '中華料理・グルメ',
  '台湾旅行・屋台',
  'アニメ・マンガ',
  'J-POP・C-POP',
  'テクノロジー・AI',
  'カフェ巡り',
  'アウトドア・キャンプ',
  '猫・ペット',
  '写真・カメラ',
  '語学学習',
]

const HSK_LEVEL_DESCRIPTIONS = [
  { level: 1, name: 'HSK 1級', badge: '入門', desc: '簡単な挨拶や超基本単語（約150語）。極めて平易な短文で話します。' },
  { level: 2, name: 'HSK 2級', badge: '初級準備', desc: '日用品や簡単な買い物、日常の基本会話（約300語）。' },
  { level: 3, name: 'HSK 3級', badge: '初級', desc: '学校・仕事・旅行など身近な話題で意思疎通（約600語）。複文も登場。' },
  { level: 4, name: 'HSK 4級', badge: '中級', desc: '幅広いテーマで流暢に対話。感情や意見を表現（約1200語）。' },
  { level: 5, name: 'HSK 5級', badge: '上級', desc: '映画やニュース、抽象的な話題も中国語で議論（約2500語）。' },
  { level: 6, name: 'HSK 6級', badge: '最上級', desc: 'ネイティブ並みの表現力や成語・文化的なニュアンス（5000語以上）。' },
]

export function OnboardingModal({
  isOpen,
  onClose,
  currentHskLevel,
  onComplete,
  initialFriend,
}: OnboardingModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedHobbies, setSelectedHobbies] = useState<string[]>(['三国志・歴史', '中華料理・グルメ'])
  const [customHobbyInput, setCustomHobbyInput] = useState('')
  const [hskLevel, setHskLevel] = useState<number>(currentHskLevel || 2)

  if (!isOpen) return null

  const toggleHobby = (hobby: string) => {
    setSelectedHobbies((prev) =>
      prev.includes(hobby) ? prev.filter((h) => h !== hobby) : [...prev, hobby]
    )
  }

  const handleAddCustomHobby = () => {
    const trimmed = customHobbyInput.trim()
    if (trimmed && !selectedHobbies.includes(trimmed)) {
      setSelectedHobbies((prev) => [...prev, trimmed])
      setCustomHobbyInput('')
    }
  }

  const handleFinish = () => {
    // 選択された趣味を反映したフレンド情報を生成
    const updatedFriend: Friend = {
      ...initialFriend,
      hobbies: selectedHobbies.length > 0 ? selectedHobbies : initialFriend.hobbies,
    }
    onComplete(selectedHobbies, hskLevel, updatedFriend)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-rose-100 animate-in fade-in zoom-in duration-200">
        {/* Progress Bar & Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-400 mb-2">
            <span>STEP {step} / 3</span>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`w-6 h-1.5 rounded-full transition-all ${
                    s === step
                      ? 'bg-rose-500 w-8'
                      : s < step
                      ? 'bg-rose-200'
                      : 'bg-stone-200'
                  }`}
                />
              ))}
            </div>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900 m-0">
            {step === 1 && '好きなこと・趣味を教えてください'}
            {step === 2 && 'あなたの中国語レベル（HSK）は？'}
            {step === 3 && '友達と会話を始めましょう！'}
          </h2>
          <p className="text-xs sm:text-sm text-stone-500 mt-1 mb-0">
            {step === 1 && 'AIフレンドがあなたの趣味に合わせた話題で楽しくおしゃべりします。'}
            {step === 2 && 'レベルに合わせた語彙・文法で返答し、優しく添削します。'}
            {step === 3 && '準備完了！中国語・日本語・片言、どんな発話でも大丈夫です。'}
          </p>
        </div>

        {/* Step 1: 趣味の選択 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto p-1">
              {PRESET_HOBBIES.map((hobby) => {
                const isSelected = selectedHobbies.includes(hobby)
                return (
                  <button
                    key={hobby}
                    type="button"
                    onClick={() => toggleHobby(hobby)}
                    className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all flex items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-rose-500 text-white shadow-xs scale-102'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200/80 border border-stone-200/60'
                    }`}
                  >
                    {isSelected ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                    <span>{hobby}</span>
                  </button>
                )
              })}
            </div>

            {/* 自由入力 */}
            <div className="flex gap-2 pt-2 border-t border-stone-100">
              <input
                type="text"
                value={customHobbyInput}
                onChange={(e) => setCustomHobbyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddCustomHobby()
                  }
                }}
                placeholder="他の趣味を自由に入力（例: サッカー、麻婆豆腐）"
                className="flex-1 px-3 py-2 text-xs sm:text-sm border border-stone-300 rounded-xl focus:border-rose-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomHobby}
                className="px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                追加
              </button>
            </div>

            {selectedHobbies.length > 0 && (
              <p className="text-xs text-rose-600 font-medium">
                選択中: {selectedHobbies.join('、')}
              </p>
            )}
          </div>
        )}

        {/* Step 2: HSK レベル選択 */}
        {step === 2 && (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {HSK_LEVEL_DESCRIPTIONS.map((item) => {
              const isSelected = hskLevel === item.level
              return (
                <div
                  key={item.level}
                  onClick={() => setHskLevel(item.level)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-rose-50/80 border-rose-400 shadow-xs'
                      : 'bg-white border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900 text-sm">
                        {item.name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold">
                        {item.badge}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="text-rose-600 text-xs font-bold flex items-center gap-1">
                        <CheckIcon className="w-3.5 h-3.5" />
                        <span>選択中</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-1 m-0 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Step 3: 友達（Friend）の確認 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-rose-50 via-amber-50 to-orange-50 rounded-2xl p-5 border border-rose-200/60 shadow-inner text-center">
              <FriendAvatar friend={initialFriend} size="xl" shape="rounded" className="mx-auto mb-3" />
              <h3 lang="zh-CN" className="font-chinese text-lg font-bold text-stone-900 m-0">
                {initialFriend.name}
              </h3>
              <p className="text-xs text-stone-600 mt-1 mb-3">
                {initialFriend.personality}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {(selectedHobbies.length > 0 ? selectedHobbies : initialFriend.hobbies).map(
                  (hobby) => (
                    <span
                      key={hobby}
                      className="text-[11px] px-2.5 py-0.5 bg-white/90 text-rose-700 rounded-full font-medium border border-rose-200 shadow-2xs"
                    >
                      #{hobby}
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-3.5 border border-stone-200/80 text-xs text-stone-600 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-stone-400">会話レベル:</span>
                <span className="font-bold text-rose-600">HSK {hskLevel} 級</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">ピンイン表示:</span>
                <span className="font-semibold text-stone-700">常時表示（声調付き）</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">発話添削:</span>
                <span className="font-semibold text-stone-700">毎回優しくアドバイス</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="mt-6 flex justify-between items-center pt-4 border-t border-stone-100">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
            >
              戻る
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-stone-400 hover:text-stone-600 rounded-xl cursor-pointer"
            >
              スキップ
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              className="px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              次へ
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="px-6 py-2.5 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-rose-500/20 transition-all scale-102 cursor-pointer"
            >
              会話をスタートする！
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
