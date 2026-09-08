import type { Expression, Friend } from '../types'
import { getPortrait, resolvePortrait } from '../data/portraits'
import { CharacterPortrait } from './CharacterPortrait'

interface FriendAvatarProps {
  friend: Friend
  size?: 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'rounded'
  className?: string
  zoom?: boolean
  /** 立ち絵ベースのアイコンに表示する表情 */
  expression?: Expression
}

export function FriendAvatar({
  friend,
  size = 'md',
  shape = 'rounded',
  className = '',
  zoom = true,
  expression = 'smile',
}: FriendAvatarProps) {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-14 h-14 sm:w-16 sm:h-16',
    xl: 'w-20 h-20',
  }[size]

  const zoomClasses = {
    sm: 'scale-[2.4] origin-[50%_35%]',
    md: 'scale-[2.2] origin-[50%_36%]',
    lg: 'scale-[2.1] origin-[50%_36%]',
    xl: 'scale-[2.0] origin-[50%_36%]',
  }[size]

  const shapeClasses = shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
  const avatar = friend.avatar || ''
  const isImageAvatar =
    avatar.startsWith('/') || avatar.startsWith('http') || avatar.startsWith('data:')
  // 立ち絵IDが最優先。旧データで画像アバターしか無い場合はその画像を使い、
  // どちらも無ければ性別とIDから決まる立ち絵にフォールバックする。
  const portrait = getPortrait(friend.portraitId) || (isImageAvatar ? null : resolvePortrait(friend))

  return (
    <div
      className={`relative overflow-hidden flex-shrink-0 bg-rose-50 border border-rose-200/80 shadow-xs ${sizeClasses} ${shapeClasses} ${className}`}
    >
      {portrait ? (
        <CharacterPortrait
          spec={portrait}
          expression={expression}
          crop="face"
          animate={false}
          className="w-full h-full"
          title={friend.name}
        />
      ) : isImageAvatar ? (
        <img
          src={avatar}
          alt={friend.name}
          className={`w-full h-full object-cover transition-transform ${zoom ? zoomClasses : ''}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-bold text-rose-500">
          {friend.name.charAt(0)}
        </div>
      )}
    </div>
  )
}
