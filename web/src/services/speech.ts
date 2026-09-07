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
 * 声質が男性向け音声かどうかを判定
 */
export function isKnownMaleVoice(v?: SpeechSynthesisVoice | null): boolean {
  if (!v) return false
  const name = v.name.toLowerCase()
  return (
    name.includes('yunxi') ||
    name.includes('yunjian') ||
    name.includes('yunyang') ||
    name.includes('kangkang') ||
    name.includes('danny') ||
    name.includes('zhiwei') ||
    name.includes('wanlung') ||
    name.includes('male') ||
    name.includes('brian') ||
    name.includes('george')
  )
}

/**
 * 声質が女性向け音声かどうかを判定
 */
export function isKnownFemaleVoice(v?: SpeechSynthesisVoice | null): boolean {
  if (!v) return false
  const name = v.name.toLowerCase()
  return (
    name.includes('xiaoxiao') ||
    name.includes('xiaoyi') ||
    name.includes('yaoyao') ||
    name.includes('huihui') ||
    name.includes('tingting') ||
    name.includes('hanhan') ||
    name.includes('female') ||
    name.includes('mei-jia') ||
    name.includes('sin-ji') ||
    name.includes('google')
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
    const femaleVoice = chineseVoices.find((v) => isKnownFemaleVoice(v))
    if (femaleVoice) return femaleVoice
  } else if (voice?.gender === 'male') {
    const maleVoice = chineseVoices.find((v) => isKnownMaleVoice(v))
    if (maleVoice) return maleVoice
  }

  // 3. 自然音声 (Edge Natural / Online) を優先
  const naturalVoice = chineseVoices.find((v) => v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online'))
  if (naturalVoice) return naturalVoice

  // 4. デフォルト（zh-CN 優先）
  const zhCnVoice = chineseVoices.find((v) => v.lang.toLowerCase().replace('_', '-') === 'zh-cn')
  return zhCnVoice || chineseVoices[0]
}

export interface SpeakOptions {
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: unknown) => void
}

/**
 * ユーザージェスチャー同期コールバック内で呼び出し、
 * ブラウザの音声再生制限（Autoplay Policy）を解除＆キューをクリアしておく
 */
export function unlockSpeechSynthesis(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
    }
    // 極めて短い無音Utteranceを軽く再生してブラウザの音声コンテキストをアクティブにする
    const dummy = new SpeechSynthesisUtterance('')
    dummy.volume = 0
    window.speechSynthesis.speak(dummy)
  } catch {
    // ignore
  }
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

  // Chrome等のキュー詰まり・一時停止状態を解除
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume()
  }

  // iOS Safari や Chrome 対策で少し待機してから発話
  setTimeout(() => {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'

      // 音声選択
      const chineseVoices = getChineseVoices()
      const matchedVoice = findMatchingVoice(chineseVoices, voice)
      if (matchedVoice) {
        utterance.voice = matchedVoice
      }

      // 話す速度 (rate)
      utterance.rate = voice?.rate ?? 0.95

      // ピッチ (pitch): 男性指定で女性音声フォールバック時のピッチ自動補正
      let basePitch = voice?.pitch ?? 1.0
      if (voice?.gender === 'male' && (!matchedVoice || !isKnownMaleVoice(matchedVoice))) {
        // 女性音声で男性キャラを話す場合、ピッチを0.68〜0.72の低音にシフト
        basePitch = Math.min(basePitch * 0.72, 0.72)
      }
      utterance.pitch = Math.max(0.5, Math.min(2.0, basePitch))

      let hasStarted = false
      let resumeWatchTimer: any = null

      utterance.onstart = () => {
        hasStarted = true
        if (resumeWatchTimer) clearTimeout(resumeWatchTimer)
        options?.onStart?.()
      }

      utterance.onend = () => {
        if (resumeWatchTimer) clearTimeout(resumeWatchTimer)
        options?.onEnd?.()
      }

      utterance.onerror = (e) => {
        if (resumeWatchTimer) clearTimeout(resumeWatchTimer)
        // キャンセルや中断によるエラーは正常終了扱い
        if (e.error === 'interrupted' || e.error === 'canceled') {
          options?.onEnd?.()
          return
        }
        console.warn('SpeechSynthesis error:', e)
        options?.onError?.(e)
      }

      window.speechSynthesis.speak(utterance)

      // Chromeの長期サスペンド防止：500ms経過しても未開始かつキューにある場合はresumeをキック
      resumeWatchTimer = setTimeout(() => {
        if (!hasStarted && window.speechSynthesis.speaking) {
          window.speechSynthesis.resume()
        }
      }, 500)
    } catch (err) {
      console.error('TTS execution error:', err)
      options?.onError?.(err)
    }
  }, 60)
}

/**
 * 現在再生中の音声を停止する
 */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume()
    }
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
  onFinalResult?: (transcriptChunk: string) => void
  onError?: (error: string) => void
  onEnd?: () => void
}

/**
 * 音声認識セッションの作成（継続リスニング対応）
 */
export function createSpeechRecognizer(options: SpeechRecognitionOptions): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) return null

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
  const recognition = new SpeechRecognitionAPI()

  recognition.lang = options.lang || 'zh-CN'
  recognition.interimResults = true
  // 息継ぎや数秒の間が空いても自動切断されないよう継続リスニングを有効化
  recognition.continuous = true
  recognition.maxAlternatives = 1

  let silenceTimeout: any = null

  const resetSilenceTimer = () => {
    if (silenceTimeout) clearTimeout(silenceTimeout)
    // 5秒間完全に入力がなければ安全のために自動停止（※送信は行わない）
    silenceTimeout = setTimeout(() => {
      try {
        recognition.stop()
      } catch {
        // ignore
      }
    }, 5000)
  }

  recognition.onstart = () => {
    resetSilenceTimer()
    options.onStart?.()
  }

  recognition.onresult = (event: any) => {
    resetSilenceTimer()

    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const item = event.results[i]
      if (item.isFinal) {
        const finalChunk = item[0].transcript.trim()
        if (finalChunk) {
          options.onFinalResult?.(finalChunk)
        }
      } else {
        interim += item[0].transcript
      }
    }

    if (interim) {
      options.onInterimResult?.(interim)
    }
  }

  recognition.onerror = (event: any) => {
    if (silenceTimeout) clearTimeout(silenceTimeout)
    let message = '音声認識エラーが発生しました'
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      message = 'マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。'
    } else if (event.error === 'no-speech') {
      // no-speechは一時的な無音の場合があるためエラーではなく無視またはマイルドに処理
      return
    } else if (event.error === 'network') {
      message = '音声認識のネットワーク通信エラーが発生しました'
    }
    options.onError?.(message)
  }

  recognition.onend = () => {
    if (silenceTimeout) clearTimeout(silenceTimeout)
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
      if (silenceTimeout) clearTimeout(silenceTimeout)
      try {
        recognition.stop()
      } catch {
        // ignore
      }
    },
    abort: () => {
      if (silenceTimeout) clearTimeout(silenceTimeout)
      try {
        recognition.abort()
      } catch {
        // ignore
      }
    },
  }
}
