import { useState, useEffect, useMemo, useRef } from 'react'
import type { Friend, ChatMessage, Voice, VocabularyItem } from './types'
import { PRESET_FRIENDS } from './data/presetFriends'
import { Header } from './components/Header'
import { FriendCard } from './components/FriendCard'
import { ChatMessageList } from './components/ChatMessageList'
import { NovelStage } from './components/NovelStage'
import { ChatLogModal } from './components/ChatLogModal'
import { ChatInput } from './components/ChatInput'
import { SettingsModal } from './components/SettingsModal'
import { OnboardingModal } from './components/OnboardingModal'
import { FriendListModal } from './components/FriendListModal'
import { VoiceSettingsModal } from './components/VoiceSettingsModal'
import { VocabularyModal } from './components/VocabularyModal'
import { ReviewModal } from './components/ReviewModal'
import { TtsDebugModal } from './components/TtsDebugModal'
import { VoiceAdminDashboard } from './components/VoiceAdminDashboard'
import { DevConsole } from './components/DevConsole'
import { AlertIcon, CloseIcon } from './components/Icons'
import { sendMessageToChatApi } from './services/api'
import { speakChinese, stopSpeaking } from './services/speech'
import { prefetchPinyin } from './services/pinyin'
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
  loadSilenceTimeoutMs,
  saveSilenceTimeoutMs,
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
  loadViewMode,
  saveViewMode,
} from './services/storage'
import type { ViewMode } from './services/storage'

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
      expression: 'smile',
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
    expression: 'smile',
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

/* 補助操作とヘッダーを自動的に畳むまでの待ち時間 */
const AUX_CONTROLS_HIDE_DELAY_MS = 4000

/*
 * 没入レイアウト（立ち絵を画面下端まで通す横画面）を適用する端末条件。
 * index.css の同条件のメディアクエリと対で維持する。
 */
const IMMERSIVE_VIEWPORT_QUERY = '(pointer: coarse) and (orientation: landscape) and (max-height: 560px)'

export default function App() {
  const [hskLevel, setHskLevel] = useState<number>(() => loadHskLevel(2))
  const [apiKey, setApiKey] = useState<string>(() => loadApiKey())
  const [model, setModel] = useState<string>(() => loadSelectedModel('google/gemini-2.5-flash'))
  const [customFriends, setCustomFriends] = useState<Friend[]>(() => loadCustomFriends())
  /** 声設定の保存を検知して友達リストを組み直すための世代番号。 */
  const [voiceRevision, setVoiceRevision] = useState(0)

  // 全友達リスト（プリセット＋カスタム）※保存された個別声質設定をマージ
  const allFriends = useMemo(() => {
    const list = [...PRESET_FRIENDS, ...customFriends]
    return list.map((f) => {
      if (!f.id) return f
      const savedVoice = loadFriendVoice(f.id)
      return savedVoice ? { ...f, voice: savedVoice } : f
    })
    // voiceRevision は保存のたびに増える。プリセットの声はlocalStorage側にあるため再読込が要る。
  }, [customFriends, voiceRevision])

  // 現在の友達
  const [currentFriend, setCurrentFriend] = useState<Friend>(() => {
    const savedId = loadSelectedFriendId('friend-meiling')
    const found = allFriends.find((f) => f.id === savedId) || PRESET_FRIENDS[0]
    const savedVoice = found.id ? loadFriendVoice(found.id) : null
    return savedVoice ? { ...found, voice: savedVoice } : found
  })

  // 音声関連設定
  const [autoPlayTts, setAutoPlayTts] = useState<boolean>(() => loadAutoPlayTts(false))
  // マイクがページ再読込だけで起動しないよう、ハンズフリーは毎回明示的に開始する
  const [handsFreeEnabled, setHandsFreeEnabled] = useState(false)
  const [handsFreeResumeToken, setHandsFreeResumeToken] = useState(0)
  const [speechInputLang, setSpeechInputLang] = useState<'zh-CN' | 'ja-JP'>(() =>
    loadSpeechInputLang('zh-CN')
  )
  const [toneColoring, setToneColoring] = useState<boolean>(() => loadToneColoring(false))
  // 音声入力を打ち切る（ハンズフリーでは自動送信する）までの無音許容時間
  const [silenceTimeoutMs, setSilenceTimeoutMs] = useState<number>(() => loadSilenceTimeoutMs())
  const [ttsModel, setTtsModel] = useState<string>(() => loadTtsModel())
  const [ttsProvider, setTtsProvider] = useState<'browser' | 'openrouter'>(() => loadTtsProvider('openrouter'))
  /** 声質カスタマイズの対象。null のあいだはモーダルを閉じる。管理画面から別の友達を開くために持つ。 */
  const [voiceSettingsFriend, setVoiceSettingsFriend] = useState<Friend | null>(null)
  /** 声の管理ダッシュボード。URLハッシュ #admin で開く。 */
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  /** 開発者モード。URLハッシュ #dev で開く。通常の設定画面からは辿れない。 */
  const [isDevOpen, setIsDevOpen] = useState(false)
  const [playingText, setPlayingText] = useState<string | null>(null)

  // モーダル状態
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => !isOnboardingCompleted())
  const [isFriendListOpen, setIsFriendListOpen] = useState(false)
  const [isVocabularyModalOpen, setIsVocabularyModalOpen] = useState(false)
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode('novel'))
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false)
  const [isTtsDebugOpen, setIsTtsDebugOpen] = useState(false)
  const [vocabularyList, setVocabularyList] = useState<VocabularyItem[]>(() => loadVocabularyList())
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [areAuxControlsVisible, setAreAuxControlsVisible] = useState(true)
  const auxControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appShellRef = useRef<HTMLDivElement>(null)
  const chatInputWrapRef = useRef<HTMLDivElement>(null)
  const hasRequestedFullscreenRef = useRef(false)

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

  /**
   * 声の管理ダッシュボードの開閉。
   *
   * 通常の会話画面と混ざらないよう、URLハッシュ `#admin` を入口にする。
   * 直接URLを開いた場合と、戻る操作で閉じた場合の両方を拾う。
   */
  useEffect(() => {
    const syncFromHash = () => {
      setIsAdminOpen(window.location.hash === '#admin')
      setIsDevOpen(window.location.hash === '#dev')
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  const openAdmin = () => {
    window.location.hash = '#admin'
    setIsAdminOpen(true)
  }

  /** ハッシュだけを消して、履歴に空のエントリを積まないようにする。 */
  const clearHash = (hash: string) => {
    if (window.location.hash === hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  const closeAdmin = () => {
    clearHash('#admin')
    setIsAdminOpen(false)
  }

  const closeDev = () => {
    clearHash('#dev')
    setIsDevOpen(false)
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

  // ピンイン辞書は別チャンクなので、起動直後に温めて最初の返答に間に合わせる。
  useEffect(() => {
    prefetchPinyin()
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
    newSilenceTimeoutMs: number,
    newTtsModel?: string,
    newTtsProvider?: 'browser' | 'openrouter'
  ) => {
    setApiKey(newKey)
    saveApiKey(newKey)
    setModel(newModel)
    saveSelectedModel(newModel)
    setAutoPlayTts(newAutoPlay)
    saveAutoPlayTts(newAutoPlay)
    if (!newAutoPlay) setHandsFreeEnabled(false)
    setSpeechInputLang(newSpeechLang)
    saveSpeechInputLang(newSpeechLang)
    setToneColoring(newToneColoring)
    saveToneColoring(newToneColoring)
    setSilenceTimeoutMs(newSilenceTimeoutMs)
    saveSilenceTimeoutMs(newSilenceTimeoutMs)
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
      if (!next) {
        setHandsFreeEnabled(false)
      }
      return next
    })
  }

  const handleHandsFreeChange = (enabled: boolean) => {
    setHandsFreeEnabled(enabled)
    if (enabled && !autoPlayTts) {
      setAutoPlayTts(true)
      saveAutoPlayTts(true)
    }
  }

  const handleToggleToneColoring = () => {
    setToneColoring((prev) => {
      const next = !prev
      saveToneColoring(next)
      return next
    })
  }

  /**
   * 1人分の声設定を保存する。
   * プリセットの友達の声は localStorage にしか無いため、世代番号を進めて一覧を組み直す。
   */
  const handleSaveVoiceForFriend = (friendId: string, updatedVoice: Voice) => {
    saveFriendVoice(friendId, updatedVoice)
    setCustomFriends((prev) =>
      prev.map((f) => (f.id === friendId ? { ...f, voice: updatedVoice } : f))
    )
    setCurrentFriend((prev) => (prev.id === friendId ? { ...prev, voice: updatedVoice } : prev))
    setVoiceSettingsFriend((prev) => (prev && prev.id === friendId ? { ...prev, voice: updatedVoice } : prev))
    setVoiceRevision((current) => current + 1)
  }

  const handlePlayText = (text: string, resumeHandsFree = false) => {
    stopSpeaking()
    setPlayingText(text)
    let completed = false
    const completePlayback = () => {
      if (completed) return
      completed = true
      setPlayingText(null)
      if (resumeHandsFree) setHandsFreeResumeToken((prev) => prev + 1)
    }
    speakChinese(text, currentFriend.voice, {
      onEnd: completePlayback,
      onError: (error) => {
        completePlayback()
        setErrorMessage(error instanceof Error ? error.message : 'Audio playback failed')
      },
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

  // 友達更新
  const handleUpdateFriend = (updatedFriend: Friend) => {
    saveCustomFriend(updatedFriend)
    setCustomFriends((prev) => {
      const idx = prev.findIndex((f) => f.id === updatedFriend.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = updatedFriend
        return next
      }
      return [...prev, updatedFriend]
    })
    if (currentFriend.id === updatedFriend.id) {
      setCurrentFriend(updatedFriend)
    }
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
        expression: response.expression,
        timestamp: Date.now(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // 返答の自動読み上げ（設定がONの場合）
      if (autoPlayTts && response.reply?.zh) {
        setTimeout(() => {
          handlePlayText(response.reply.zh, handsFreeEnabled)
        }, 120)
      } else if (handsFreeEnabled) {
        setHandsFreeResumeToken((prev) => prev + 1)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '予期せぬエラーが発生しました'
      setErrorMessage(msg)

      if (handsFreeEnabled) setHandsFreeResumeToken((prev) => prev + 1)

      if (msg.includes('APIキー') || msg.includes('401')) {
        setIsSettingsModalOpen(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    saveViewMode(mode)
  }

  // ノベルステージに表示する最新の返答と、直前のユーザー発話
  const latestAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return messages[i]
    }
    return null
  }, [messages])

  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') return messages[i].content
    }
    return undefined
  }, [messages])

  const isNovel = viewMode === 'novel'

  /*
   * 横画面ではヘッダーごと畳むため、「その他」メニューを開いている間や
   * ヘッダー内にフォーカスがある間は畳まず、次の機会へ送る。
   */
  const canHideAuxControls = () => {
    if (document.getElementById('header-more-menu')) return false
    const active = document.activeElement
    return !(active instanceof Element && active.closest('.app-header'))
  }

  const scheduleAuxControlsHide = () => {
    if (auxControlsTimerRef.current) clearTimeout(auxControlsTimerRef.current)
    setAreAuxControlsVisible(true)
    auxControlsTimerRef.current = setTimeout(() => {
      if (canHideAuxControls()) setAreAuxControlsVisible(false)
      else scheduleAuxControlsHide()
    }, AUX_CONTROLS_HIDE_DELAY_MS)
  }

  /*
   * スマホ横持ちでは最初のタップで全画面へ入り、ブラウザのアドレスバーを畳む。
   * 試行は1度きりに留め、拒否・非対応でも通常表示のまま使えるようにする。
   * 解除はヘッダーの「その他 > 全画面を終了」から行える。
   */
  const requestImmersiveFullscreen = () => {
    if (hasRequestedFullscreenRef.current) return
    if (document.fullscreenElement || !document.fullscreenEnabled) return
    if (!window.matchMedia(IMMERSIVE_VIEWPORT_QUERY).matches) return
    hasRequestedFullscreenRef.current = true
    void document.documentElement.requestFullscreen().catch(() => {})
  }

  useEffect(() => {
    scheduleAuxControlsHide()
    return () => {
      if (auxControlsTimerRef.current) clearTimeout(auxControlsTimerRef.current)
    }
  }, [])

  /*
   * テキスト枠が入力欄の下に潜り込まないよう、下余白を入力欄の高さぶん空ける。
   * 音声入力バーの有無で高さが変わるため、実測値を CSS 変数として渡す。
   */
  useEffect(() => {
    const shell = appShellRef.current
    const wrap = chatInputWrapRef.current
    if (!shell || !wrap || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      shell.style.setProperty('--vn-input-h', wrap.offsetHeight + 'px')
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [isNovel])

  return (
    <div
      ref={appShellRef}
      className={`app-shell h-[100dvh] overflow-hidden bg-gradient-to-br from-amber-50/60 via-rose-50/40 to-orange-50/50 text-stone-800 flex flex-col items-center font-sans select-text ${areAuxControlsVisible ? '' : 'aux-controls-hidden'}`}
      onPointerDown={(event) => {
        requestImmersiveFullscreen()
        if ((event.target as Element).closest('.chat-input-shell')) {
          if (auxControlsTimerRef.current) clearTimeout(auxControlsTimerRef.current)
          setAreAuxControlsVisible(false)
        } else {
          scheduleAuxControlsHide()
        }
      }}
      onFocusCapture={(event) => {
        if ((event.target as Element).closest('.chat-input-shell')) {
          if (auxControlsTimerRef.current) clearTimeout(auxControlsTimerRef.current)
          setAreAuxControlsVisible(false)
        }
      }}
      onBlurCapture={(event) => {
        if ((event.target as Element).closest('.chat-input-shell')) scheduleAuxControlsHide()
      }}
    >
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
        viewMode={viewMode}
        onChangeViewMode={handleChangeViewMode}
      />

      {/* Main Stage / Chat Container */}
      <main
        className={`app-main w-full flex-1 flex flex-col min-h-0 py-2 gap-2 ${
          isNovel ? 'app-main-novel max-w-[1920px]' : 'max-w-3xl sm:gap-3'
        }`}
      >
        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="app-error-banner bg-rose-100 border border-rose-300 text-rose-800 px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-xs flex-shrink-0">
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

        {isNovel ? (
          /* ノベルステージ（立ち絵＋テキスト枠） */
          <NovelStage
            friend={currentFriend}
            message={latestAssistantMessage}
            lastUserText={lastUserText}
            isLoading={isLoading}
            playingText={playingText}
            onPlayText={handlePlayText}
            onStopText={handleStopText}
            savedTerms={savedTermsSet}
            enableToneColoring={toneColoring}
            onSaveVocabulary={handleAddVocabulary}
            onOpenLog={() => setIsLogModalOpen(true)}
            onOpenFriendList={() => setIsFriendListOpen(true)}
            onOpenVoiceSettings={() => setVoiceSettingsFriend(currentFriend)}
            logCount={messages.length}
          />
        ) : (
          <>
            {/* Friend Profile Card */}
            <FriendCard
              friend={currentFriend}
              onOpenFriendList={() => setIsFriendListOpen(true)}
              onOpenVoiceSettings={() => setVoiceSettingsFriend(currentFriend)}
            />

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
          </>
        )}

        {/* Chat Input */}
        <div
          ref={chatInputWrapRef}
          className={isNovel ? 'chat-input-wrap vn-measure flex-shrink-0' : 'chat-input-wrap flex-shrink-0'}
        >
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            speechLang={speechInputLang}
            onSpeechLangChange={handleSpeechLangChange}
            handsFreeEnabled={handsFreeEnabled}
            onHandsFreeChange={handleHandsFreeChange}
            resumeListeningToken={handsFreeResumeToken}
            isFriendSpeaking={playingText !== null}
            silenceTimeoutMs={silenceTimeoutMs}
            onError={(msg) => setErrorMessage(msg)}
          />
        </div>
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
        silenceTimeoutMs={silenceTimeoutMs}
        onOpenTtsDebug={() => {
          setIsSettingsModalOpen(false)
          setIsTtsDebugOpen(true)
        }}
        onOpenVoiceAdmin={() => {
          setIsSettingsModalOpen(false)
          openAdmin()
        }}
        onSave={handleSaveSettings}
      />

      <TtsDebugModal
        isOpen={isTtsDebugOpen}
        onClose={() => setIsTtsDebugOpen(false)}
      />

      {/* 開発者モード（#dev） */}
      <DevConsole
        isOpen={isDevOpen}
        onClose={closeDev}
        onOpenTtsDebug={() => setIsTtsDebugOpen(true)}
        friends={allFriends}
        currentFriend={currentFriend}
        hskLevel={hskLevel}
      />

      {/* 声の管理ダッシュボード（#admin） */}
      <VoiceAdminDashboard
        isOpen={isAdminOpen}
        onClose={closeAdmin}
        friends={allFriends}
        onSaveVoice={handleSaveVoiceForFriend}
        onEditFriend={(friend) => setVoiceSettingsFriend(friend)}
      />

      {/* Voice Settings Modal */}
      <VoiceSettingsModal
        isOpen={voiceSettingsFriend !== null}
        onClose={() => setVoiceSettingsFriend(null)}
        friend={voiceSettingsFriend || currentFriend}
        onSaveVoice={(updatedVoice) => {
          const targetId = (voiceSettingsFriend || currentFriend).id
          if (targetId) handleSaveVoiceForFriend(targetId, updatedVoice)
        }}
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
        onUpdateFriend={handleUpdateFriend}
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

      {/* Chat Log Modal (ノベル画面のバックログ) */}
      <ChatLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        messages={messages}
        friend={currentFriend}
        playingText={playingText}
        onPlayText={handlePlayText}
        onStopText={handleStopText}
        savedTerms={savedTermsSet}
        enableToneColoring={toneColoring}
        onSaveVocabulary={handleAddVocabulary}
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
