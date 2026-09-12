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

import { loadTtsProvider, loadTtsModel } from './storage'
import { loadUsableApiKey, markApiKeyExhausted } from './openRouterKey'
import { resolveEffectiveVoice } from './freeMode'
import { responseToPlayableBlob } from './audioFormat'

// 再生中のオーディオオブジェクト
let currentAudio: HTMLAudioElement | null = null
let playbackGeneration = 0
// 生成済み音声Blobのメモリキャッシュ (key: model_voice_speed_text -> objectUrl)
const audioBlobCache = new Map<string, string>()

/**
 * 読み上げを文単位に割る。
 *
 * 文章全体の音声ができるまで待つと、最初の一声が出るまでが長い。
 * 1文目を鳴らしながら2文目を作れば、待ち時間は1文ぶんで済む。
 *
 * 句読点は直前の文に含める。短すぎる断片は次の文へ寄せる
 * （「是吗？」だけで1リクエストを使うと、かえって間延びするため）。
 */
export const MIN_SPEECH_SEGMENT_CHARS = 12
export const MAX_SPEECH_SEGMENTS = 8

export function splitIntoSpeechSegments(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  // 句点類のうしろで切る。閉じ引用符が続く場合はそれも含める。
  const rawParts = trimmed.match(/[^。．.！!？?；;\n]+[。．.！!？?；;]*["”』」]?\s*/g)
  if (!rawParts) return [trimmed]

  const merged: string[] = []
  for (const part of rawParts) {
    const piece = part.trim()
    if (!piece) continue
    const previous = merged[merged.length - 1]
    // 短い断片は前の文にくっつける。単独で投げると間延びする。
    if (previous !== undefined && Array.from(previous).length < MIN_SPEECH_SEGMENT_CHARS) {
      merged[merged.length - 1] = previous + piece
    } else {
      merged.push(piece)
    }
  }

  if (merged.length === 0) return [trimmed]
  // 末尾が短すぎる場合も前へ寄せる。
  if (merged.length > 1 && Array.from(merged[merged.length - 1]).length < MIN_SPEECH_SEGMENT_CHARS) {
    const tail = merged.pop() as string
    merged[merged.length - 1] += tail
  }
  // 分割しすぎるとリクエストが増えるだけなので、残りは最後にまとめる。
  if (merged.length > MAX_SPEECH_SEGMENTS) {
    const rest = merged.splice(MAX_SPEECH_SEGMENTS - 1)
    merged.push(rest.join(''))
  }
  return merged
}

/** 声の指定から、TTSリクエストに載せるモデル・話者・速度を決める。 */
function resolveTtsRequest(text: string, voice?: Voice) {
  const ttsModel = voice?.ttsModel || loadTtsModel()
  const isMale =
    voice?.gender === 'male' ||
    (voice?.voiceModel &&
      (voice.voiceModel.includes('john') ||
        voice.voiceModel.includes('yun') ||
        voice.voiceModel.includes('male') ||
        voice.voiceModel.includes('onyx') ||
        voice.voiceModel.includes('echo')))

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
  const tuning = voice?.voiceTuning
  // 声の調整値が変われば別の音声になるため、キャッシュキーにも含める。
  const tuningKey = tuning ? JSON.stringify(tuning) : ''
  return {
    ttsModel,
    voiceModel,
    speed,
    tuning,
    cacheKey: `${ttsModel}_${voiceModel}_${speed}_${tuningKey}_${text}`,
  }
}

/**
 * 1文ぶんの音声を取得する。取得済みならキャッシュを返す。
 * apiKey が空なら無料モードとして送り、Worker が所有者キーで無料モデルを代行する。
 */
async function fetchSegmentAudioUrl(text: string, voice: Voice | undefined, apiKey: string): Promise<string | undefined> {
  const { ttsModel, voiceModel, speed, tuning, cacheKey } = resolveTtsRequest(text, voice)
  const cached = audioBlobCache.get(cacheKey)
  if (cached) return cached

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: JSON.stringify({
      text,
      model: ttsModel,
      voice: voiceModel,
      speed,
      tuning,
      ...(apiKey ? { apiKey } : {}),
    }),
  })

  if (!res.ok) {
    console.warn('OpenRouter TTS API error, request failed:', res.status)
    // 残高切れ。以後は無料モードで鳴らす。
    if (res.status === 402 && apiKey) markApiKeyExhausted()
    return undefined
  }

  // PCMのみ返すモデル(Gemini TTSなど)は再生できる形式へ変換する。
  const blob = await responseToPlayableBlob(res)
  const audioUrl = URL.createObjectURL(blob)
  audioBlobCache.set(cacheKey, audioUrl)
  return audioUrl
}

/**
 * 1文ぶんを再生し、鳴り終わるまで待つ。
 * 停止されたか最後まで鳴ったかを返し、呼び出し側が次の文へ進むか決める。
 */
function playSegment(
  audioUrl: string,
  generation: number,
  onStart?: () => void
): Promise<'ended' | 'stopped' | 'error'> {
  return new Promise((resolve) => {
    if (generation !== playbackGeneration) {
      resolve('stopped')
      return
    }
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }

    const audio = new Audio(audioUrl)
    currentAudio = audio

    audio.onplay = () => onStart?.()
    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null
      resolve(generation === playbackGeneration ? 'ended' : 'stopped')
    }
    audio.onerror = (event) => {
      if (currentAudio === audio) currentAudio = null
      console.warn('Audio playback error:', event)
      resolve(generation === playbackGeneration ? 'error' : 'stopped')
    }

    audio.play().catch((error) => {
      if (currentAudio === audio) currentAudio = null
      console.warn('Audio play rejected:', error)
      resolve(generation === playbackGeneration ? 'error' : 'stopped')
    })
  })
}

/**
 * OpenRouter TTS API経由で音声を合成・再生する。
 *
 * 文単位に割り、1文目を鳴らしている間に次の文を作る。
 * 最初の一声が出るまでの時間が、文章全体ぶんから1文ぶんに縮む。
 */
async function speakWithOpenRouterTts(
  text: string,
  voice: Voice | undefined,
  apiKey: string,
  options?: SpeakOptions
): Promise<boolean> {
  const generation = playbackGeneration

  const segments = splitIntoSpeechSegments(text)
  if (segments.length === 0) return false

  try {
    // 次の文の取得は、いまの文を鳴らし始めてから走らせる。
    let pending: Promise<string | undefined> | undefined = fetchSegmentAudioUrl(segments[0], voice, apiKey)

    for (let index = 0; index < segments.length; index += 1) {
      const audioUrl = await pending
      if (generation !== playbackGeneration) return true
      if (!audioUrl) {
        // 1文目が取れなければ、そもそも鳴らせないので失敗として返す。
        if (index === 0) return false
        options?.onError?.(new Error('音声の続きを取得できませんでした。'))
        return true
      }

      pending =
        index + 1 < segments.length
          ? fetchSegmentAudioUrl(segments[index + 1], voice, apiKey).catch(() => undefined)
          : undefined

      const result = await playSegment(audioUrl, generation, index === 0 ? options?.onStart : undefined)
      if (result === 'stopped') return true
      if (result === 'error') {
        options?.onError?.(new Error('音声を再生できませんでした。'))
        return true
      }
    }

    if (generation === playbackGeneration) options?.onEnd?.()
    return true
  } catch (err) {
    console.warn('OpenRouter TTS execution error:', err)
    return false
  }
}

/**
 * 中国語テキストを音声で読み上げる（ハイブリッド対応）
 */
export function speakChinese(text: string, savedVoice?: Voice, options?: SpeakOptions): void {
  // 既存の音声をすべて停止
  stopSpeaking()
  const generation = playbackGeneration

  if (!text.trim()) return

  // 使えるキーが無ければ無料モードの声に差し替える（保存された設定は変えない）。
  const apiKey = loadUsableApiKey()
  const globalProvider = loadTtsProvider('openrouter')
  const voice = resolveEffectiveVoice(savedVoice, {
    hasApiKey: Boolean(apiKey),
    globalProvider,
    globalModel: loadTtsModel(),
  })
  const effectiveProvider = voice?.ttsProvider || globalProvider

  if (effectiveProvider === 'openrouter') {
    speakWithOpenRouterTts(text, voice, apiKey, options).then((success) => {
      if (!success && generation === playbackGeneration) {
        options?.onError?.(
          new Error(
            apiKey
              ? 'AI音声を再生できません。APIキー・残高・音声モデルを確認してください。'
              : '無料の AI 音声が混み合っています。少し待ってからもう一度お試しください。'
          )
        )
      }
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
  /** 無音がこの時間続いたときだけ認識を止める */
  silenceTimeoutMs?: number
  onStart?: () => void
  onInterimResult?: (transcript: string) => void
  onFinalResult?: (transcript: string) => void
  /**
   * 無音の持ち時間が始まった／リセットされた／消えたときの通知。
   * deadline は「この時刻に無音タイムアウトへ到達する」絶対時刻(ms)。null は計測なし。
   * 残り時間の可視化（カウントダウン表示）に使う。
   */
  onSilenceWindowChange?: (deadline: number | null) => void
  /** 無音タイムアウトに到達した瞬間。認識が止まる直前に呼ばれる。 */
  onSilenceTimeout?: () => void
  onError?: (error: string) => void
  onEnd?: () => void
}

/**
 * 考え込んでいる間に打ち切られないための無音許容時間。
 * ブラウザ既定の打ち切り（1〜2秒程度）より十分長く取る。
 */
export const DEFAULT_SILENCE_TIMEOUT_MS = 7000

/** 無音許容時間としてユーザーが選べる範囲 */
export const MIN_SILENCE_TIMEOUT_MS = 2000
export const MAX_SILENCE_TIMEOUT_MS = 20000

/** 設定値を許容範囲（0.5秒刻み）に丸める */
export function clampSilenceTimeoutMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SILENCE_TIMEOUT_MS
  const rounded = Math.round(value / 500) * 500
  return Math.min(MAX_SILENCE_TIMEOUT_MS, Math.max(MIN_SILENCE_TIMEOUT_MS, rounded))
}

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
 *
 * 開き直すときは認識インスタンスを必ず作り直す。同じインスタンスを再利用すると
 * 前のセッションの結果が results に残るブラウザがあり、蓄積済みテキストと
 * 二重に足されて「同じ発話が2回入る」原因になる。
 */
export function createSpeechRecognizer(options: SpeechRecognitionOptions): SpeechRecognitionController | null {
  if (!isSpeechRecognitionSupported()) return null

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognitionAPI) return null

  const silenceTimeoutMs = clampSilenceTimeoutMs(options.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS)
  const lang = options.lang || 'zh-CN'
  // 短い沈黙で確定させないため、既定は継続リスニング
  const continuous = options.continuous ?? true

  let aborted = false
  // 明示的な停止・無音タイムアウト・致命的エラーで立てる。立つまでは自動で開き直す。
  let finished = false
  // 内部再開より前に確定したテキスト
  let committedFinal = ''
  let previousFinal = ''
  let previousInterim = ''
  // 動いている実体は常にひとつだけ。古い実体からの通知はすべて捨てる。
  let active: RecognitionInstance | null = null

  let silenceTimeout: ReturnType<typeof setTimeout> | null = null
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  const clearRestartTimer = () => {
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
  }

  const clearTimers = () => {
    if (silenceTimeout) {
      clearTimeout(silenceTimeout)
      silenceTimeout = null
      options.onSilenceWindowChange?.(null)
    }
    clearRestartTimer()
  }

  const finish = () => {
    clearTimers()
    active = null
    if (!aborted) options.onEnd?.()
  }

  const startSilenceTimer = () => {
    if (silenceTimeout) clearTimeout(silenceTimeout)
    // 声が入るたびに持ち時間を巻き戻す。残り時間は画面側でカウントダウン表示する。
    options.onSilenceWindowChange?.(Date.now() + silenceTimeoutMs)
    silenceTimeout = setTimeout(() => {
      silenceTimeout = null
      finished = true
      // 再開待ちのタイマーを消しておかないと、閉じたはずのマイクが開き直してしまう。
      clearRestartTimer()
      options.onSilenceWindowChange?.(null)
      // 停止より先に通知する。ハンズフリーの自動送信はここを合図にする。
      options.onSilenceTimeout?.()
      if (aborted) return
      const running = active
      // セッションの切れ目なら stop() を受け取る実体がない。そのまま終わりを伝える。
      if (!running) {
        finish()
        return
      }
      try {
        running.stop()
      } catch {
        finish()
      }
    }, silenceTimeoutMs)
  }

  const createInstance = (): RecognitionInstance => {
    const recognition = new SpeechRecognitionAPI()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = continuous
    recognition.maxAlternatives = 1

    // 開き直しの前後で通知が重なっても、いま動いている実体の分だけを受け取る。
    const isStale = () => aborted || recognition !== active

    recognition.onstart = () => {
      if (isStale()) return
      // 内部再開のときは無音の持ち時間を延長しない
      if (!silenceTimeout && !finished) startSilenceTimer()
      options.onStart?.()
    }

    recognition.onresult = (event: RecognitionResultEvent) => {
      if (isStale()) return
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
      if (isStale()) return
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

    recognition.onend = () => {
      if (isStale()) return
      // この実体はもう終わり。以降この実体からの通知は受け取らない。
      active = null

      if (finished) {
        finish()
        return
      }

      // ブラウザ都合の終了。確定済みを引き継いでマイクを開き直す。
      committedFinal = previousFinal
      if (previousInterim !== '') {
        previousInterim = ''
        options.onInterimResult?.('')
      }
      clearRestartTimer()
      restartTimer = setTimeout(() => {
        restartTimer = null
        if (aborted || finished) return
        try {
          const next = createInstance()
          active = next
          next.start()
        } catch (err) {
          console.warn('SpeechRecognition restart error:', err)
          finished = true
          finish()
        }
      }, AUTO_RESTART_DELAY_MS)
    }

    return recognition
  }

  return {
    start: () => {
      // 二重起動すると認識が二重に届く。動いている間の start は無視する。
      if (active && !aborted) return
      aborted = false
      finished = false
      committedFinal = ''
      previousFinal = ''
      previousInterim = ''
      clearTimers()
      try {
        const next = createInstance()
        active = next
        next.start()
      } catch (err) {
        console.warn('SpeechRecognition start error:', err)
        active = null
      }
    },
    stop: () => {
      finished = true
      clearRestartTimer()
      const running = active
      if (!running) {
        finish()
        return
      }
      try {
        running.stop()
      } catch {
        finish()
      }
    },
    abort: () => {
      aborted = true
      finished = true
      clearTimers()
      const running = active
      active = null
      if (!running) return
      try {
        running.abort()
      } catch {
        // ignore
      }
    },
  }
}
