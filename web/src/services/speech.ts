/**
 * Web Speech API を活用した中国語 TTS（音声合成）および STT（音声認識）サービス
 * 用語定義書.md および 要件定義書.md に準拠
 */

import type { Voice } from '../types'

interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
interface RecognitionInstance {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

// Web Speech API の型拡張（ブラウザ間の差異吸収）
interface IWindow extends Window {
  SpeechRecognition?: new () => RecognitionInstance
  webkitSpeechRecognition?: new () => RecognitionInstance
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
    (/\bmale\b/.test(name)) ||
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

import { loadApiKey, loadTtsProvider, loadTtsModel } from './storage'
import { responseToPlayableBlob } from './audioFormat'

// 再生中のオーディオオブジェクト
let currentAudio: HTMLAudioElement | null = null
let playbackGeneration = 0
// 生成済み音声Blobのメモリキャッシュ (key: model_voice_speed_text -> objectUrl)
const audioBlobCache = new Map<string, string>()

/**
 * OpenRouter TTS API経由で音声を合成・再生する
 */
async function speakWithOpenRouterTts(
  text: string,
  voice?: Voice,
  options?: SpeakOptions
): Promise<boolean> {
  const generation = playbackGeneration
  const apiKey = loadApiKey()
  if (!apiKey) return false

  const ttsModel = voice?.ttsModel || loadTtsModel()
  const isMale = voice?.gender === 'male' || (voice?.voiceModel && (voice.voiceModel.includes('john') || voice.voiceModel.includes('yun') || voice.voiceModel.includes('male') || voice.voiceModel.includes('onyx') || voice.voiceModel.includes('echo')))

  let voiceModel = voice?.voiceModel || ''

  // 話者が未指定のときだけ、モデルごとの既定話者に寄せる。
  // 明示的に選ばれた話者はそのまま送り、そのモデルに無い場合はWorkerがカタログで解決する。
  if (!voiceModel) {
    if (ttsModel.includes('kokoro')) {
      voiceModel = isMale ? 'zm_yunxi' : 'zf_xiaoxiao'
    } else if (ttsModel.includes('qwen')) {
      if (ttsModel.includes('plus')) voiceModel = isMale ? 'longanlufeng' : 'longanlingxin'
      else voiceModel = isMale ? 'loongjohn' : 'longanhuan_v3.6'
    }
  }

  const speed = voice?.rate ?? 1.0
  // 声の調整値が変われば別の音声になるため、キャッシュキーにも含める。
  const tuning = voice?.voiceTuning
  const tuningKey = tuning ? JSON.stringify(tuning) : ''
  const cacheKey = `${ttsModel}_${voiceModel}_${speed}_${tuningKey}_${text}`

  try {
    let audioUrl = audioBlobCache.get(cacheKey)

    if (!audioUrl) {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model: ttsModel,
          voice: voiceModel,
          speed,
          tuning,
          apiKey,
        }),
      })

      if (!res.ok) {
        console.warn('OpenRouter TTS API error, request failed:', res.status)
        return false
      }

      // PCMのみ返すモデル(Gemini TTSなど)は再生できる形式へ変換する。
      const blob = await responseToPlayableBlob(res)
      audioUrl = URL.createObjectURL(blob)
      audioBlobCache.set(cacheKey, audioUrl)
    }

    if (generation !== playbackGeneration) return true
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }

    const audio = new Audio(audioUrl)
    currentAudio = audio

    audio.onplay = () => {
      options?.onStart?.()
    }

    audio.onended = () => {
      currentAudio = null
      options?.onEnd?.()
    }

    audio.onerror = (e) => {
      currentAudio = null
      console.warn('Audio playback error:', e)
      options?.onError?.(e)
    }

    await audio.play()
    return true
  } catch (err) {
    console.warn('OpenRouter TTS execution error:', err)
    return false
  }
}

/**
 * 中国語テキストを音声で読み上げる（ハイブリッド対応）
 */
export function speakChinese(text: string, voice?: Voice, options?: SpeakOptions): void {
  // 既存の音声をすべて停止
  stopSpeaking()
  const generation = playbackGeneration

  if (!text.trim()) return

  const effectiveProvider = voice?.ttsProvider || loadTtsProvider('openrouter')
  const hasApiKey = Boolean(loadApiKey())

  if (effectiveProvider === 'openrouter') {
    if (!hasApiKey) {
      options?.onError?.(new Error('AI音声にはOpenRouter APIキーが必要です。'))
      return
    }
    speakWithOpenRouterTts(text, voice, options).then((success) => {
      if (!success && generation === playbackGeneration) options?.onError?.(new Error('AI音声を再生できません。APIキー・残高・音声モデルを確認してください。'))
    })
    return
  }

  // 2. それ以外はブラウザ標準 Web Speech API で発話
  speakWithBrowserTts(text, voice, options)
}

/**
 * ブラウザ標準の Web Speech API による中国語発話
 */
function speakWithBrowserTts(text: string, voice?: Voice, options?: SpeakOptions): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onError?.(new Error('お使いのブラウザは音声合成に対応していません'))
    return
  }

  // Chrome等のキュー詰まり・一時停止状態を解除
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume()
  }

  // iOS Safari や Chrome 対策で少し待機してから発話
  const generation = playbackGeneration
  setTimeout(() => {
    if (generation !== playbackGeneration) return
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
      let resumeWatchTimer: ReturnType<typeof setTimeout> | null = null

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
  playbackGeneration++
  // オーディオ要素の停止
  if (currentAudio) {
    try {
      currentAudio.pause()
      currentAudio.currentTime = 0
    } catch {
      // ignore
    }
    currentAudio = null
  }

  // Web Speech API の停止
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
  if (currentAudio && !currentAudio.paused) {
    return true
  }
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
  continuous?: boolean
  /** 無音がこの時間続いたときだけ自動停止する（※送信は行わない） */
  silenceTimeoutMs?: number
  onStart?: () => void
  onInterimResult?: (transcript: string) => void
  onFinalResult?: (transcript: string) => void
  onError?: (error: string) => void
  onEnd?: () => void
}

/**
 * 考え込んでいる間に打ち切られないための無音許容時間。
 * ブラウザ既定の打ち切り（1〜2秒程度）より十分長く取る。
 */
export const DEFAULT_SILENCE_TIMEOUT_MS = 20000

/** ブラウザが勝手に認識を終えたあと、開き直すまでの待ち時間 */
const AUTO_RESTART_DELAY_MS = 250

/** 内部再開をまたいで認識テキストをつなぐ。英数字同士のときだけ空白を補う。 */
function joinTranscript(head: string, tail: string): string {
  if (!head) return tail
  if (!tail) return head
  const needsSpace = /[a-zA-Z0-9]$/.test(head) && /^[a-zA-Z0-9]/.test(tail)
  return needsSpace ? `${head} ${tail}` : `${head}${tail}`
}

/**
 * 音声認識セッションの作成（継続リスニング対応）
 *
 * ブラウザは短い沈黙でも認識セッションを終了してしまうため、
 * 無音タイムアウトに達するまでは内部で自動的に開き直し、
 * 確定テキストはセッションをまたいで蓄積する。
 */
export function createSpeechRecognizer(options: SpeechRecognitionOptions): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) return null

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognitionAPI) return null
  const recognition = new SpeechRecognitionAPI()
  const silenceTimeoutMs = options.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS
  let aborted = false
  // 明示的な停止・無音タイムアウト・致命的エラーで立てる。立つまでは自動で開き直す。
  let finished = false
  // 内部再開より前に確定したテキスト
  let committedFinal = ''
  let previousFinal = ''
  let previousInterim = ''

  recognition.lang = options.lang || 'zh-CN'
  recognition.interimResults = true
  // 短い沈黙で確定させないため、既定は継続リスニング
  recognition.continuous = options.continuous ?? true
  recognition.maxAlternatives = 1

  let silenceTimeout: ReturnType<typeof setTimeout> | null = null
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimers = () => {
    if (silenceTimeout) {
      clearTimeout(silenceTimeout)
      silenceTimeout = null
    }
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
  }

  const startSilenceTimer = () => {
    if (silenceTimeout) clearTimeout(silenceTimeout)
    // 完全な無音が続いたときだけ安全のために自動停止（※送信は行わない）
    silenceTimeout = setTimeout(() => {
      silenceTimeout = null
      finished = true
      try {
        recognition.stop()
      } catch {
        // ignore
      }
    }, silenceTimeoutMs)
  }

  recognition.onstart = () => {
    if (aborted) return
    // 内部再開のときは無音の持ち時間を延長しない
    if (!silenceTimeout) startSilenceTimer()
    options.onStart?.()
  }

  recognition.onresult = (event: RecognitionResultEvent) => {
    if (aborted) return
    startSilenceTimer()
    // results is a session snapshot. A repeated final index must replace,
    // never append to, the previously displayed recognition text.
    let final = ''
    let interim = ''
    for (let i = 0; i < event.results.length; i++) {
      const item = event.results[i]
      if (item.isFinal) final += item[0].transcript
      else interim += item[0].transcript
    }
    const normalizedFinal = joinTranscript(committedFinal, final.trim())
    if (normalizedFinal !== previousFinal) {
      previousFinal = normalizedFinal
      options.onFinalResult?.(normalizedFinal)
    }
    if (interim !== previousInterim) {
      previousInterim = interim
      options.onInterimResult?.(interim)
    }
  }

  recognition.onerror = (event: { error: string }) => {
    if (aborted) return
    // 一時的な無音・中断は打ち切らず、onend 側の自動再開に任せる
    if (event.error === 'no-speech' || event.error === 'aborted') return

    finished = true
    clearTimers()
    let message = '音声認識エラーが発生しました'
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      message = 'マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください。'
    } else if (event.error === 'network') {
      message = '音声認識のネットワーク通信エラーが発生しました'
    }
    options.onError?.(message)
  }

  const finish = () => {
    clearTimers()
    if (!aborted) options.onEnd?.()
  }

  recognition.onend = () => {
    if (aborted) return

    if (!finished) {
      // ブラウザ都合の終了。確定済みを引き継いでマイクを開き直す。
      committedFinal = previousFinal
      if (previousInterim !== '') {
        previousInterim = ''
        options.onInterimResult?.('')
      }
      if (restartTimer) clearTimeout(restartTimer)
      restartTimer = setTimeout(() => {
        restartTimer = null
        try {
          recognition.start()
        } catch (err) {
          console.warn('SpeechRecognition restart error:', err)
          finished = true
          finish()
        }
      }, AUTO_RESTART_DELAY_MS)
      return
    }

    finish()
  }

  return {
    start: () => {
      try {
        aborted = false
        finished = false
        committedFinal = ''
        previousFinal = ''
        previousInterim = ''
        recognition.start()
      } catch (err) {
        console.warn('SpeechRecognition start error:', err)
      }
    },
    stop: () => {
      finished = true
      if (restartTimer) {
        clearTimeout(restartTimer)
        restartTimer = null
      }
      try {
        recognition.stop()
      } catch {
        // ignore
      }
    },
    abort: () => {
      aborted = true
      finished = true
      clearTimers()
      try {
        recognition.abort()
      } catch {
        // ignore
      }
    },
  }
}
