import type { Friend } from '../types'
import { UsersIcon, SpeakerIcon } from './Icons'
import { FriendAvatar } from './FriendAvatar'

interface FriendCardProps {
  friend: Friend
  onOpenFriendList?: () => void
  onOpenVoiceSettings?: () => void
}

export function FriendCard({ friend, onOpenFriendList, onOpenVoiceSettings }: FriendCardProps) {
  return (
    <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-rose-150/80 transition-all">
      <div className="flex items-start gap-4">
        <FriendAvatar friend={friend} size="lg" shape="rounded" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 truncate">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white tracking-wide">
                Friend
              </span>
              <h2 lang="zh-CN" className="font-chinese text-base sm:text-lg font-bold text-stone-900 truncate m-0">
                {friend.name}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {onOpenVoiceSettings && (
                <button
                  type="button"
                  onClick={onOpenVoiceSettings}
                  title="声の高さを変える"
                  className="text-xs text-stone-600 hover:text-rose-600 font-medium px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1 border border-stone-200 hover:border-rose-200 cursor-pointer"
                >
                  <SpeakerIcon className="w-3.5 h-3.5 text-rose-500" />
                  <span>声の高さ</span>
                </button>
              )}
              {onOpenFriendList && (
                <button
                  type="button"
                  onClick={onOpenFriendList}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1.5 border border-rose-200/60 cursor-pointer"
                >
                  <UsersIcon className="w-3.5 h-3.5" />
                  <span>切替</span>
                </button>
              )}
            </div>
          </div>
          <p className="text-xs sm:text-sm text-stone-600 mt-1 mb-2 leading-relaxed">
            {friend.personality}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {friend.hobbies.map((hobby) => (
              <span
                key={hobby}
                className="text-[11px] px-2.5 py-0.5 rounded-md bg-stone-100/80 text-stone-600 font-medium border border-stone-200/50"
              >
                #{hobby}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

