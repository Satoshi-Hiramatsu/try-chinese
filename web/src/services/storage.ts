import type { FriendProfile } from '../data/friendProfile'
import type { ChatMessage, Friend, Voice, VocabularyItem } from '../types'
import { DEFAULT_SILENCE_TIMEOUT_MS, clampSilenceTimeoutMs } from './speech'
import { clampVoicePitch, normalizeStoredVoice } from '../data/fishVoice'

const STORAGE_KEYS = {
  API_KEY: 'shabe_china_api_key',
  API_KEY_STATUS: 'shabe_china_api_key_status',
  HSK_LEVEL: 'shabe_china_hsk_level',
  CHAT_MESSAGES: 'shabe_china_chat_messages',
  ONBOARDING_COMPLETED: 'shabe_china_onboarding_completed',
  USER_HOBBIES: 'shabe_china_user_hobbies',
  CUSTOM_FRIENDS: 'shabe_china_custom_friends',
  SELECTED_FRIEND_ID: 'shabe_china_selected_friend_id',
  SESSION_PREFIX: 'shabe_china_session_',
  DEV_LLM_MODEL: 'shabe_china_dev_llm_model',
  AUTO_PLAY_TTS: 'shabe_china_auto_play_tts',
  SPEECH_INPUT_LANG: 'shabe_china_speech_input_lang',
  SILENCE_TIMEOUT_MS: 'shabe_china_silence_timeout_ms',
  FRIEND_VOICE_PREFIX: 'shabe_china_voice_',
  FRIEND_PITCH_PREFIX: 'shabe_china_pitch_',
  VOCABULARY_LIST: 'shabe_china_vocabulary_list',
  TONE_COLORING: 'shabe_china_tone_coloring',
  VIEW_MODE: 'shabe_china_view_mode',
  FRIEND_PROFILE_PREFIX: 'shabe_china_profile_',
} as const

/** 画面モード: novel = ノベルステージ / chat = チャットログ */
export type ViewMode = 'novel' | 'chat'

export function loadViewMode(defaultMode: ViewMode = 'novel'): ViewMode {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.VIEW_MODE)
    return val === 'chat' || val === 'novel' ? val : defaultMode
  } catch {
    return defaultMode
  }
}

export function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode)
  } catch {
    // ignore
  }
}

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

/**
 * キーの検査結果のキャッシュ。中身の型は services/openRouterKey.ts が決める。
 * 次回起動時の初期表示と、無料モードに落とすべきキー（無効・残高切れ）の判定に使う。
 */
export function loadApiKeyStatusRaw(): unknown {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.API_KEY_STATUS)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

export function saveApiKeyStatusRaw(status: unknown): void {
  try {
    if (status === null || status === undefined) {
      localStorage.removeItem(STORAGE_KEYS.API_KEY_STATUS)
    } else {
      localStorage.setItem(STORAGE_KEYS.API_KEY_STATUS, JSON.stringify(status))
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
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Kokoro の時代に作った友達の声は Fish の話者を持たないため外す（作成画面で選び直せる）。
    return (parsed as Friend[]).map((friend) => {
      const voice = normalizeStoredVoice(friend.voice)
      return voice ? { ...friend, voice } : { ...friend, voice: undefined }
    })
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

// --- 会話 LLM の開発者上書き（テストモード） ---
// 利用者向けの設定は持たない。旧キー shabe_china_selected_model は読まず、固定モデルで動く。

export function loadDevLlmModel(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.DEV_LLM_MODEL)
  } catch {
    return null
  }
}

/** 空を渡すと上書きを消して固定モデルに戻す。 */
export function saveDevLlmModel(model: string): void {
  try {
    if (model.trim()) {
      localStorage.setItem(STORAGE_KEYS.DEV_LLM_MODEL, model.trim())
    } else {
      localStorage.removeItem(STORAGE_KEYS.DEV_LLM_MODEL)
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

/** 音声入力を打ち切るまでの無音許容時間(ms) */
export function loadSilenceTimeoutMs(defaultMs: number = DEFAULT_SILENCE_TIMEOUT_MS): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SILENCE_TIMEOUT_MS)
    if (!raw) return defaultMs
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return defaultMs
    return clampSilenceTimeoutMs(parsed)
  } catch {
    return defaultMs
  }
}

export function saveSilenceTimeoutMs(ms: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SILENCE_TIMEOUT_MS, String(clampSilenceTimeoutMs(ms)))
  } catch {
    // ignore
  }
}

/**
 * 開発者モードで保存した声の上書き。
 * Kokoro・ブラウザ音声の時代の保存データは Fish の話者IDを持つものだけ拾い、それ以外は無いものとして扱う。
 */
export function loadFriendVoice(friendId: string): Voice | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.FRIEND_VOICE_PREFIX}${friendId}`)
    if (!raw) return null
    return normalizeStoredVoice(JSON.parse(raw))
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

/** この友達の声の上書きを捨て、presetFriends.ts の値に戻す。 */
export function clearFriendVoice(friendId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEYS.FRIEND_VOICE_PREFIX}${friendId}`)
  } catch {
    // ignore
  }
}

// --- 利用者が変えた声の高さ ---
// 声そのもの（話者ID・調整値）とは別に持つ。プリセットの声を後から直しても、高さの好みだけ残して届くようにするため。

export function loadFriendPitch(friendId: string): number | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.FRIEND_PITCH_PREFIX}${friendId}`)
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) ? clampVoicePitch(value) : null
  } catch {
    return null
  }
}

/** null を渡すと保存を消して標準に戻す。 */
export function saveFriendPitch(friendId: string, pitch: number | null): void {
  try {
    const key = `${STORAGE_KEYS.FRIEND_PITCH_PREFIX}${friendId}`
    if (pitch === null) localStorage.removeItem(key)
    else localStorage.setItem(key, String(clampVoicePitch(pitch)))
  } catch {
    // ignore
  }
}

/** 声の上書きが保存されている友達IDの一覧。全リセットの件数表示と実行に使う。 */
export function listFriendVoiceOverrides(): string[] {
  try {
    const ids: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && key.startsWith(STORAGE_KEYS.FRIEND_VOICE_PREFIX)) {
        ids.push(key.slice(STORAGE_KEYS.FRIEND_VOICE_PREFIX.length))
      }
    }
    return ids
  } catch {
    return []
  }
}

/** すべての友達の声の上書きを捨てる。消した件数を返す。 */
export function clearAllFriendVoices(): number {
  const ids = listFriendVoiceOverrides()
  for (const id of ids) clearFriendVoice(id)
  return ids.length
}

// --- プリセット友達のプロフィール上書き（キャラクターモード） ---

export function loadFriendProfile(friendId: string): Partial<FriendProfile> | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.FRIEND_PROFILE_PREFIX}${friendId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Partial<FriendProfile>) : null
  } catch {
    return null
  }
}

export function saveFriendProfile(friendId: string, profile: Partial<FriendProfile>): void {
  try {
    localStorage.setItem(`${STORAGE_KEYS.FRIEND_PROFILE_PREFIX}${friendId}`, JSON.stringify(profile))
  } catch {
    // ignore
  }
}

export function clearFriendProfile(friendId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_KEYS.FRIEND_PROFILE_PREFIX}${friendId}`)
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
