/**
 * 中国語 TTS（Fish Audio、OpenRouter 経由）と STT（ブラウザの Web Speech API）のサービス
 * 用語定義書.md および 要件定義書.md に準拠
 */

import type { Voice } from '../types'
import { FIXED_TTS_MODEL, clampVoicePitch } from '../data/fishVoice'
import { loadUsableApiKey, markApiKeyExhausted } from './openRouterKey'
import { responseToPlayableBlob } from './audioFormat'

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

export interface SpeakOptions {
  onStart?: () => void
  onEnd?: () => void
  onError?: (err: unknown) => void
}

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

/**
 * 声の高さを再生側で作るための値。
 *
 * Fish Audio にはピッチの指定が無い。そこで再生速度（playbackRate）を pitch 倍にして音程を上げ下げし、
 * preservesPitch を切って音程が速度に追随するようにする。速度も pitch 倍になってしまうので、
 * Fish に頼む speed を rate / pitch にして打ち消し、聞こえる速さは rate のままにする。
 */
export function resolvePitchPlayback(voice: Pick<Voice, 'rate' | 'pitch'>): {
  requestSpeed: number
  playbackRate: number
} {
  const rate = voice.rate ?? 1.0
  const pitch = clampVoicePitch(voice.pitch)
  return {
    requestSpeed: Math.round((rate / pitch) * 1000) / 1000,
    playbackRate: pitch,
  }
}

/** 声の指定から、TTSリクエストに載せる話者・速度を決める。モデルは Fish に固定。 */
function resolveTtsRequest(text: string, voice: Voice) {
  const { requestSpeed, playbackRate } = resolvePitchPlayback(voice)
  const tuning = voice.voiceTuning
  // 声の調整値が変われば別の音声になるため、キャッシュキーにも含める。
  const tuningKey = tuning ? JSON.stringify(tuning) : ''
  return {
    ttsModel: FIXED_TTS_MODEL,
    voiceModel: voice.voiceModel,
    speed: requestSpeed,
    playbackRate,
    tuning,
    cacheKey: `${FIXED_TTS_MODEL}_${voice.voiceModel}_${requestSpeed}_${tuningKey}_${text}`,
  }
}

/**
 * 1文ぶんの音声を取得する。取得済みならキャッシュを返す。
 */
async function fetchSegmentAudioUrl(text: string, voice: Voice, apiKey: string): Promise<string | undefined> {
  const { ttsModel, voiceModel, speed, tuning, cacheKey } = resolveTtsRequest(text, voice)
  const cached = audioBlobCache.get(cacheKey)
  if (cached) return cached

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
    // 残高切れ。以後はキーの状態を「残高切れ」にして送らない。
    if (res.status === 402) markApiKeyExhausted()
    return undefined
  }

  // PCMのみ返すモデル(Gemini TTSなど)は再生できる形式へ変換する。
  const blob = await responseToPlayableBlob(res)
  const audioUrl = URL.createObjectURL(blob)
  audioBlobCache.set(cacheKey, audioUrl)
  return audioUrl
}

/** Safari は preservesPitch を接頭辞つきで持つ。 */
interface PitchControlledAudio extends HTMLAudioElement {
  webkitPreservesPitch?: boolean
}

/** 再生速度で音程を変える。1.0 なら何もしない（ブラウザ既定のまま）。 */
function applyPlaybackPitch(audio: HTMLAudioElement, playbackRate: number): void {
  if (playbackRate === 1) return
  const target = audio as PitchControlledAudio
  target.preservesPitch = false
  if ('webkitPreservesPitch' in target) target.webkitPreservesPitch = false
  target.playbackRate = playbackRate
}

/**
 * 1文ぶんを再生し、鳴り終わるまで待つ。
 * 停止されたか最後まで鳴ったかを返し、呼び出し側が次の文へ進むか決める。
 */
function playSegment(
  audioUrl: string,
  generation: number,
  playbackRate: number,
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
    applyPlaybackPitch(audio, playbackRate)

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
  voice: Voice,
  apiKey: string,
  options?: SpeakOptions
): Promise<boolean> {
  const generation = playbackGeneration

  const segments = splitIntoSpeechSegments(text)
  if (segments.length === 0) return false
  const { playbackRate } = resolvePitchPlayback(voice)

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

      const result = await playSegment(audioUrl, generation, playbackRate, index === 0 ? options?.onStart : undefined)
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
 * 中国語テキストを Fish Audio の声で読み上げる。
 *
 * 使えるキーが無いときと話者IDが無いときは送らずにエラーを返す。
 * 呼び出し側はキー無しならキー入力を促し、話者ID無しなら設定漏れとして見せる。
 */
export function speakChinese(text: string, voice?: Voice, options?: SpeakOptions): void {
  // 既存の音声をすべて停止
  stopSpeaking()
  const generation = playbackGeneration

  if (!text.trim()) return

  const apiKey = loadUsableApiKey()
  if (!apiKey) {
    options?.onError?.(new Error(NO_API_KEY_MESSAGE))
    return
  }
  if (!voice || !voice.voiceModel) {
    options?.onError?.(new Error(NO_VOICE_MESSAGE))
    return
  }

  speakWithOpenRouterTts(text, voice, apiKey, options).then((success) => {
    if (!success && generation === playbackGeneration) {
      options?.onError?.(new Error('AI音声を再生できません。APIキーと残高を確認してください。'))
    }
  })
}

/** キーが無くて読み上げを送らなかったときの文言。呼び出し側がキー入力への導線に使う。 */
export const NO_API_KEY_MESSAGE = '読み上げには OpenRouter API キーが必要です。'
/** 話者IDが無い友達を読み上げようとしたときの文言。 */
export const NO_VOICE_MESSAGE = 'この友達の声はまだ設定されていません。'

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
}

/**
 * 現在音声再生中かどうか
 */
export function isSpeaking(): boolean {
  return Boolean(currentAudio && !currentAudio.paused)
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
