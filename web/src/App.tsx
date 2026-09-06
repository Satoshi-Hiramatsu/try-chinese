import { useState, useEffect, useMemo } from 'react'
import type { Friend, ChatMessage } from './types'
import { PRESET_FRIENDS } from './data/presetFriends'
import { Header } from './components/Header'
import { FriendCard } from './components/FriendCard'
import { ChatMessageList } from './components/ChatMessageList'
import { ChatInput } from './components/ChatInput'
import { SettingsModal } from './components/SettingsModal'
import { OnboardingModal } from './components/OnboardingModal'
import { FriendListModal } from './components/FriendListModal'
import { AlertIcon, CloseIcon } from './components/Icons'
import { sendMessageToChatApi } from './services/api'
import {
  loadApiKey,
  saveApiKey,
  loadHskLevel,
  saveHskLevel,
  loadSelectedModel,
  saveSelectedModel,
  loadCustomFriends,
  saveCustomFriend,
  deleteCustomFriend,
  loadSelectedFriendId,
  saveSelectedFriendId,
  loadFriendMessages,
  saveFriendMessages,
  clearFriendMessages,
  isOnboardingCompleted,
  setOnboardingCompleted,
  saveUserHobbies,
} from './services/storage'

const buildWelcomeMessage = (friend: Friend, level: number): ChatMessage => ({
  id: `welcome-${friend.id || 'default'}-${Date.now()}`,
  role: 'assistant',
  reply: {
    zh: `你好！我是${friend.name}。很高兴认识你！你想聊点什么？${friend.hobbies.slice(0, 3).join('、')}？`,
    ja: `こんにちは！${friend.name}です。はじめまして！何について話したいですか？${friend.hobbies.slice(0, 3).join('、')}？`,
    pinyin: 'Nǐ hǎo! Hěn gāoxìng rènshi nǐ! Nǐ xiǎng liáo diǎn shénme?',
    hskLevel: level,
  },
  correction: {
    hasCorrection: false,
  },
  vocabulary: [
    { term: '高兴', pinyin: 'gāoxìng', ja: 'うれしい', hskLevel: 1 },
    { term: '认识', pinyin: 'rènshi', ja: '知り合う', hskLevel: 2 },
  ],
  timestamp: Date.now(),
})

export default function App() {
  const [hskLevel, setHskLevel] = useState<number>(() => loadHskLevel(2))
  const [apiKey, setApiKey] = useState<string>(() => loadApiKey())
  const [model, setModel] = useState<string>(() => loadSelectedModel('google/gemini-2.5-flash'))
  const [customFriends, setCustomFriends] = useState<Friend[]>(() => loadCustomFriends())

  // 全友達リスト（プリセット＋カスタム）
  const allFriends = useMemo(() => {
    return [...PRESET_FRIENDS, ...customFriends]
  }, [customFriends])

  // 現在の友達
  const [currentFriend, setCurrentFriend] = useState<Friend>(() => {
    const savedId = loadSelectedFriendId('friend-meiling')
    return (
      allFriends.find((f) => f.id === savedId) ||
      PRESET_FRIENDS[0]
    )
  })

  // モーダル状態
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => !isOnboardingCompleted())
  const [isFriendListOpen, setIsFriendListOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // 友達別の会話履歴
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const friendId = currentFriend.id || 'friend-meiling'
    const saved = loadFriendMessages(friendId)
    return saved.length > 0 ? saved : [buildWelcomeMessage(currentFriend, loadHskLevel(2))]
  })

  // メッセージの保存（現在の友達のセッション）
  useEffect(() => {
    const friendId = currentFriend.id || 'friend-meiling'
    saveFriendMessages(friendId, messages)
  }, [messages, currentFriend.id])

  const handleHskChange = (level: number) => {
    setHskLevel(level)
    saveHskLevel(level)
  }

  const handleSaveSettings = (newKey: string, newModel: string) => {
    setApiKey(newKey)
    saveApiKey(newKey)
    setModel(newModel)
    saveSelectedModel(newModel)
    setErrorMessage(null)
  }

  // 友達切り替え
  const handleSelectFriend = (newFriend: Friend) => {
    if (newFriend.id === currentFriend.id) return

    const oldFriendId = currentFriend.id || 'friend-meiling'
    saveFriendMessages(oldFriendId, messages)

    const newFriendId = newFriend.id || 'friend-meiling'
    const saved = loadFriendMessages(newFriendId)
    const nextMessages = saved.length > 0 ? saved : [buildWelcomeMessage(newFriend, hskLevel)]

    setCurrentFriend(newFriend)
    setMessages(nextMessages)
    saveSelectedFriendId(newFriendId)
    setErrorMessage(null)
  }

  // 新規友達作成
  const handleCreateFriend = (newFriend: Friend) => {
    saveCustomFriend(newFriend)
    setCustomFriends((prev) => [...prev, newFriend])
    handleSelectFriend(newFriend)
  }

  // 友達削除
  const handleDeleteFriend = (id: string) => {
    deleteCustomFriend(id)
    setCustomFriends((prev) => prev.filter((f) => f.id !== id))
    if (currentFriend.id === id) {
      handleSelectFriend(PRESET_FRIENDS[0])
    }
  }

  const handleClearHistory = () => {
    if (confirm(`「${currentFriend.name}」との会話履歴をリセットしますか？`)) {
      const friendId = currentFriend.id || 'friend-meiling'
      clearFriendMessages(friendId)
      setMessages([buildWelcomeMessage(currentFriend, hskLevel)])
    }
  }

  const handleSendMessage = async (text: string) => {
    setErrorMessage(null)

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)

    try {
      const response = await sendMessageToChatApi({
        message: text,
        friend: currentFriend,
        hskLevel,
        history: nextMessages,
        apiKey: apiKey || undefined,
        model: model || undefined,
      })

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        reply: response.reply,
        correction: response.correction,
        vocabulary: response.vocabulary,
        timestamp: Date.now(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      const msg = err instanceof Error ? err.message : '予期せぬエラーが発生しました'
      setErrorMessage(msg)

      if (msg.includes('APIキー') || msg.includes('401')) {
        setIsSettingsModalOpen(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-rose-50/40 to-orange-50/50 text-stone-800 flex flex-col items-center justify-between p-3 sm:p-6 font-sans select-text">
      {/* Header */}
      <Header
        hskLevel={hskLevel}
        onHskChange={handleHskChange}
        hasApiKey={Boolean(apiKey)}
        onOpenApiKeyModal={() => setIsSettingsModalOpen(true)}
        onClearHistory={handleClearHistory}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenFriendList={() => setIsFriendListOpen(true)}
      />

      {/* Main Chat Container */}
      <main className="w-full max-w-3xl flex-1 flex flex-col py-3 sm:py-4 gap-3 min-h-0 h-[calc(100vh-140px)]">
        {/* Friend Profile Card */}
        <FriendCard
          friend={currentFriend}
          onOpenFriendList={() => setIsFriendListOpen(true)}
        />

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="bg-rose-100 border border-rose-300 text-rose-800 px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-xs">
            <span className="flex items-center gap-1.5">
              <AlertIcon className="w-4 h-4 text-rose-700 flex-shrink-0" />
              <span>{errorMessage}</span>
            </span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-800 p-1 rounded-md cursor-pointer ml-2"
              aria-label="エラーを閉じる"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Chat Message List */}
        <div className="flex-1 min-h-0 bg-stone-50/60 backdrop-blur-xs rounded-2xl border border-rose-100/80 flex flex-col shadow-inner">
          <ChatMessageList
            messages={messages}
            friend={currentFriend}
            isLoading={isLoading}
          />
        </div>

        {/* Chat Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      </main>

      {/* Settings Modal (BYO-AI & Model Selection) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currentApiKey={apiKey}
        currentModel={model}
        onSave={handleSaveSettings}
      />

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        currentHskLevel={hskLevel}
        initialFriend={currentFriend}
        onComplete={(hobbies, level, friend) => {
          saveUserHobbies(hobbies)
          handleHskChange(level)
          setCurrentFriend(friend)
          setOnboardingCompleted(true)
          if (messages.length <= 1) {
            setMessages([buildWelcomeMessage(friend, level)])
          }
        }}
      />

      {/* Friend List / Create Modal */}
      <FriendListModal
        isOpen={isFriendListOpen}
        onClose={() => setIsFriendListOpen(false)}
        friends={allFriends}
        currentFriendId={currentFriend.id}
        onSelectFriend={handleSelectFriend}
        onCreateFriend={handleCreateFriend}
        onDeleteFriend={handleDeleteFriend}
      />
    </div>
  )
}
