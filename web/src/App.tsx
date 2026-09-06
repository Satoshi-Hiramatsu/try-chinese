import { useState, useEffect } from 'react'
import type { Friend, ChatMessage } from './types'
import { Header } from './components/Header'
import { FriendCard } from './components/FriendCard'
import { ChatMessageList } from './components/ChatMessageList'
import { ChatInput } from './components/ChatInput'
import { ApiKeyModal } from './components/ApiKeyModal'
import { OnboardingModal } from './components/OnboardingModal'
import { sendMessageToChatApi } from './services/api'
import {
  loadApiKey,
  saveApiKey,
  loadHskLevel,
  saveHskLevel,
  loadChatMessages,
  saveChatMessages,
  clearChatMessages,
  isOnboardingCompleted,
  setOnboardingCompleted,
  saveUserHobbies,
} from './services/storage'

const DEFAULT_FRIEND: Friend = {
  name: '陈美玲 (Chen Meiling)',
  avatar: '👩🏻‍🦰',
  personality: '親しみやすく好奇心旺盛、上海在住の大学生',
  hobbies: ['三国志', '映画鑑賞', '台湾料理'],
}

const buildWelcomeMessage = (friend: Friend, level: number): ChatMessage => ({
  id: `welcome-${Date.now()}`,
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
  const [currentFriend, setCurrentFriend] = useState<Friend>(DEFAULT_FRIEND)
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => !isOnboardingCompleted())
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadChatMessages()
    return saved.length > 0 ? saved : [buildWelcomeMessage(DEFAULT_FRIEND, loadHskLevel(2))]
  })

  // ストレージ同期
  useEffect(() => {
    saveChatMessages(messages)
  }, [messages])

  const handleHskChange = (level: number) => {
    setHskLevel(level)
    saveHskLevel(level)
  }

  const handleSaveApiKey = (key: string) => {
    setApiKey(key)
    saveApiKey(key)
    setErrorMessage(null)
  }

  const handleClearHistory = () => {
    if (confirm('会話履歴をリセットしますか？')) {
      clearChatMessages()
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

      // APIキー未設定の可能性がある場合
      if (msg.includes('APIキー') || msg.includes('401')) {
        setIsApiKeyModalOpen(true)
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
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        onClearHistory={handleClearHistory}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
      />

      {/* Main Chat Container */}
      <main className="w-full max-w-3xl flex-1 flex flex-col py-3 sm:py-4 gap-3 min-h-0 h-[calc(100vh-140px)]">
        {/* Friend Profile Card */}
        <FriendCard friend={currentFriend} />

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="bg-rose-100 border border-rose-300 text-rose-800 px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-xs">
            <span>⚠️ {errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-600 hover:text-rose-800 font-bold ml-2"
            >
              ✕
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

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        currentApiKey={apiKey}
        onSaveApiKey={handleSaveApiKey}
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
    </div>
  )
}
