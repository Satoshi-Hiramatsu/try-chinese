import { useEffect, useRef } from 'react'
import type { ChatMessage, Friend } from '../types'
import { ChatMessageItem } from './ChatMessageItem'
import { FriendAvatar } from './FriendAvatar'

interface ChatMessageListProps {
  messages: ChatMessage[]
  friend: Friend
  isLoading: boolean
  playingText?: string | null
  onPlayText?: (text: string) => void
  onStopText?: () => void
  savedTerms?: Set<string>
  enableToneColoring?: boolean
  onSaveVocabulary?: (item: {
    term: string
    pinyin: string
    ja: string
    hskLevel?: number
    source: 'chat_vocabulary' | 'chat_correction'
  }) => void
}

export function ChatMessageList({
  messages,
  friend,
  isLoading,
  playingText,
  onPlayText,
  onStopText,
  savedTerms,
  enableToneColoring = false,
  onSaveVocabulary,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto px-1 sm:px-2 py-4 space-y-2">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-stone-400">
          <FriendAvatar friend={friend} size="xl" shape="rounded" className="mb-4" />
          <p className="font-semibold text-stone-700 text-sm sm:text-base">
            <span lang="zh-CN" className="font-chinese font-bold text-stone-900">{friend.name}</span> と会話を始めましょう！
          </p>
          <p className="text-xs text-stone-400 mt-1.5 max-w-sm leading-relaxed">
            趣味の「{friend.hobbies.join('・')}」についてや、今日の出来事など、何でも気軽に話しかけてみてください。
            日本語や片言でも大丈夫です。
          </p>
        </div>
      ) : (
        messages.map((msg) => (
          <ChatMessageItem
            key={msg.id}
            message={msg}
            friend={friend}
            playingText={playingText}
            onPlayText={onPlayText}
            onStopText={onStopText}
            savedTerms={savedTerms}
            enableToneColoring={enableToneColoring}
            onSaveVocabulary={onSaveVocabulary}
          />
        ))
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-start gap-3 my-4">
          <FriendAvatar friend={friend} size="sm" shape="circle" className="mt-1" />
          <div className="bg-white rounded-2xl rounded-tl-xs p-4 shadow-sm border border-rose-150/70">
            <div className="flex items-center gap-1.5 py-1">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-bounce"></span>
              <span className="text-xs text-stone-400 ml-2">考えています...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
