import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { SendIcon, MicIcon, StopCircleIcon, ChinaFlagIcon, JapanFlagIcon } from './Icons'
import {
  stopSpeaking,
  clampSilenceTimeoutMs,
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  DEFAULT_SILENCE_TIMEOUT_MS,
  MAX_SILENCE_TIMEOUT_MS,
  type SpeechRecognitionController,
} from '../services/speech'
import {
  isRecordingSupported,
  startRecording,
  type RecorderController,
} from '../services/recorder'
import { transcribeRecording } from '../services/transcription'
import { parseVoiceSendCommand } from '../services/voiceCommand'
import { SilenceCountdownRing } from './SilenceCountdownRing'

interface ChatInputProps {
  onSendMessage: (content: string) => void
  isLoading: boolean
  disabled?: boolean
  speechLang?: 'zh-CN' | 'ja-JP'
  onSpeechLangChange?: (lang: 'zh-CN' | 'ja-JP') => void
  handsFreeEnabled?: boolean
  onHandsFreeChange?: (enabled: boolean) => void
  resumeListeningToken?: number
  isFriendSpeaking?: boolean
  /** 無音がこの時間続いたら認識を終える。ハンズフリーではそのまま自動送信する。 */
  silenceTimeoutMs?: number
  onError?: (message: string) => void
}
type InputMethod = 'text' | 'voice'

const MIN_VOICE_RMS = 0.018
const VOICE_TO_NOISE_RATIO = 2.5

function joinSpeechText(baseText: string, speechText: string): string {
  if (!baseText) return speechText
  if (!speechText) return baseText
  const shouldAddSpace = /[a-zA-Z0-9]$/.test(baseText) && /^[a-zA-Z0-9]/.test(speechText)
  return shouldAddSpace ? `${baseText} ${speechText}` : `${baseText}${speechText}`
}

export function ChatInput({
  onSendMessage,
  isLoading,
  disabled = false,
  speechLang = 'zh-CN',
  onSpeechLangChange,
  handsFreeEnabled = false,
  onHandsFreeChange,
  resumeListeningToken = 0,
  isFriendSpeaking = false,
  silenceTimeoutMs = DEFAULT_SILENCE_TIMEOUT_MS,
  onError,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isPreparingRecording, setIsPreparingRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  // 無音タイムアウトに到達する時刻。カウントダウン表示のためだけに持つ。
  const [silenceDeadline, setSilenceDeadline] = useState<number | null>(null)
  // 話している途中の文字。ブラウザ認識のプレビューで、送信本文（録音→STT）とは別物。
  const [previewFinal, setPreviewFinal] = useState('')
  const [previewInterim, setPreviewInterim] = useState('')
  // プレビューが動かないときの理由。実機で原因を読めるよう状態バーに小さく出す。
  const [previewNote, setPreviewNote] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recorderRef = useRef<RecorderController | null>(null)
  const recordingGenerationRef = useRef(0)
  const recordingBaseTextRef = useRef('')
  const recordingLangRef = useRef<'zh-CN' | 'ja-JP'>(speechLang)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptionAbortRef = useRef<AbortController | null>(null)
  const isStartingRecordingRef = useRef(false)
  const isFinalizingRecordingRef = useRef(false)
  // 録音と並行して走らせるブラウザ認識。表示と「发送」「送信」の合図にだけ使う。
  const previewRecognizerRef = useRef<SpeechRecognitionController | null>(null)
  const previewFinalRef = useRef('')
  // プレビュー側で送信の合図を聞き取ったか。STT の末尾に残った合図を緩めに剥がす根拠にする。
  const previewSendCommandRef = useRef(false)
  const noiseFloorRef = useRef(0.01)
  const heardVoiceRef = useRef(false)
  const textRef = useRef('')
  const handsFreeRef = useRef(handsFreeEnabled)
  const isLoadingRef = useRef(isLoading)
  const disabledRef = useRef(disabled)
  const onSendMessageRef = useRef(onSendMessage)
  const onErrorRef = useRef(onError)
  const inputMethodRef = useRef<InputMethod>('text')
  const restoreTextFocusRef = useRef(false)
  const wasLoadingRef = useRef(isLoading)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [restartListeningToken, setRestartListeningToken] = useState(0)
  const isFriendSpeakingRef = useRef(isFriendSpeaking)
  const wasFriendSpeakingRef = useRef(isFriendSpeaking)
  // 再開はトークンが増えた瞬間だけ行う。isLoading などの再評価では起動させない。
  const consumedResumeTokenRef = useRef(resumeListeningToken)
  const consumedRestartTokenRef = useRef(restartListeningToken)
  // 条件が揃わず見送った再開要求は、破棄せず条件が整うまで保持する。
  const pendingRestartRef = useRef(false)
  // 送信後は App が発行する再開トークンだけを再開の合図として扱う。
  const awaitingResumeRef = useRef(false)
  const silenceTimeoutRef = useRef(clampSilenceTimeoutMs(silenceTimeoutMs))
  // 送信要求から isLoading が立つまでの隙間で二重送信されないようにする。
  // 認識結果が重複して届いても、同じ発話が2回投稿されることはない。
  const sendingRef = useRef(false)

  handsFreeRef.current = handsFreeEnabled
  isLoadingRef.current = isLoading
  disabledRef.current = disabled
  isFriendSpeakingRef.current = isFriendSpeaking
  onSendMessageRef.current = onSendMessage
  onErrorRef.current = onError
  silenceTimeoutRef.current = clampSilenceTimeoutMs(silenceTimeoutMs)

  const isSupported = isRecordingSupported()

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    setSilenceDeadline(null)
  }, [])

  const stopPreview = useCallback(() => {
    previewRecognizerRef.current?.abort()
    previewRecognizerRef.current = null
    previewFinalRef.current = ''
    previewSendCommandRef.current = false
    setPreviewFinal('')
    setPreviewInterim('')
    setPreviewNote('')
  }, [])

  const cancelActiveRecording = useCallback(() => {
    recordingGenerationRef.current += 1
    clearSilenceTimer()
    stopPreview()
    recorderRef.current?.cancel()
    recorderRef.current = null
    transcriptionAbortRef.current?.abort()
    transcriptionAbortRef.current = null
    isStartingRecordingRef.current = false
    isFinalizingRecordingRef.current = false
    setIsPreparingRecording(false)
    setIsTranscribing(false)
    setIsListening(false)
  }, [clearSilenceTimer, stopPreview])

  const sendContent = useCallback((content: string, inputMethod = inputMethodRef.current) => {
    const trimmed = content.trim()
    if (!trimmed || isLoadingRef.current || disabledRef.current || sendingRef.current) return
    sendingRef.current = true

    // 送信後の再開は App の再開トークンに一本化する。
    // 保留中の再開要求をここで捨てないと、読み上げが始まる前にマイクが開いてしまう。
    clearRestartTimer()
    pendingRestartRef.current = false
    awaitingResumeRef.current = handsFreeRef.current

    restoreTextFocusRef.current = inputMethod === 'text'
    cancelActiveRecording()
    onSendMessageRef.current(trimmed)
    textRef.current = ''
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [cancelActiveRecording, clearRestartTimer])

  const finishRecording = useCallback(async (sendWhenReady: boolean) => {
    if (isFinalizingRecordingRef.current) return
    const recorder = recorderRef.current
    if (!recorder) return

    const generation = recordingGenerationRef.current
    recorderRef.current = null
    isFinalizingRecordingRef.current = true
    clearSilenceTimer()
    // プレビューは録音と同時に閉じる。STT が空振りしたときの控えとして最後の確定文だけ持ち越す。
    const previewFallback = parseVoiceSendCommand(previewFinalRef.current, recordingLangRef.current).content
    const heardSendCommandInPreview = previewSendCommandRef.current
    stopPreview()
    setIsListening(false)
    setIsTranscribing(true)

    try {
      const recording = await recorder.stop()
      if (generation !== recordingGenerationRef.current) return

      const abortController = new AbortController()
      transcriptionAbortRef.current = abortController
      let finalSpeech = ''
      try {
        finalSpeech = await transcribeRecording(recording, {
          language: recordingLangRef.current,
          signal: abortController.signal,
        })
      } catch (error) {
        // 一括STTが使えなくても、プレビューで確定した文があるならそれで会話を続ける。
        const aborted = error instanceof DOMException && error.name === 'AbortError'
        if (aborted || !previewFallback) throw error
        console.warn('STT failed; falling back to browser recognition preview:', error)
      }
      if (generation !== recordingGenerationRef.current || abortController.signal.aborted) return

      transcriptionAbortRef.current = null
      const parsed = parseVoiceSendCommand(finalSpeech, recordingLangRef.current, {
        lenient: heardSendCommandInPreview,
      })
      const content = parsed.content || previewFallback
      const next = joinSpeechText(recordingBaseTextRef.current, content)
      textRef.current = next
      setText(next)
      setTimeout(handleInput, 10)

      if (sendWhenReady || parsed.hasSendCommand || heardSendCommandInPreview) {
        if (next) {
          sendContent(next, 'voice')
        } else {
          onErrorRef.current?.('音声を聞き取れませんでした。もう一度話しかけてください。')
          if (handsFreeRef.current && !disabledRef.current) {
            setRestartListeningToken((previous) => previous + 1)
          }
        }
      }
    } catch (error) {
      if (generation !== recordingGenerationRef.current) return
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      if (!aborted) {
        onErrorRef.current?.(error instanceof Error ? error.message : '文字起こしに失敗しました。')
        if (handsFreeRef.current) {
          handsFreeRef.current = false
          onHandsFreeChange?.(false)
        }
      }
    } finally {
      if (generation === recordingGenerationRef.current) {
        transcriptionAbortRef.current = null
        isFinalizingRecordingRef.current = false
        setIsTranscribing(false)
      }
    }
  }, [clearSilenceTimer, onHandsFreeChange, sendContent, stopPreview])

  const armSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    const deadline = Date.now() + silenceTimeoutRef.current
    setSilenceDeadline(deadline)
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null
      setSilenceDeadline(null)
      void finishRecording(handsFreeRef.current)
    }, silenceTimeoutRef.current)
  }, [finishRecording])

  /**
   * 録音と並行してブラウザ認識を開く。文字は画面に見せるだけで、送信本文には使わない。
   * 「发送」「送信」を聞き取ったら録音を締める合図にする。
   * 動かない環境や途中で落ちた場合はプレビューを消すだけで、録音はそのまま続く。
   */
  const startPreview = useCallback((
    generation: number,
    lang: 'zh-CN' | 'ja-JP',
    audioTrack: MediaStreamTrack | undefined
  ) => {
    if (previewRecognizerRef.current) return
    if (!isSpeechRecognitionSupported()) {
      setPreviewNote('プレビュー非対応のブラウザ')
      return
    }
    const isStale = () => generation !== recordingGenerationRef.current
    let recognizer: SpeechRecognitionController | null = null
    let heardAnything = false
    recognizer = createSpeechRecognizer({
      lang,
      continuous: true,
      // 発話の終わりは録音側の音量で決める。こちらの無音打ち切りは邪魔にならない長さにする。
      silenceTimeoutMs: MAX_SILENCE_TIMEOUT_MS,
      onInterimResult: (interim) => {
        if (isStale()) return
        heardAnything = true
        setPreviewNote('')
        setPreviewInterim(interim)
      },
      onFinalResult: (final) => {
        if (isStale()) return
        heardAnything = true
        setPreviewNote('')
        previewFinalRef.current = final
        setPreviewFinal(final)
        if (parseVoiceSendCommand(final, lang).hasSendCommand) {
          previewSendCommandRef.current = true
          void finishRecording(true)
        }
      },
      onError: (_message, code) => {
        // プレビューが落ちても録音は続く。文字が見えないだけで済ませ、理由だけ残す。
        if (isStale() || previewRecognizerRef.current !== recognizer) return
        console.warn('Preview recognition error:', code)
        previewRecognizerRef.current = null
        setPreviewInterim('')
        setPreviewNote(`プレビュー停止 (${code})`)
      },
      onEnd: () => {
        if (isStale() || previewRecognizerRef.current !== recognizer) return
        previewRecognizerRef.current = null
        setPreviewInterim('')
        if (!heardAnything) setPreviewNote('プレビュー終了 (結果なし)')
      },
    })
    if (!recognizer) return
    previewRecognizerRef.current = recognizer
    setPreviewNote(audioTrack ? 'プレビュー起動中 (トラック共有)' : 'プレビュー起動中')
    try {
      recognizer.start(audioTrack)
    } catch (error) {
      console.warn('Preview recognition start error:', error)
      previewRecognizerRef.current = null
      setPreviewNote(`プレビュー起動失敗 (${error instanceof Error ? error.name : 'unknown'})`)
    }
  }, [finishRecording])

  const startListening = useCallback(async () => {
    if (
      !isSupported ||
      isLoadingRef.current ||
      disabledRef.current ||
      recorderRef.current ||
      isStartingRecordingRef.current ||
      isFinalizingRecordingRef.current
    ) return

    stopSpeaking()
    pendingRestartRef.current = false
    inputMethodRef.current = 'voice'
    restoreTextFocusRef.current = false
    textareaRef.current?.blur()
    recordingBaseTextRef.current = textRef.current.trim()
    recordingLangRef.current = speechLang
    noiseFloorRef.current = 0.01
    heardVoiceRef.current = false

    const generation = recordingGenerationRef.current + 1
    recordingGenerationRef.current = generation
    isStartingRecordingRef.current = true
    setIsPreparingRecording(true)

    try {
      const recorder = await startRecording({
        onLevel: (level) => {
          if (
            generation !== recordingGenerationRef.current ||
            isFinalizingRecordingRef.current ||
            !recorderRef.current
          ) return
          const threshold = Math.max(MIN_VOICE_RMS, noiseFloorRef.current * VOICE_TO_NOISE_RATIO)
          if (level >= threshold) {
            heardVoiceRef.current = true
            armSilenceTimer()
          } else if (!heardVoiceRef.current) {
            noiseFloorRef.current = noiseFloorRef.current * 0.9 + Math.min(level, 0.05) * 0.1
          }
        },
      })
      if (generation !== recordingGenerationRef.current) {
        recorder.cancel()
        return
      }
      recorderRef.current = recorder
      setIsListening(true)
      armSilenceTimer()
      // 録音が確立してから、同じマイクトラックで開く。プレビューが動かなくても録音は影響を受けない。
      startPreview(generation, speechLang, recorder.audioTrack)
    } catch (error) {
      if (generation !== recordingGenerationRef.current) return
      onErrorRef.current?.(error instanceof Error ? error.message : 'マイクを開始できませんでした。')
      if (handsFreeRef.current) {
        handsFreeRef.current = false
        onHandsFreeChange?.(false)
      }
    } finally {
      if (generation === recordingGenerationRef.current) {
        isStartingRecordingRef.current = false
        setIsPreparingRecording(false)
      }
    }
  }, [armSilenceTimer, isSupported, onHandsFreeChange, speechLang, startPreview])

  useEffect(() => {
    const wasLoading = wasLoadingRef.current
    wasLoadingRef.current = isLoading
    // isLoading が反映されたら、以降は isLoadingRef が二重送信を止める。
    if (isLoading !== wasLoading) sendingRef.current = false
    if (
      wasLoading &&
      !isLoading &&
      restoreTextFocusRef.current &&
      textareaRef.current &&
      !isListening &&
      !isTranscribing &&
      !handsFreeEnabled
    ) {
      restoreTextFocusRef.current = false
      textareaRef.current.focus()
    }
  }, [handsFreeEnabled, isLoading, isListening, isTranscribing])

  // 起動できる状態なら即座に、無理なら保留して条件が整うのを待つ。
  const requestListening = useCallback(() => {
    if (!handsFreeRef.current || disabledRef.current) return
    // 送信後は App の再開トークンが来るまで動かない。
    if (awaitingResumeRef.current) return
    if (isLoadingRef.current || isFriendSpeakingRef.current) {
      pendingRestartRef.current = true
      return
    }
    void startListening()
  }, [startListening])

  // ハンズフリーで空の録音だったときだけ、少し間を置いて録音をやり直す。
  useEffect(() => {
    if (restartListeningToken === consumedRestartTokenRef.current) return
    consumedRestartTokenRef.current = restartListeningToken
    if (!handsFreeEnabled) return
    clearRestartTimer()
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null
      requestListening()
    }, 350)
  }, [clearRestartTimer, handsFreeEnabled, requestListening, restartListeningToken])

  // App からの再開トークン（読み上げ終了・エラー時）による再開。
  useEffect(() => {
    if (resumeListeningToken === consumedResumeTokenRef.current) return
    consumedResumeTokenRef.current = resumeListeningToken
    awaitingResumeRef.current = false
    if (!handsFreeEnabled) return
    requestListening()
  }, [handsFreeEnabled, requestListening, resumeListeningToken])

  // 友達が話し始めたら録音を破棄する。読み上げ音声を自分の発話として拾わせない。
  useEffect(() => {
    const wasSpeaking = wasFriendSpeakingRef.current
    wasFriendSpeakingRef.current = isFriendSpeaking
    if (!isFriendSpeaking || wasSpeaking) return
    if (!recorderRef.current && !isStartingRecordingRef.current && !isFinalizingRecordingRef.current) return
    cancelActiveRecording()
  }, [cancelActiveRecording, isFriendSpeaking])

  // 保留していた再開要求を、返答待ちと読み上げが終わった時点で実行する。
  useEffect(() => {
    if (!pendingRestartRef.current) return
    if (!handsFreeEnabled || isLoading || isFriendSpeaking || awaitingResumeRef.current) return
    pendingRestartRef.current = false
    void startListening()
  }, [handsFreeEnabled, isFriendSpeaking, isLoading, startListening])

  useEffect(() => () => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    cancelActiveRecording()
  }, [cancelActiveRecording])

  const handleSend = () => sendContent(textRef.current)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 日本語・中国語ピンイン等のIME変換中（確定前のEnter）は送信しない
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  const toggleListening = () => {
    if (!isSupported) {
      onError?.('お使いのブラウザはマイク録音に対応していません。')
      return
    }

    if (isListening) {
      if (handsFreeRef.current) {
        handsFreeRef.current = false
        onHandsFreeChange?.(false)
      }
      clearRestartTimer()
      pendingRestartRef.current = false
      awaitingResumeRef.current = false
      void finishRecording(false)
      return
    }
    if (isPreparingRecording || isTranscribing) return
    void startListening()
  }

  const toggleHandsFree = () => {
    if (!isSupported) {
      onError?.('お使いのブラウザはマイク録音に対応していません。')
      return
    }
    const next = !handsFreeRef.current
    handsFreeRef.current = next
    onHandsFreeChange?.(next)
    clearRestartTimer()
    pendingRestartRef.current = false
    awaitingResumeRef.current = false
    if (next) {
      void startListening()
    } else {
      cancelActiveRecording()
    }
  }

  return (
    <div className="chat-input-shell w-full bg-white/95 backdrop-blur-md rounded-2xl p-2 sm:p-3 shadow-md border border-rose-200/80">
      {/* ハンズフリー / 録音・文字起こしの状態 */}
      {(isListening || isPreparingRecording || isTranscribing || handsFreeEnabled) && (
        <div className="mb-2 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl flex flex-col gap-1" aria-live="polite">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-600 min-w-0">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
              </span>
              <span className="flex-shrink-0">
                {isFriendSpeaking
                  ? '友達が話しています...'
                  : isLoading
                    ? '返答を待っています...'
                    : isTranscribing
                      ? '文字起こし中...'
                      : isPreparingRecording
                        ? 'マイクを準備中...'
                        : isListening
                          ? (speechLang === 'zh-CN' ? '中国語で録音中...' : '日本語で録音中...')
                          : 'マイクを再開します...'}
              </span>
            </div>
            {isListening && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <SilenceCountdownRing
                  deadline={silenceDeadline}
                  totalMs={clampSilenceTimeoutMs(silenceTimeoutMs)}
                  mode={handsFreeEnabled ? 'send' : 'stop'}
                />
                {/*
                  無音の使い切りを待たずに送れることが分かるよう、幅に関わらず出す。
                  待ち時間の短縮はこの合図を知っているかどうかで決まるため、
                  主端末であるスマートフォンで隠れていては意味がない。
                */}
                <span className="text-[10px] font-bold text-rose-500 whitespace-nowrap">
                  {`「${speechLang === 'zh-CN' ? '发送' : '送信'}」で送信`}
                </span>
                <button
                  type="button"
                  onClick={() => void finishRecording(handsFreeEnabled)}
                  className="px-2 py-0.5 text-xs bg-white border border-rose-200 text-rose-600 font-bold rounded-md hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  {handsFreeEnabled ? '送信' : '完了'}
                </button>
              </div>
            )}
          </div>
          {/* 話している途中の文字。確認用で、送信されるのは録音の文字起こし結果。 */}
          {isListening && (previewFinal || previewInterim) && (
            <p className="text-xs text-stone-700 leading-snug line-clamp-2 break-words">
              {previewFinal}
              {previewInterim && <span className="text-stone-400">{previewInterim}</span>}
            </p>
          )}
          {isListening && previewNote && !previewFinal && !previewInterim && (
            <p className="text-[10px] text-stone-400 leading-snug">{previewNote}</p>
          )}
        </div>
      )}

      <div className="flex items-end gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={toggleHandsFree}
          disabled={disabled || (!handsFreeEnabled && isLoading)}
          aria-label={`ハンズフリーモードを${handsFreeEnabled ? '終了' : '開始'}`}
          aria-pressed={handsFreeEnabled}
          title={handsFreeEnabled ? 'ハンズフリーを終了' : 'ハンズフリーを開始'}
          className={`px-2 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer select-none ${
            handsFreeEnabled
              ? 'bg-rose-500 border-rose-500 text-white'
              : 'bg-white border-stone-200 text-stone-600 hover:bg-rose-50 hover:text-rose-600'
          }`}
        >
          HF
        </button>

        {/* 言語切り替えボタン (中国語 / 日本語) */}
        <button
          type="button"
          disabled={isListening || isPreparingRecording || isTranscribing}
          onClick={() => {
            const nextLang = speechLang === 'zh-CN' ? 'ja-JP' : 'zh-CN'
            onSpeechLangChange?.(nextLang)
          }}
          title={`音声入力言語の切替: 現在 ${speechLang === 'zh-CN' ? '中国語 (zh-CN)' : '日本語 (ja-JP)'}`}
          className="px-2.5 py-2 text-xs font-bold rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition-colors flex items-center gap-1.5 cursor-pointer select-none"
        >
          {speechLang === 'zh-CN' ? (
            <>
              <ChinaFlagIcon className="w-3.5 h-3.5" />
              <span>中</span>
            </>
          ) : (
            <>
              <JapanFlagIcon className="w-3.5 h-3.5" />
              <span>日</span>
            </>
          )}
        </button>

        {/* テキスト入力エリア */}
        <textarea
          ref={textareaRef}
          value={text}
          onFocus={() => {
            inputMethodRef.current = 'text'
          }}
          onChange={(e) => {
            inputMethodRef.current = 'text'
            textRef.current = e.target.value
            setText(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            isListening
              ? `話しかけて、「${speechLang === 'zh-CN' ? '发送' : '送信'}」で送信`
              : '中国語でも日本語でもOK！'
          }
          disabled={isLoading || disabled || isListening || isPreparingRecording || isTranscribing}
          className="flex-1 min-w-0 max-h-32 resize-none bg-transparent px-2.5 py-2 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 outline-none leading-relaxed"
        />

        {/* 音声入力ボタン */}
        <button
          type="button"
          onClick={toggleListening}
          disabled={isLoading || disabled || isPreparingRecording || isTranscribing}
          aria-label={isListening ? '音声入力を停止' : '音声入力を開始'}
          title={isListening ? (handsFreeEnabled ? 'ハンズフリーを終了' : '停止') : `音声入力 (${speechLang === 'zh-CN' ? '中国語' : '日本語'})`}
          className={`p-2.5 rounded-xl font-medium transition-all flex items-center justify-center cursor-pointer ${
            isListening
              ? 'bg-rose-600 text-white animate-bounce shadow-md'
              : 'bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600'
          }`}
        >
          {isListening ? (
            <StopCircleIcon className="w-5 h-5" />
          ) : (
            <MicIcon className="w-5 h-5" />
          )}
        </button>

        {/* 送信ボタン */}
        <button
          onClick={handleSend}
          disabled={!text.trim() || isLoading || disabled || isPreparingRecording || isTranscribing}
          aria-label="送信"
          className={`px-3 sm:px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-1.5 justify-center transition-all ${
            text.trim() && !isLoading && !disabled && !isPreparingRecording && !isTranscribing
              ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm cursor-pointer'
              : 'bg-stone-100 text-stone-300 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
          ) : (
            <>
              <SendIcon className="w-4 h-4" />
              <span className="hidden sm:inline">送信</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
