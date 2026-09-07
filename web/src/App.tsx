import { useState, useEffect, useMemo } from 'react'
import type { Friend, ChatMessage, Voice, VocabularyItem } from './types'
import { PRESET_FRIENDS } from './data/presetFriends'
import { Header } from './components/Header'
import { FriendCard } from './components/FriendCard'
import { ChatMessageList } from './components/ChatMessageList'
import { ChatInput } from './components/ChatInput'
import { SettingsModal } from './components/SettingsModal'
import { OnboardingModal } from './components/OnboardingModal'
import { FriendListModal } from './components/FriendListModal'
import { VoiceSettingsModal } from './components/VoiceSettingsModal'
import { VocabularyModal } from './components/VocabularyModal'
import { ReviewModal } from './components/ReviewModal'
import { AlertIcon, CloseIcon } from './components/Icons'
import { sendMessageToChatApi } from './services/api'
import { speakChinese, stopSpeaking } from './services/speech'
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
  loadAutoPlayTts,
  saveAutoPlayTts,
  loadSpeechInputLang,
  saveSpeechInputLang,
  loadFriendVoice,
  saveFriendVoice,
  loadVocabularyList,
  addVocabularyItem,
  deleteVocabularyItem,
  toggleVocabularyMastered,
  loadToneColoring,
  saveToneColoring,
  loadTtsModel,
  saveTtsModel,
  loadTtsProvider,
  saveTtsProvider,
} from './services/storage'

const buildWelcomeMessage = (friend: Friend, level: number): ChatMessage => {
  if (friend.initialMessage) {
    return {
      id: `welcome-${friend.id || 'default'}-${Date.now()}`,
      role: 'assistant',
      reply: {
        zh: friend.initialMessage.zh,
        ja: friend.initialMessage.ja,
        pinyin: friend.initialMessage.pinyin,
        hskLevel: level,
      },
      correction: {
        hasCorrection: false,
      },
      vocabulary: friend.initialMessage.vocabulary || [
        { term: '高兴', pinyin: 'gāoxìng', ja: 'うれしい', hskLevel: 1 },
        { term: '认识', pinyin: 'rènshi', ja: '知り合う', hskLevel: 2 },
      ],
      timestamp: Date.now(),
    }
  }

  // 名前から英語表記や括弧を取り除いた簡潔な呼び名を取得（例: "王浩 (Wang Hao)" -> "王浩"）
  const cleanName = friend.name.replace(/\s*\(.*?\)/g, '').trim() || friend.name

  return {
    id: `welcome-${friend.id || 'default'}-${Date.now()}`,
    role: 'assistant',
    reply: {
      zh: `你好！我是${cleanName}。很高兴认识你！你想聊点什么？`,
      ja: `こんにちは！${friend.name}です。はじめまして！何について話したいですか？`,
      pinyin: `Nǐ hǎo! Hěn gāoxìng rènshi nǐ! Nǐ xiǎng liáo diǎn shénme?`,
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
  }
}

/**
 * 過去に保存された古いウェルカムメッセージ（日本語が混入していたもの）を最新の完全中国語メッセージに更新する
 */
const sanitizeWelcomeHistory = (saved: ChatMessage[], friend: Friend, level: number): ChatMessage[] => {
  if (saved.length === 1 && saved[0].id.startsWith('welcome-')) {
    return [buildWelcomeMessage(friend, level)]
  }
  return saved
}

export default function App() {
  const [hskLevel, setHskLevel] = useState<number>(() => loadHskLevel(2))
  const [apiKey, setApiKey] = useState<string>(() => loadApiKey())
  const [model, setModel] = useState<string>(() => loadSelectedModel('google/gemini-2.5-flash'))
  const [customFriends, setCustomFriends] = useState<Friend[]>(() => loadCustomFriends())

  // 全友達リスト（プリセット＋カスタム）※保存された個別声質設定をマージ
  const allFriends = useMemo(() => {
    const list = [...PRESET_FRIENDS, ...customFriends]
    return list.map((f) => {
      if (!f.id) return f
      const savedVoice = loadFriendVoice(f.id)
      return savedVoice ? { ...f, voice: savedVoice } : f
    })
  }, [customFriends])

  // 現在の友達
  const [currentFriend, setCurrentFriend] = useState<Friend>(() => {
    const savedId = loadSelectedFriendId('friend-meiling')
    const found = allFriends.find((f) => f.id === savedId) || PRESET_FRIENDS[0]
    const savedVoice = found.id ? loadFriendVoice(found.id) : null
    return savedVoice ? { ...found, voice: savedVoice } : found
  })

  // 音声関連設定
  const [autoPlayTts, setAutoPlayTts] = useState<boolean>(() => loadAutoPlayTts(false))
  const [speechInputLang, setSpeechInputLang] = useState<'zh-CN' | 'ja-JP'>(() =>
    loadSpeechInputLang('zh-CN')
  )
  const [toneColoring, setToneColoring] = useState<boolean>(() => loadToneColoring(false))
  const [ttsModel, setTtsModel] = useState<string>(() => loadTtsModel())
  const [ttsProvider, setTtsProvider] = useState<'browser' | 'openrouter'>(() => loadTtsProvider('openrouter'))
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false)
  const [playingText, setPlayingText] = useState<string | null>(null)

  // モーダル状態
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => !isOnboardingCompleted())
  const [isFriendListOpen, setIsFriendListOpen] = useState(false)
  const [isVocabularyModalOpen, setIsVocabularyModalOpen] = useState(false)
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [vocabularyList, setVocabularyList] = useState<VocabularyItem[]>(() => loadVocabularyList())
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // 語彙帳に保存済みの単語セット（高速判定用）
  const savedTermsSet = useMemo(() => {
    return new Set(vocabularyList.map((v) => v.term.trim().toLowerCase()))
  }, [vocabularyList])

  const handleAddVocabulary = (item: Omit<VocabularyItem, 'id' | 'createdAt'>) => {
    const saved = addVocabularyItem(item)
    setVocabularyList((prev) => {
      const idx = prev.findIndex((v) => v.id === saved.id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = saved
        return copy
      }
      return [saved, ...prev]
    })
  }

  const handleDeleteVocabulary = (id: string) => {
    deleteVocabularyItem(id)
    setVocabularyList((prev) => prev.filter((v) => v.id !== id))
  }

  const handleToggleVocabularyMastered = (id: string) => {
    toggleVocabularyMastered(id)
    setVocabularyList((prev) =>
      prev.map((v) => (v.id === id ? { ...v, mastered: !v.mastered } : v))
    )
  }

  // 友達別の会話履歴
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const friendId = currentFriend.id || 'friend-meiling'
    const saved = loadFriendMessages(friendId)
    const initial = saved.length > 0 ? saved : [buildWelcomeMessage(currentFriend, loadHskLevel(2))]
    return sanitizeWelcomeHistory(initial, currentFriend, loadHskLevel(2))
  })

  // メッセージの保存（現在の友達のセッション）
  useEffect(() => {
    const friendId = currentFriend.id || 'friend-meiling'
    saveFriendMessages(friendId, messages)
  }, [messages, currentFriend.id])

  // 画面遷移やアンマウント時の音声停止
  useEffect(() => {
    return () => {
      stopSpeaking()
    }
  }, [])

  const handleHskChange = (level: number) => {
    setHskLevel(level)
    saveHskLevel(level)
  }

  const handleSaveSettings = (
    newKey: string,
    newModel: string,
    newAutoPlay: boolean,
    newSpeechLang: 'zh-CN' | 'ja-JP',
    newToneColoring: boolean,
    newTtsModel?: string,
    newTtsProvider?: 'browser' | 'openrouter'
  ) => {
    setApiKey(newKey)
    saveApiKey(newKey)
    setModel(newModel)
    saveSelectedModel(newModel)
    setAutoPlayTts(newAutoPlay)
    saveAutoPlayTts(newAutoPlay)
    setSpeechInputLang(newSpeechLang)
    saveSpeechInputLang(newSpeechLang)
    setToneColoring(newToneColoring)
    saveToneColoring(newToneColoring)
    if (newTtsModel !== undefined) {
      setTtsModel(newTtsModel)
      saveTtsModel(newTtsModel)
    }
    if (newTtsProvider !== undefined) {
      setTtsProvider(newTtsProvider)
      saveTtsProvider(newTtsProvider)
    }
    setErrorMessage(null)
  }

  const handleSpeechLangChange = (newLang: 'zh-CN' | 'ja-JP') => {
    setSpeechInputLang(newLang)
    saveSpeechInputLang(newLang)
  }

  const handleToggleAutoPlayTts = () => {
    setAutoPlayTts((prev) => {
      const next = !prev
      saveAutoPlayTts(next)
      return next
    })
  }

  const handleToggleToneColoring = () => {
    setToneColoring((prev) => {
      const next = !prev
      saveToneColoring(next)
      return next
    })
  }

  const handleSaveFriendVoice = (updatedVoice: Voice) => {
    if (!currentFriend.id) return
    saveFriendVoice(currentFriend.id, updatedVoice)
    const updated = { ...currentFriend, voice: updatedVoice }
    setCurrentFriend(updated)
    setCustomFriends((prev) =>
      prev.map((f) => (f.id === currentFriend.id ? { ...f, voice: updatedVoice } : f))
    )
  }

  const handlePlayText = (text: string) => {
    stopSpeaking()
    setPlayingText(text)
    speakChinese(text, currentFriend.voice, {
      onEnd: () => setPlayingText(null),
      onError: () => setPlayingText(null),
    })
  }

  const handleStopText = () => {
    stopSpeaking()
    setPlayingText(null)
  }

  // 友達切り替え
  const handleSelectFriend = (newFriend: Friend) => {
    if (newFriend.id === currentFriend.id) return

    stopSpeaking()
    setPlayingText(null)

    const oldFriendId = currentFriend.id || 'friend-meiling'
    saveFriendMessages(oldFriendId, messages)

    const newFriendId = newFriend.id || 'friend-meiling'
    const saved = loadFriendMessages(newFriendId)
    const initial = saved.length > 0 ? saved : [buildWelcomeMessage(newFriend, hskLevel)]
    const nextMessages = sanitizeWelcomeHistory(initial, newFriend, hskLevel)

    // 保存された音声設定を反映
    const savedVoice = loadFriendVoice(newFriendId)
    const friendWithVoice = savedVoice ? { ...newFriend, voice: savedVoice } : newFriend

    setCurrentFriend(friendWithVoice)
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
      stopSpeaking()
      setPlayingText(null)
      const friendId = currentFriend.id || 'friend-meiling'
      clearFriendMessages(friendId)
      setMessages([buildWelcomeMessage(currentFriend, hskLevel)])
    }
  }

  const handleSendMessage = async (text: string) => {
    stopSpeaking()
    setPlayingText(null)
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

      // 返答の自動読み上げ（設定がONの場合）
      if (autoPlayTts && response.reply?.zh) {
        setTimeout(() => {
          handlePlayText(response.reply.zh)
        }, 120)
      }
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
        onOpenVocabulary={() => setIsVocabularyModalOpen(true)}
        vocabularyCount={vocabularyList.length}
        autoPlayTts={autoPlayTts}
        onToggleAutoPlayTts={handleToggleAutoPlayTts}
        toneColoring={toneColoring}
        onToggleToneColoring={handleToggleToneColoring}
      />

      {/* Main Chat Container */}
      <main className="w-full max-w-3xl flex-1 flex flex-col py-3 sm:py-4 gap-3 min-h-0 h-[calc(100vh-140px)]">
        {/* Friend Profile Card */}
        <FriendCard
          friend={currentFriend}
          onOpenFriendList={() => setIsFriendListOpen(true)}
          onOpenVoiceSettings={() => setIsVoiceSettingsOpen(true)}
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
            playingText={playingText}
            onPlayText={handlePlayText}
            onStopText={handleStopText}
            savedTerms={savedTermsSet}
            enableToneColoring={toneColoring}
            onSaveVocabulary={handleAddVocabulary}
          />
        </div>

        {/* Chat Input */}
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          speechLang={speechInputLang}
          onSpeechLangChange={handleSpeechLangChange}
          onError={(msg) => setErrorMessage(msg)}
        />
      </main>

      {/* Settings Modal (BYO-AI & Model Selection & Audio) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currentApiKey={apiKey}
        currentModel={model}
        currentTtsModel={ttsModel}
        currentTtsProvider={ttsProvider}
        autoPlayTts={autoPlayTts}
        speechInputLang={speechInputLang}
        toneColoring={toneColoring}
        onSave={handleSaveSettings}
      />

      {/* Voice Settings Modal */}
      <VoiceSettingsModal
        isOpen={isVoiceSettingsOpen}
        onClose={() => setIsVoiceSettingsOpen(false)}
        friend={currentFriend}
        onSaveVoice={handleSaveFriendVoice}
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

      {/* Vocabulary Modal (語彙帳) */}
      <VocabularyModal
        isOpen={isVocabularyModalOpen}
        onClose={() => setIsVocabularyModalOpen(false)}
        vocabularyList={vocabularyList}
        onDeleteItem={handleDeleteVocabulary}
        onToggleMastered={handleToggleVocabularyMastered}
        onAddItem={handleAddVocabulary}
        onStartReview={() => {
          setIsVocabularyModalOpen(false)
          setIsReviewModalOpen(true)
        }}
      />

      {/* Review Modal (復習: カード＆クイズ) */}
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        vocabularyList={vocabularyList}
        onToggleMastered={handleToggleVocabularyMastered}
      />
    </div>
  )
}
