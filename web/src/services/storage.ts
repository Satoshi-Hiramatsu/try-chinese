import type { ChatMessage } from '../types'

const STORAGE_KEYS = {
  API_KEY: 'shabe_china_api_key',
  HSK_LEVEL: 'shabe_china_hsk_level',
  CHAT_MESSAGES: 'shabe_china_chat_messages',
  ONBOARDING_COMPLETED: 'shabe_china_onboarding_completed',
  USER_HOBBIES: 'shabe_china_user_hobbies',
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
    // localStorage エラー無視
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

