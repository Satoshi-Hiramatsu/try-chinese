import type { ChatMessage, Friend, Voice, VocabularyItem } from '../types'

const STORAGE_KEYS = {
  API_KEY: 'shabe_china_api_key',
  HSK_LEVEL: 'shabe_china_hsk_level',
  CHAT_MESSAGES: 'shabe_china_chat_messages',
  ONBOARDING_COMPLETED: 'shabe_china_onboarding_completed',
  USER_HOBBIES: 'shabe_china_user_hobbies',
  CUSTOM_FRIENDS: 'shabe_china_custom_friends',
  SELECTED_FRIEND_ID: 'shabe_china_selected_friend_id',
  SESSION_PREFIX: 'shabe_china_session_',
  SELECTED_MODEL: 'shabe_china_selected_model',
  AUTO_PLAY_TTS: 'shabe_china_auto_play_tts',
  SPEECH_INPUT_LANG: 'shabe_china_speech_input_lang',
  FRIEND_VOICE_PREFIX: 'shabe_china_voice_',
  VOCABULARY_LIST: 'shabe_china_vocabulary_list',
  TONE_COLORING: 'shabe_china_tone_coloring',
  OPENAI_API_KEY: 'shabe_china_openai_api_key',
  TTS_PROVIDER: 'shabe_china_tts_provider',
  TTS_MODEL: 'shabe_china_tts_model',
} as const

export function loadApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.API_KEY) || ''
  } catch {
    return ''
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEYS.API_KEY, key.trim())
    } else {
      localStorage.removeItem(STORAGE_KEYS.API_KEY)
    }
  } catch {
    // ignore
  }
}

export function loadHskLevel(defaultLevel = 2): number {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.HSK_LEVEL)
    if (!val) return defaultLevel
    const num = Number(val)
    return isNaN(num) || num < 1 || num > 6 ? defaultLevel : num
  } catch {
    return defaultLevel
  }
}

export function saveHskLevel(level: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.HSK_LEVEL, String(level))
  } catch {
    // ignore
  }
}

export function loadChatMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveChatMessages(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(messages))
  } catch {
    // ignore
  }
}

export function clearChatMessages(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CHAT_MESSAGES)
  } catch {
    // ignore
  }
}

export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED) === 'true'
  } catch {
    return false
  }
}

export function setOnboardingCompleted(completed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, String(completed))
  } catch {
    // ignore
  }
}

export function loadUserHobbies(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER_HOBBIES)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveUserHobbies(hobbies: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_HOBBIES, JSON.stringify(hobbies))
  } catch {
    // ignore
  }
}

// --- 友達（ペルソナ）管理 & 友達別会話セッション ---

export function loadCustomFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_FRIENDS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomFriend(friend: Friend): void {
  try {
    const current = loadCustomFriends()
    const index = current.findIndex((f) => f.id === friend.id)
    if (index >= 0) {
      current[index] = friend
    } else {
      current.push(friend)
    }
    localStorage.setItem(STORAGE_KEYS.CUSTOM_FRIENDS, JSON.stringify(current))
  } catch {
    // ignore
  }
}

export function deleteCustomFriend(id: string): void {
  try {
    const current = loadCustomFriends()
    const filtered = current.filter((f) => f.id !== id)
    localStorage.setItem(STORAGE_KEYS.CUSTOM_FRIENDS, JSON.stringify(filtered))
    localStorage.removeItem(`${STORAGE_KEYS.SESSION_PREFIX}${id}`)
  } catch {
    // ignore
  }
}

export function loadSelectedFriendId(defaultId = 'friend-meiling'): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_FRIEND_ID) || defaultId
  } catch {
    return defaultId
  }
}

export function saveSelectedFriendId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SELECTED_FRIEND_ID, id)
  } catch {
    // ignore
  }
}

export function loadFriendMessages(friendId: string): ChatMessage[] {
  try {
    const key = `${STORAGE_KEYS.SESSION_PREFIX}${friendId}`
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveFriendMessages(friendId: string, messages: ChatMessage[]): void {
  try {
    const key = `${STORAGE_KEYS.SESSION_PREFIX}${friendId}`
    localStorage.setItem(key, JSON.stringify(messages))
  } catch {
    // ignore
  }
}

export function clearFriendMessages(friendId: string): void {
  try {
    const key = `${STORAGE_KEYS.SESSION_PREFIX}${friendId}`
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function loadSelectedModel(defaultModel = 'google/gemini-2.5-flash'): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_MODEL) || defaultModel
  } catch {
    return defaultModel
  }
}

export function saveSelectedModel(model: string): void {
  try {
    if (model.trim()) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_MODEL, model.trim())
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_MODEL)
    }
  } catch {
    // ignore
  }
}

export function loadAutoPlayTts(defaultValue = false): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.AUTO_PLAY_TTS)
    if (val === null) return defaultValue
    return val === 'true'
  } catch {
    return defaultValue
  }
}

export function saveAutoPlayTts(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.AUTO_PLAY_TTS, String(enabled))
  } catch {
    // ignore
  }
}

export function loadSpeechInputLang(defaultLang: 'zh-CN' | 'ja-JP' = 'zh-CN'): 'zh-CN' | 'ja-JP' {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.SPEECH_INPUT_LANG)
    if (val === 'zh-CN' || val === 'ja-JP') return val
    return defaultLang
  } catch {
    return defaultLang
  }
}

export function saveSpeechInputLang(lang: 'zh-CN' | 'ja-JP'): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SPEECH_INPUT_LANG, lang)
  } catch {
    // ignore
  }
}

export function loadFriendVoice(friendId: string): Voice | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.FRIEND_VOICE_PREFIX}${friendId}`)
    if (!raw) return null
    return JSON.parse(raw) as Voice
  } catch {
    return null
  }
}

export function saveFriendVoice(friendId: string, voice: Voice): void {
  try {
    localStorage.setItem(`${STORAGE_KEYS.FRIEND_VOICE_PREFIX}${friendId}`, JSON.stringify(voice))
  } catch {
    // ignore
  }
}

// --- 語彙帳 (VocabularyBook) ---

export function loadVocabularyList(): VocabularyItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VOCABULARY_LIST)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveVocabularyList(items: VocabularyItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VOCABULARY_LIST, JSON.stringify(items))
  } catch {
    // ignore
  }
}

export function addVocabularyItem(
  item: Omit<VocabularyItem, 'id' | 'createdAt'>
): VocabularyItem {
  const current = loadVocabularyList()
  // 重複チェック（term が同一なら既存を更新、なければ新規作成）
  const existingIndex = current.findIndex(
    (v) => v.term.trim().toLowerCase() === item.term.trim().toLowerCase()
  )

  const newItem: VocabularyItem = {
    ...item,
    id: existingIndex >= 0 ? current[existingIndex].id : `vocab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: existingIndex >= 0 ? current[existingIndex].createdAt : Date.now(),
    mastered: existingIndex >= 0 ? current[existingIndex].mastered : false,
  }

  let nextList: VocabularyItem[]
  if (existingIndex >= 0) {
    nextList = [...current]
    nextList[existingIndex] = newItem
  } else {
    nextList = [newItem, ...current]
  }

  saveVocabularyList(nextList)
  return newItem
}

export function deleteVocabularyItem(id: string): void {
  const current = loadVocabularyList()
  const nextList = current.filter((v) => v.id !== id)
  saveVocabularyList(nextList)
}

export function toggleVocabularyMastered(id: string): boolean {
  const current = loadVocabularyList()
  let isMastered = false
  const nextList = current.map((v) => {
    if (v.id === id) {
      isMastered = !v.mastered
      return { ...v, mastered: isMastered }
    }
    return v
  })
  saveVocabularyList(nextList)
  return isMastered
}

export function isVocabularySaved(term: string): boolean {
  const current = loadVocabularyList()
  const target = term.trim().toLowerCase()
  return current.some((v) => v.term.trim().toLowerCase() === target)
}

// --- ピンイン声調の色分け設定 ---

export function loadToneColoring(defaultValue = false): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.TONE_COLORING)
    if (val === null) return defaultValue
    return val === 'true'
  } catch {
    return defaultValue
  }
}

export function saveToneColoring(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TONE_COLORING, String(enabled))
  } catch {
    // ignore
  }
}

// --- OpenAI APIキー (TTS用) ---

export function loadOpenAiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || ''
  } catch {
    return ''
  }
}

export function saveOpenAiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, key.trim())
    } else {
      localStorage.removeItem(STORAGE_KEYS.OPENAI_API_KEY)
    }
  } catch {
    // ignore
  }
}

// --- TTSプロバイダ設定 ('browser' | 'openrouter') ---

export function loadTtsProvider(
  defaultProvider: 'browser' | 'openrouter' = 'openrouter'
): 'browser' | 'openrouter' {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.TTS_PROVIDER)
    if (val === 'openrouter' || val === 'browser') return val
    if (val === 'openai') return 'openrouter' // 旧openai設定からの安全な自動マイグレーション
    return defaultProvider
  } catch {
    return defaultProvider
  }
}

export function saveTtsProvider(provider: 'browser' | 'openrouter'): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TTS_PROVIDER, provider)
  } catch {
    // ignore
  }
}

// --- TTS音声モデル設定 (OpenRouter) ---

export const DEFAULT_TTS_MODEL = 'qwen/qwen-audio-3.0-tts-flash'

export function loadTtsModel(defaultModel = DEFAULT_TTS_MODEL): string {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.TTS_MODEL)
    return val && val.trim() ? val.trim() : defaultModel
  } catch {
    return defaultModel
  }
}

export function saveTtsModel(model: string): void {
  try {
    if (model.trim()) {
      localStorage.setItem(STORAGE_KEYS.TTS_MODEL, model.trim())
    } else {
      localStorage.removeItem(STORAGE_KEYS.TTS_MODEL)
    }
  } catch {
    // ignore
  }
}

