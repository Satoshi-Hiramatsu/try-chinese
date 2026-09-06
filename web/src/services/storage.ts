import type { ChatMessage, Friend } from '../types'

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

