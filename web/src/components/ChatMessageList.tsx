import { useEffect, useRef } from 'react'
import type { ChatMessage, Friend } from '../types'
import { ChatMessageItem } from './ChatMessageItem'

interface ChatMessageListProps {
  messages: ChatMessage[]
  friend: Friend
  isLoading: boolean
}

export function ChatMessageList({ messages, friend, isLoading }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isImageAvatar = friend.avatar.startsWith('/') || friend.avatar.startsWith('http') || friend.avatar.startsWith('data:')

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  return (
    <div className="flex-1 overflow-y-auto px-1 sm:px-2 py-4 space-y-2">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-stone-400">
          <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-md border-2 border-rose-200/80 mb-4 bg-rose-50">
            {isImageAvatar ? (
              <img
                src={friend.avatar}
                alt={friend.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-rose-500">
                {friend.name.charAt(0)}
              </div>
            )}
          </div>
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
          <ChatMessageItem key={msg.id} message={msg} friend={friend} />
        ))
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-start gap-3 my-4">
          <div className="mt-1 flex-shrink-0">
            {isImageAvatar ? (
              <img
                src={friend.avatar}
                alt={friend.name}
                className="w-9 h-9 rounded-full object-cover shadow-xs border border-rose-200"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-xs font-bold text-rose-600 border border-rose-200">
                {friend.name.charAt(0)}
              </div>
            )}
          </div>
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
