/**
 * Web Speech API を活用した中国語 TTS（音声合成）および STT（音声認識）サービス
 * 用語定義書.md および 要件定義書.md に準拠
 */

import type { Voice } from '../types'

// Web Speech API の型拡張（ブラウザ間の差異吸収）
interface IWindow extends Window {
  SpeechRecognition?: any
  webkitSpeechRecognition?: any
}

declare const window: IWindow

// --- TTS (音声合成: Text-to-Speech) ---

let cachedVoices: SpeechSynthesisVoice[] = []

/**
 * 利用可能な音声一覧を取得（非同期ロード対応）
 */
export function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve([])
      return
    }

    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) {
      cachedVoices = voices
      resolve(voices)
      return
    }

    // 初回ロード待ち
    const handleVoicesChanged = () => {
      cachedVoices = window.speechSynthesis.getVoices()
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
      resolve(cachedVoices)
    }

    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
    // タイムアウトフォールバック
    setTimeout(() => {
      resolve(window.speechSynthesis.getVoices())
    }, 500)
  })
}

/**
 * 中国語に対応した音声一覧を取得
 */
export function getChineseVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return []
  }
  const voices = cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices()
  cachedVoices = voices

  return voices.filter(
    (v) =>
      v.lang.toLowerCase().startsWith('zh') ||
      v.lang.toLowerCase().includes('cmn') ||
      v.lang.toLowerCase().includes('chinese')
  )
}

/**
 * 声質設定 (Voice) に合致する SpeechSynthesisVoice を選択
 */
function findMatchingVoice(chineseVoices: SpeechSynthesisVoice[], voice?: Voice): SpeechSynthesisVoice | null {
  if (chineseVoices.length === 0) return null

  // 1. 指定された名前がある場合
  if (voice?.voiceName) {
    const namedVoice = chineseVoices.find((v) => v.name === voice.voiceName)
    if (namedVoice) return namedVoice
  }

  // 2. 性別 (gender) による絞り込み推測
  if (voice?.gender === 'female') {
    const femaleVoice = chineseVoices.find((v) => {
      const name = v.name.toLowerCase()
      return (
        name.includes('xiaoxiao') ||
        name.includes('tingting') ||
        name.includes('yaoyao') ||
        name.includes('huihui') ||
        name.includes('female') ||
        name.includes('mei-jia') ||
        name.includes('sin-ji')
      )
    })
    if (femaleVoice) return femaleVoice
  } else if (voice?.gender === 'male') {
    const maleVoice = chineseVoices.find((v) => {
      const name = v.name.toLowerCase()
      return (
        name.includes('yunxi') ||
        name.includes('yunjian') ||
        name.includes('kangkang') ||
        name.includes('danny') ||
        name.includes('male') ||
        name.includes('zhiwei')
      )
    })
    if (maleVoice) return maleVoice
  }

  // 3. デフォルト（zh-CN 優先）
  const zhCnVoice = chineseVoices.find((v) => v.lang.toLowerCase().replace('_', '-') === 'zh-cn')
  return zhCnVoice || chineseVoices[0]
}

export interface SpeakOptions {
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: unknown) => void
}

/**
 * 中国語テキストを音声で読み上げる
 */
export function speakChinese(text: string, voice?: Voice, options?: SpeakOptions): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onError?.(new Error('お使いのブラウザは音声合成に対応していません'))
    return
  }

  // 既存の音声を停止
  stopSpeaking()

  if (!text.trim()) return

  // iOS Safari などの対策で少し待機してから発話
  setTimeout(() => {
    try {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'

      // 音声選択
      const chineseVoices = getChineseVoices()
      const matchedVoice = findMatchingVoice(chineseVoices, voice)
      if (matchedVoice) {
        utterance.voice = matchedVoice
      }

      // 速度 (rate) & ピッチ (pitch)
      utterance.rate = voice?.rate ?? 0.95 // 学習用にほんの少しだけゆっくり
      utterance.pitch = voice?.pitch ?? 1.0

      utterance.onstart = () => {
        options?.onStart?.()
      }

      utterance.onend = () => {
        options?.onEnd?.()
      }

      utterance.onerror = (e) => {
        // キャンセルによるエラーは無視
        if (e.error === 'interrupted' || e.error === 'canceled') {
          options?.onEnd?.()
          return
        }
        console.warn('SpeechSynthesis error:', e)
        options?.onError?.(e)
      }

      window.speechSynthesis.speak(utterance)
    } catch (err) {
      console.error('TTS execution error:', err)
      options?.onError?.(err)
    }
  }, 50)
}

/**
 * 現在再生中の音声を停止する
 */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/**
 * 現在音声再生中かどうか
 */
export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false
  }
  return window.speechSynthesis.speaking
}

// --- STT (音声認識: Speech-to-Text) ---

/**
 * 音声認識がブラウザでサポートされているか
 */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export interface SpeechRecognitionController {
  start: () => void
  stop: () => void
  abort: () => void
}

export interface SpeechRecognitionOptions {
  lang?: 'zh-CN' | 'ja-JP'
  onStart?: () => void
  onInterimResult?: (transcript: string) => void
  onFinalResult?: (transcript: string) => void
  onError?: (error: string) => void
  onEnd?: () => void
}

/**
 * 音声認識セッションの作成
 */
export function createSpeechRecognizer(options: SpeechRecognitionOptions): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) return null

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new SpeechRecognitionAPI()

  recognition.lang = options.lang || 'zh-CN'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.maxAlternatives = 1

  let finalTranscript = ''

  recognition.onstart = () => {
    finalTranscript = ''
    options.onStart?.()
  }

  recognition.onresult = (event: any) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const item = event.results[i]
      if (item.isFinal) {
        finalTranscript += item[0].transcript
      } else {
        interim += item[0].transcript
      }
    }

    if (interim) {
      options.onInterimResult?.(interim)
    }
    if (finalTranscript) {
      options.onFinalResult?.(finalTranscript)
    }
  }

  recognition.onerror = (event: any) => {
    let message = '音声認識エラーが発生しました'
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      message = 'マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。'
    } else if (event.error === 'no-speech') {
      message = '音声が検出されませんでした'
    } else if (event.error === 'network') {
      message = '音声認識のネットワーク通信エラーが発生しました'
    }
    options.onError?.(message)
  }

  recognition.onend = () => {
    options.onEnd?.()
  }

  return {
    start: () => {
      try {
        recognition.start()
      } catch (err) {
        console.warn('SpeechRecognition start error:', err)
      }
    },
    stop: () => {
      try {
        recognition.stop()
      } catch (err) {
        // ignore
      }
    },
    abort: () => {
      try {
        recognition.abort()
      } catch (err) {
        // ignore
      }
    },
  }
}
