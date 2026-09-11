import type { ChatMessage, Friend } from '../types'
import { ChatMessageList } from './ChatMessageList'
import { CloseIcon, MessageSquareIcon } from './Icons'

interface ChatLogModalProps {
  isOpen: boolean
  onClose: () => void
  messages: ChatMessage[]
  friend: Friend
  playingText?: string | null
  onPlayText?: (text: string, speechText?: string) => void
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

/** ノベル画面から呼び出す会話ログ（バックログ）。 */
export function ChatLogModal({
  isOpen,
  onClose,
  messages,
  friend,
  playingText,
  onPlayText,
  onStopText,
  savedTerms,
  enableToneColoring = false,
  onSaveVocabulary,
}: ChatLogModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[88svh] flex flex-col shadow-2xl border border-rose-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-stone-900 m-0 flex items-center gap-2">
              <MessageSquareIcon className="w-5 h-5 text-rose-500" />
              <span>会話ログ</span>
            </h3>
            <p className="text-xs text-stone-500 m-0 mt-0.5">
              <span lang="zh-CN" className="font-chinese font-semibold">
                {friend.name}
              </span>
              との会話をさかのぼって復習できます（全 {messages.length} 件）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col bg-stone-50/60">
          <ChatMessageList
            messages={messages}
            friend={friend}
            isLoading={false}
            playingText={playingText}
            onPlayText={onPlayText}
            onStopText={onStopText}
            savedTerms={savedTerms}
            enableToneColoring={enableToneColoring}
            onSaveVocabulary={onSaveVocabulary}
          />
        </div>
      </div>
    </div>
  )
}
