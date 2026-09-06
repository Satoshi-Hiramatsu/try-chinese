import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { SendIcon } from './Icons'

interface ChatInputProps {
  onSendMessage: (content: string) => void
  isLoading: boolean
  disabled?: boolean
}

export function ChatInput({ onSendMessage, isLoading, disabled = false }: ChatInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isLoading])

  const handleSend = () => {
    if (text.trim() && !isLoading && !disabled) {
      onSendMessage(text.trim())
      setText('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  return (
    <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-2 sm:p-3 shadow-md border border-rose-200/80">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="中国語でも日本語でもOK！話しかけてみよう (Enterで送信)"
          disabled={isLoading || disabled}
          className="flex-1 max-h-32 resize-none bg-transparent px-3 py-2 text-sm sm:text-base text-stone-900 placeholder:text-stone-400 outline-none leading-relaxed"
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || isLoading || disabled}
          aria-label="送信"
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-1.5 justify-center transition-all ${
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
