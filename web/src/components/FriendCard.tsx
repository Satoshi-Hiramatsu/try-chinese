import type { Friend } from '../types'
import { UsersIcon } from './Icons'

interface FriendCardProps {
  friend: Friend
  onOpenFriendList?: () => void
}

export function FriendCard({ friend, onOpenFriendList }: FriendCardProps) {
  const isImageAvatar = friend.avatar.startsWith('/') || friend.avatar.startsWith('http') || friend.avatar.startsWith('data:')

  return (
    <div className="w-full bg-white/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-rose-150/80 transition-all">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden shadow-sm border-2 border-rose-200/80 flex-shrink-0 bg-rose-50">
          {isImageAvatar ? (
            <img
              src={friend.avatar}
              alt={friend.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-lg text-rose-500">
              {friend.name.charAt(0)}
            </div>
          )}
        </div>
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
            {onOpenFriendList && (
              <button
                type="button"
                onClick={onOpenFriendList}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors flex items-center gap-1.5 border border-rose-200/60 flex-shrink-0 cursor-pointer"
              >
                <UsersIcon className="w-3.5 h-3.5" />
                <span>切替</span>
              </button>
            )}
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

