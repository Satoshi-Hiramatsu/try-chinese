import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { SendIcon, MicIcon, StopCircleIcon, ChinaFlagIcon, JapanFlagIcon } from './Icons'
import {
  createSpeechRecognizer,
  isSpeechRecognitionSupported,
  unlockSpeechSynthesis,
  stopSpeaking,
  type SpeechRecognitionController,
} from '../services/speech'

interface ChatInputProps {
  onSendMessage: (content: string) => void
  isLoading: boolean
  disabled?: boolean
  speechLang?: 'zh-CN' | 'ja-JP'
  onSpeechLangChange?: (lang: 'zh-CN' | 'ja-JP') => void
  onError?: (message: string) => void
}

export function ChatInput({
  onSendMessage,
  isLoading,
  disabled = false,
  speechLang = 'zh-CN',
  onSpeechLangChange,
  onError,
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognizerRef = useRef<SpeechRecognitionController | null>(null)

  const isSupported = isSpeechRecognitionSupported()

  useEffect(() => {
    if (!isLoading && textareaRef.current && !isListening) {
      textareaRef.current.focus()
    }
  }, [isLoading, isListening])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (recognizerRef.current) {
        recognizerRef.current.abort()
      }
    }
  }, [])

  const handleSend = () => {
    if (recognizerRef.current) {
      recognizerRef.current.abort()
      setIsListening(false)
      setInterimText('')
    }

    if (text.trim() && !isLoading && !disabled) {
      // ユーザージェスチャー同期タイミングでブラウザのTTS制限を事前アンロック
      unlockSpeechSynthesis()

      onSendMessage(text.trim())
      setText('')
      setInterimText('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

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
      // 停止
      recognizerRef.current?.stop()
      return
    }

    // Stop playback before opening the microphone.
    recognizerRef.current?.abort()
    stopSpeaking()
    const baseText = text.trim()

    // 開始
    setInterimText('')
    const recognizer = createSpeechRecognizer({
      lang: speechLang,
      onStart: () => {
        setIsListening(true)
      },
      onInterimResult: (interim) => {
        setInterimText(interim)
      },
      onFinalResult: (finalChunk) => {
        setText(() => {
          const trimmedPrev = baseText
          // 前の文字列が英数字・ピンインで、追加分も英数字の場合はスペースを空け、漢字等の場合は自然に連結
          const shouldAddSpace = Boolean(
            trimmedPrev &&
            /[a-zA-Z0-9]$/.test(trimmedPrev) &&
            /^[a-zA-Z0-9]/.test(finalChunk)
          )
          const next = trimmedPrev
            ? shouldAddSpace
              ? `${trimmedPrev} ${finalChunk}`
              : `${trimmedPrev}${finalChunk}`
            : finalChunk
          return next
        })
        setInterimText('')
        setTimeout(handleInput, 10)
      },
      onError: (err) => {
        setIsListening(false)
        setInterimText('')
        onError?.(err)
      },
      onEnd: () => {
        setIsListening(false)
        setInterimText('')
      },
    })

    if (recognizer) {
      recognizerRef.current = recognizer
      recognizer.start()
    }
  }

  return (
    <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-2 sm:p-3 shadow-md border border-rose-200/80 transition-all">
      {/* 音声認識中のインジケータ */}
      {isListening && (
        <div className="mb-2 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-600 min-w-0">
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
            </span>
            <span className="flex-shrink-0">
              {speechLang === 'zh-CN' ? '中国語' : '日本語'}で聞き取り中...
            </span>
            {interimText && (
              <span className="text-stone-600 font-normal italic truncate">
                "{interimText}"
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] text-stone-500 hidden sm:inline">話し終えたら</span>
            <button
              type="button"
              onClick={() => {
                recognizerRef.current?.stop()
              }}
              className="px-2 py-0.5 text-xs bg-white border border-rose-200 text-rose-600 font-bold rounded-md hover:bg-rose-100 transition-colors cursor-pointer"
            >
              完了
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-1.5 sm:gap-2">
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
            setText(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            isListening
              ? '話しかけてください...'
              : '中国語でも日本語でもOK！話しかけてみよう (Enterで送信)'
          }
          disabled={isLoading || disabled || isListening}
          className="flex-1 max-h-32 resize-none bg-transparent px-2.5 py-2 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 outline-none leading-relaxed"
        />

        {/* 音声入力ボタン */}
        <button
          type="button"
          onClick={toggleListening}
          disabled={isLoading || disabled}
          aria-label={isListening ? '音声入力を停止' : '音声入力を開始'}
          title={isListening ? '停止' : `音声入力 (${speechLang === 'zh-CN' ? '中国語' : '日本語'})`}
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

