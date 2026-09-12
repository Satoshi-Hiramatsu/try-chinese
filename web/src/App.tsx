import { useState, useEffect, useMemo, useRef } from 'react'
import type { Friend, ChatMessage, Voice, VocabularyItem } from './types'
import { PRESET_FRIENDS } from './data/presetFriends'
import { resolveLlmModel } from './data/llmModel'
import { applyProfile, type FriendProfile } from './data/friendProfile'
import { Header } from './components/Header'
import { FriendCard } from './components/FriendCard'
import { ChatMessageList } from './components/ChatMessageList'
import { NovelStage } from './components/NovelStage'
import { ChatLogModal } from './components/ChatLogModal'
import { ChatInput } from './components/ChatInput'
import { SettingsModal } from './components/SettingsModal'
import { ApiKeyModal } from './components/ApiKeyModal'
import { OnboardingModal } from './components/OnboardingModal'
import { FriendListModal } from './components/FriendListModal'
import { VoiceSettingsModal } from './components/VoiceSettingsModal'
import { VoicePitchModal } from './components/VoicePitchModal'
import { VocabularyModal } from './components/VocabularyModal'
import { ReviewModal } from './components/ReviewModal'
import { TtsDebugModal } from './components/TtsDebugModal'
import { VoiceAdminDashboard } from './components/VoiceAdminDashboard'
import { DevConsole } from './components/DevConsole'
import { TitleScreen, type ContinueSummary } from './components/TitleScreen'
import { AlertIcon, CloseIcon } from './components/Icons'
import { sendMessageToChatApi, API_KEY_EXHAUSTED_MESSAGE } from './services/api'
import { speakChinese, stopSpeaking } from './services/speech'
import { prefetchPinyin } from './services/pinyin'
import {
  NO_KEY_STATUS,
  checkApiKey,
  isApiKeyUsable,
  loadApiKeyStatus,
  publishApiKeyStatus,
  subscribeApiKeyStatus,
  type ApiKeyStatus,
} from './services/openRouterKey'
import {
  loadApiKey,
  saveApiKey,
  loadHskLevel,
  saveHskLevel,
  loadDevLlmModel,
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
  loadFriendPitch,
  saveFriendPitch,
  clearFriendVoice,
  loadFriendProfile,
  saveFriendProfile,
  clearFriendProfile,
  loadVocabularyList,
  addVocabularyItem,
  deleteVocabularyItem,
  toggleVocabularyMastered,
  loadToneColoring,
  saveToneColoring,
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

/**
 * このブラウザに保存された声を友達に重ねる。
 * 開発者の声の上書き（話者ID・調整値）→ 利用者の声の高さ、の順。高さは声そのものとは別に保存されている。
 */
function withStoredVoice(friend: Friend): Friend {
  if (!friend.id) return friend
  const voice = loadFriendVoice(friend.id) ?? friend.voice
  if (!voice) return friend
  const pitch = loadFriendPitch(friend.id)
  return { ...friend, voice: pitch !== null ? { ...voice, pitch } : voice }
}

export default function App() {
  const [hskLevel, setHskLevel] = useState<number>(() => loadHskLevel(2))
  const [apiKey, setApiKey] = useState<string>(() => loadApiKey())
  /**
   * キーの検査結果。金額は持たず「有効 / 無効 / 切れている」だけを見る。
   * 前回の結果を初期表示にし、起動時に1回だけ検査し直す。
   */
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>(() =>
    loadApiKey() ? loadApiKeyStatus() ?? { state: 'checking' } : NO_KEY_STATUS
  )
  /** 会話 LLM。固定値だが、開発者モードのテストモードで上書きできる。 */
  const [llmModel] = useState(() => resolveLlmModel(loadDevLlmModel()))
  const [customFriends, setCustomFriends] = useState<Friend[]>(() => loadCustomFriends())
  /** 声設定・プロフィール上書きの保存を検知して友達リストを組み直すための世代番号。 */
  const [voiceRevision, setVoiceRevision] = useState(0)

  // 全友達リスト（プリセット＋カスタム）※保存された声・高さ・プロフィールの上書きをマージ
  const allFriends = useMemo(() => {
    const list = [...PRESET_FRIENDS, ...customFriends]
    return list.map((f) => (f.id ? withStoredVoice(applyProfile(f, loadFriendProfile(f.id))) : f))
    // voiceRevision は保存のたびに増える。プリセットの声・プロフィールはlocalStorage側にあるため再読込が要る。
  }, [customFriends, voiceRevision])

  // 現在の友達
  const [currentFriend, setCurrentFriend] = useState<Friend>(() => {
    const savedId = loadSelectedFriendId('friend-meiling')
    return allFriends.find((f) => f.id === savedId) || allFriends[0]
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
  /** 開発者向けの声設定の対象。null のあいだはモーダルを閉じる。管理画面から別の友達を開くために持つ。 */
  const [voiceSettingsFriend, setVoiceSettingsFriend] = useState<Friend | null>(null)
  /** 利用者向けの「声の高さ」の対象。 */
  const [pitchFriend, setPitchFriend] = useState<Friend | null>(null)
  /** 声の管理ダッシュボード。URLハッシュ #admin で開く。 */
  const [isAdminOpen, setIsAdminOpen] = useState(false)
  /** 開発者モード。URLハッシュ #dev で開く。通常の設定画面からは辿れない。 */
  const [isDevOpen, setIsDevOpen] = useState(false)
  const [playingText, setPlayingText] = useState<string | null>(null)

  /*
   * 起動直後はタイトル画面を出し、メニューから会話画面へ入る。
   * #admin / #dev で直接開いたときは管理・開発用途なのでタイトルを飛ばす。
   */
  const [appPhase, setAppPhase] = useState<'title' | 'play'>(() =>
    window.location.hash === '#admin' || window.location.hash === '#dev' ? 'play' : 'title'
  )
  /** タイトルの「はじめから」「友達をえらぶ」から友達一覧を開いたときの用途。null は通常の切り替え */
  const [titleFriendPick, setTitleFriendPick] = useState<'new' | 'choose' | null>(null)

  // モーダル状態
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  /** APIキーだけの小さなモーダル。タイトルと会話画面のバッジから開く */
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false)
  /** キーが無くて会話・読み上げを止めたときの理由。モーダルの先頭に出す */
  const [apiKeyNotice, setApiKeyNotice] = useState<string | null>(null)
  // 初回のオンボーディングはタイトルの「はじめる」から開く
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
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

  // 会話や音声の途中で 402 を受けたときも、ここ経由で画面の表示が変わる。
  useEffect(() => subscribeApiKeyStatus(setApiKeyStatus), [])

  /** キーを検査して結果を保存・配信する。保存時とモーダルの「確認」から呼ぶ。 */
  const verifyApiKey = async (key: string) => {
    if (!key.trim()) {
      publishApiKeyStatus(NO_KEY_STATUS)
      return
    }
    publishApiKeyStatus({ state: 'checking' })
    publishApiKeyStatus(await checkApiKey(key, loadApiKeyStatus()))
  }

  /** APIキーのモーダルからの保存。空なら削除する。 */
  const handleSaveApiKey = (newKey: string) => {
    const trimmed = newKey.trim()
    if (trimmed === apiKey) return
    setApiKey(trimmed)
    saveApiKey(trimmed)
    void verifyApiKey(trimmed)
    setErrorMessage(null)
  }

  /**
   * 送ってよいキーを返す。無ければ理由つきでキー入力のモーダルを開き、null を返す。
   * 無効・残高切れと分かっているキーも送らない（送っても失敗するだけ）。
   */
  const requireUsableApiKey = (reason: string): string | null => {
    const usable = apiKey && isApiKeyUsable(apiKeyStatus) ? apiKey : ''
    if (usable) return usable
    setApiKeyNotice(reason)
    setIsApiKeyModalOpen(true)
    return null
  }

  // 起動時に1回だけ検査する。会話のたびには叩かない。
  useEffect(() => {
    const key = loadApiKey()
    if (!key) return
    let cancelled = false
    checkApiKey(key, loadApiKeyStatus()).then((status) => {
      if (!cancelled) publishApiKeyStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleHskChange = (level: number) => {
    setHskLevel(level)
    saveHskLevel(level)
  }

  const handleSaveSettings = (
    newKey: string,
    newAutoPlay: boolean,
    newSpeechLang: 'zh-CN' | 'ja-JP',
    newToneColoring: boolean,
    newSilenceTimeoutMs: number
  ) => {
    if (newKey.trim() !== apiKey) {
      setApiKey(newKey.trim())
      saveApiKey(newKey)
      void verifyApiKey(newKey)
    }
    setAutoPlayTts(newAutoPlay)
    saveAutoPlayTts(newAutoPlay)
    if (!newAutoPlay) setHandsFreeEnabled(false)
    setSpeechInputLang(newSpeechLang)
    saveSpeechInputLang(newSpeechLang)
    setToneColoring(newToneColoring)
    saveToneColoring(newToneColoring)
    setSilenceTimeoutMs(newSilenceTimeoutMs)
    saveSilenceTimeoutMs(newSilenceTimeoutMs)
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

  /** 利用者が変えた声の高さを保存する。null は標準に戻す。 */
  const handleSavePitchForFriend = (friendId: string, pitch: number | null) => {
    saveFriendPitch(friendId, pitch)
    const apply = (friend: Friend): Friend =>
      friend.id === friendId && friend.voice ? { ...friend, voice: { ...friend.voice, pitch: pitch ?? 1.0 } } : friend
    setCurrentFriend(apply)
    setVoiceRevision((current) => current + 1)
  }

  /**
   * プリセットの友達の声の上書きを捨てて presetFriends.ts の値に戻す。
   * カスタム友達は声が本体にしか無いため対象にしない（呼び出し側でボタンを出さない）。
   */
  const handleResetVoiceToPreset = (friendId: string) => {
    clearFriendVoice(friendId)
    const preset = PRESET_FRIENDS.find((f) => f.id === friendId)
    if (preset) {
      setCurrentFriend((prev) => (prev.id === friendId ? { ...prev, voice: preset.voice } : prev))
    }
    setVoiceSettingsFriend(null)
    setVoiceRevision((current) => current + 1)
  }

  /**
   * キャラクターモードからのプロフィール保存。
   * カスタム友達は本体を更新し、プリセットは localStorage の上書きとして残す。
   */
  const handleSaveProfile = (friendId: string, profile: FriendProfile) => {
    const custom = customFriends.find((f) => f.id === friendId)
    if (custom) {
      handleUpdateFriend(applyProfile(custom, profile))
      return
    }
    saveFriendProfile(friendId, profile)
    setCurrentFriend((prev) => (prev.id === friendId ? applyProfile(prev, profile) : prev))
    setVoiceRevision((current) => current + 1)
  }

  /** プリセットのプロフィール上書きを捨てて presetFriends.ts の値に戻す。 */
  const handleResetProfile = (friendId: string) => {
    clearFriendProfile(friendId)
    const preset = PRESET_FRIENDS.find((f) => f.id === friendId)
    if (preset) {
      setCurrentFriend((prev) => (prev.id === friendId ? { ...preset, voice: prev.voice } : prev))
    }
    setVoiceRevision((current) => current + 1)
  }

  /**
   * text は画面に出ている文字列で、再生中の見た目の判定にも使う。
   * speechText は読み上げ専用の文字列で、指定が無ければ text をそのまま読む。
   */
  const handlePlayText = (text: string, speechText?: string, resumeHandsFree = false) => {
    stopSpeaking()
    if (!requireUsableApiKey('読み上げには OpenRouter API キーが必要です。')) {
      if (resumeHandsFree) setHandsFreeResumeToken((prev) => prev + 1)
      return
    }
    setPlayingText(text)
    let completed = false
    const completePlayback = () => {
      if (completed) return
      completed = true
      setPlayingText(null)
      if (resumeHandsFree) setHandsFreeResumeToken((prev) => prev + 1)
    }
    speakChinese(speechText || text, currentFriend.voice, {
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

    // 保存された声と高さを反映
    setCurrentFriend(withStoredVoice(newFriend))
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

  /* ---------------------------------------------------------------- タイトル画面 */

  /** 「つづきから」に添える直近セッションの要約。ウェルカムしか無ければ null */
  const continueSummary = useMemo<ContinueSummary | null>(() => {
    const turns = messages.filter((m) => m.role === 'user').length
    if (turns === 0) return null
    const last = messages[messages.length - 1]
    return { lastAt: last.timestamp, turns }
  }, [messages])

  const enterPlay = () => {
    setTitleFriendPick(null)
    setAppPhase('play')
  }

  /** 友達一覧で友達を選んだとき。タイトルから開いた場合は用途に応じて会話を整えてから入る */
  const handlePickFriend = (friend: Friend) => {
    if (titleFriendPick === null) {
      handleSelectFriend(friend)
      return
    }
    const friendId = friend.id || 'friend-meiling'
    const hasHistory = loadFriendMessages(friendId).some((m) => m.role === 'user')
    if (titleFriendPick === 'new' && hasHistory) {
      if (!confirm(`「${friend.name}」との会話履歴を消して、はじめから話しますか？`)) return
      clearFriendMessages(friendId)
    }
    handleSelectFriend(friend)
    if (titleFriendPick === 'new') {
      // 同じ友達を選び直した場合は handleSelectFriend が早期リターンするので、ここで確実に新規にする
      setCurrentFriend(withStoredVoice(friend))
      setMessages([buildWelcomeMessage(friend, hskLevel)])
    }
    enterPlay()
  }

  const handleSendMessage = async (text: string) => {
    stopSpeaking()
    setPlayingText(null)
    setErrorMessage(null)

    const usableKey = requireUsableApiKey('会話には OpenRouter API キーが必要です。')
    if (!usableKey) {
      if (handsFreeEnabled) setHandsFreeResumeToken((prev) => prev + 1)
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setIsLoading(true)

    // 添削と語彙は返答より遅れて届く。先に置いた返答へ後から差し込むため、
    // 差し込み先を特定できるようIDを先に決めておく。
    const assistantId = `assistant-${Date.now()}`

    try {
      const response = await sendMessageToChatApi({
        message: text,
        friend: currentFriend,
        hskLevel,
        history: nextMessages,
        apiKey: usableKey,
        model: llmModel.model,
        onSupport: (support) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantId
                ? { ...item, correction: support.correction, vocabulary: support.vocabulary }
                : item
            )
          )
        },
      })

      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        reply: response.reply,
        // 添削と語彙は onSupport で埋まる。届くまでは何も出さない。
        correction: { hasCorrection: false },
        vocabulary: [],
        expression: response.expression,
        timestamp: Date.now(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // 返答の自動読み上げ（設定がONの場合）
      if (autoPlayTts && response.reply?.zh) {
        setTimeout(() => {
          handlePlayText(response.reply.zh, response.reply.speech, handsFreeEnabled)
        }, 120)
      } else if (handsFreeEnabled) {
        setHandsFreeResumeToken((prev) => prev + 1)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '予期せぬエラーが発生しました'
      setErrorMessage(msg)

      if (handsFreeEnabled) setHandsFreeResumeToken((prev) => prev + 1)

      // 残高切れ・無効なキーはその場でキー入力へ誘導する
      if (msg === API_KEY_EXHAUSTED_MESSAGE || msg.includes('APIキー') || msg.includes('401')) {
        setApiKeyNotice(msg)
        setIsApiKeyModalOpen(true)
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
      {appPhase === 'title' ? (
        <TitleScreen
          friend={currentFriend}
          continueSummary={continueSummary}
          isFirstLaunch={!isOnboardingCompleted()}
          apiKeyStatus={apiKeyStatus}
          onContinue={enterPlay}
          onNewGame={() => {
            setTitleFriendPick('new')
            setIsFriendListOpen(true)
          }}
          onChooseFriend={() => {
            setTitleFriendPick('choose')
            setIsFriendListOpen(true)
          }}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenApiKey={() => setIsApiKeyModalOpen(true)}
          onBegin={() => setIsOnboardingOpen(true)}
        />
      ) : (
        <>
      {/* Header */}
      <Header
        hskLevel={hskLevel}
        onHskChange={handleHskChange}
        apiKeyStatus={apiKeyStatus}
        onOpenApiKey={() => setIsApiKeyModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
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
            onOpenVoiceSettings={() => setPitchFriend(currentFriend)}
            logCount={messages.length}
          />
        ) : (
          <>
            {/* Friend Profile Card */}
            <FriendCard
              friend={currentFriend}
              onOpenFriendList={() => setIsFriendListOpen(true)}
              onOpenVoiceSettings={() => setPitchFriend(currentFriend)}
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
        </>
      )}

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => {
          setIsApiKeyModalOpen(false)
          setApiKeyNotice(null)
        }}
        currentApiKey={apiKey}
        status={apiKeyStatus}
        onSave={handleSaveApiKey}
        notice={apiKeyNotice ?? undefined}
      />

      {/* 設定（APIキー・音声・入力） */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currentApiKey={apiKey}
        apiKeyStatus={apiKeyStatus}
        autoPlayTts={autoPlayTts}
        speechInputLang={speechInputLang}
        toneColoring={toneColoring}
        silenceTimeoutMs={silenceTimeoutMs}
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
        onSaveProfile={handleSaveProfile}
        onResetProfile={handleResetProfile}
        onEditVoice={(friend) => setVoiceSettingsFriend(friend)}
        onSelectFriend={handleSelectFriend}
      />

      {/* 声の管理ダッシュボード（#admin） */}
      <VoiceAdminDashboard
        isOpen={isAdminOpen}
        onClose={closeAdmin}
        friends={allFriends}
        onSaveVoice={handleSaveVoiceForFriend}
        onEditFriend={(friend) => setVoiceSettingsFriend(friend)}
      />

      {/* 利用者向け: 声の高さ */}
      <VoicePitchModal
        isOpen={pitchFriend !== null}
        onClose={() => setPitchFriend(null)}
        friend={pitchFriend || currentFriend}
        onSave={(pitch) => {
          const targetId = (pitchFriend || currentFriend).id
          if (targetId) handleSavePitchForFriend(targetId, pitch)
        }}
      />

      {/* 開発者向け: 声設定（話者ID・調整値） */}
      <VoiceSettingsModal
        isOpen={voiceSettingsFriend !== null}
        onClose={() => setVoiceSettingsFriend(null)}
        friend={voiceSettingsFriend || currentFriend}
        onSaveVoice={(updatedVoice) => {
          const targetId = (voiceSettingsFriend || currentFriend).id
          if (targetId) handleSaveVoiceForFriend(targetId, updatedVoice)
        }}
        // プリセットの友達で、このブラウザに上書きがあるときだけ「プリセットに戻す」を出す
        canResetToPreset={(() => {
          const target = voiceSettingsFriend || currentFriend
          return Boolean(target.id && PRESET_FRIENDS.some((f) => f.id === target.id) && loadFriendVoice(target.id))
        })()}
        onResetToPreset={() => {
          const targetId = (voiceSettingsFriend || currentFriend).id
          if (targetId) handleResetVoiceToPreset(targetId)
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
          if (appPhase === 'title') enterPlay()
          // キーが無いままでは会話が始められないので、続けて入力を促す
          requireUsableApiKey('会話を始めるには OpenRouter API キーが必要です。')
        }}
      />

      {/* Friend List / Create Modal */}
      <FriendListModal
        isOpen={isFriendListOpen}
        onClose={() => {
          setIsFriendListOpen(false)
          setTitleFriendPick(null)
        }}
        friends={allFriends}
        /* タイトルから開いたときは今の友達も選び直せるよう、選択中の扱いを外す */
        currentFriendId={titleFriendPick ? undefined : currentFriend.id}
        onSelectFriend={handlePickFriend}
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
