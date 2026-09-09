import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { SendIcon, MicIcon, StopCircleIcon, ChinaFlagIcon, JapanFlagIcon } from './Icons'
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  unlockSpeechSynthesis,
  stopSpeaking,
  type SpeechRecognitionController,
} from '../services/speech'
import { parseVoiceSendCommand } from '../services/voiceCommand'

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
  onError?: (message: string) => void
}

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
  onError,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognizerRef = useRef<SpeechRecognitionController | null>(null)
  const textRef = useRef('')
  const handsFreeRef = useRef(handsFreeEnabled)
  const isLoadingRef = useRef(isLoading)
  const disabledRef = useRef(disabled)
  const onSendMessageRef = useRef(onSendMessage)
  const onErrorRef = useRef(onError)
  const intentionalStopRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [restartListeningToken, setRestartListeningToken] = useState(0)

  handsFreeRef.current = handsFreeEnabled
  isLoadingRef.current = isLoading
  disabledRef.current = disabled
  onSendMessageRef.current = onSendMessage
  onErrorRef.current = onError

  const isSupported = isSpeechRecognitionSupported()

  const sendContent = useCallback((content: string) => {
    const trimmed = content.trim()
    if (!trimmed || isLoadingRef.current || disabledRef.current) return

    intentionalStopRef.current = true
    recognizerRef.current?.abort()
    recognizerRef.current = null
    setIsListening(false)
    setInterimText('')
    unlockSpeechSynthesis()
    onSendMessageRef.current(trimmed)
    textRef.current = ''
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported || isLoadingRef.current || disabledRef.current || recognizerRef.current) return

    stopSpeaking()
    intentionalStopRef.current = false
    const baseText = textRef.current.trim()
    setInterimText('')
    let recognizer: SpeechRecognitionController | null = null

    recognizer = createSpeechRecognizer({
      lang: speechLang,
      onStart: () => setIsListening(true),
      onInterimResult: (interim) => setInterimText(interim),
      onFinalResult: (finalSpeech) => {
        const parsed = parseVoiceSendCommand(finalSpeech, speechLang)
        const next = joinSpeechText(baseText, parsed.content)
        textRef.current = next
        setText(next)
        setInterimText('')
        setTimeout(handleInput, 10)

        if (parsed.hasSendCommand) {
          if (next) {
            sendContent(next)
          } else {
            onErrorRef.current?.('送信する内容がありません。続けて話しかけてください。')
            recognizerRef.current?.abort()
            recognizerRef.current = null
            setIsListening(false)
            if (handsFreeRef.current) setRestartListeningToken((prev) => prev + 1)
          }
        }
      },
      onError: (err) => {
        setIsListening(false)
        setInterimText('')
        onErrorRef.current?.(err)
      },
      onEnd: () => {
        if (recognizerRef.current === recognizer) recognizerRef.current = null
        setIsListening(false)
        setInterimText('')
        if (!intentionalStopRef.current && handsFreeRef.current && !isLoadingRef.current && !disabledRef.current) {
          setRestartListeningToken((prev) => prev + 1)
        }
        intentionalStopRef.current = false
      },
    })

    if (recognizer) {
      recognizerRef.current = recognizer
      recognizer.start()
    }
  }, [isSupported, sendContent, speechLang])

  useEffect(() => {
    if (!isLoading && textareaRef.current && !isListening && !handsFreeEnabled) {
      textareaRef.current.focus()
    }
  }, [handsFreeEnabled, isLoading, isListening])

  useEffect(() => {
    if (restartListeningToken === 0 || !handsFreeEnabled) return
    restartTimerRef.current = setTimeout(startListening, 350)
    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    }
  }, [handsFreeEnabled, restartListeningToken, startListening])

  useEffect(() => {
    if (resumeListeningToken > 0 && handsFreeEnabled && !isLoading && !isFriendSpeaking) {
      startListening()
    }
  }, [handsFreeEnabled, isFriendSpeaking, isLoading, resumeListeningToken, startListening])

  useEffect(() => () => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
    recognizerRef.current?.abort()
  }, [])

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
      onError?.('お使いのブラウザは音声認識に対応していません。ChromeまたはEdgeをご利用ください。')
      return
    }

    if (isListening) {
      intentionalStopRef.current = true
      if (handsFreeRef.current) {
        handsFreeRef.current = false
        onHandsFreeChange?.(false)
      }
      recognizerRef.current?.stop()
      return
    }
    startListening()
  }

  const toggleHandsFree = () => {
    if (!isSupported) {
      onError?.('お使いのブラウザは音声認識に対応していません。ChromeまたはEdgeをご利用ください。')
      return
    }
    const next = !handsFreeRef.current
    handsFreeRef.current = next
    onHandsFreeChange?.(next)
    if (next) {
      unlockSpeechSynthesis()
      startListening()
    } else {
      intentionalStopRef.current = true
      recognizerRef.current?.abort()
      recognizerRef.current = null
      setIsListening(false)
      setInterimText('')
    }
  }

  return (
    <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-2 sm:p-3 shadow-md border border-rose-200/80 transition-all">
      {/* ハンズフリー / 音声認識の状態 */}
      {(isListening || handsFreeEnabled) && (
        <div className="mb-2 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between" aria-live="polite">
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
                  : isListening
                    ? (speechLang === 'zh-CN' ? '中国語で聞き取り中...' : '日本語で聞き取り中...')
                    : 'マイクを再開します...'}
            </span>
            {interimText && (
              <span className="text-stone-600 font-normal italic truncate">
                "{interimText}"
              </span>
            )}
          </div>
          {isListening && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] text-stone-500 hidden sm:inline">
              {handsFreeEnabled
                ? `「${speechLang === 'zh-CN' ? '发送' : '送って'}」で送信`
                : '話し終えたら'}
            </span>
            <button
              type="button"
              onClick={() => {
                if (handsFreeEnabled) {
                  handleSend()
                } else {
                  intentionalStopRef.current = true
                  recognizerRef.current?.stop()
                }
              }}
              disabled={handsFreeEnabled && !text.trim()}
              className="px-2 py-0.5 text-xs bg-white border border-rose-200 text-rose-600 font-bold rounded-md hover:bg-rose-100 transition-colors cursor-pointer"
            >
              {handsFreeEnabled ? '送信' : '完了'}
            </button>
          </div>
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
          disabled={isListening}
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
          onChange={(e) => {
            textRef.current = e.target.value
            setText(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            isListening
              ? '話しかけてください...'
              : '中国語でも日本語でもOK！'
          }
          disabled={isLoading || disabled || isListening}
          className="flex-1 min-w-0 max-h-32 resize-none bg-transparent px-2.5 py-2 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 outline-none leading-relaxed"
        />

        {/* 音声入力ボタン */}
        <button
          type="button"
          onClick={toggleListening}
          disabled={isLoading || disabled}
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
          disabled={!text.trim() || isLoading || disabled}
          aria-label="送信"
          className={`px-3 sm:px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-1.5 justify-center transition-all ${
            text.trim() && !isLoading && !disabled
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

