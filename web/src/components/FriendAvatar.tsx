import type { Friend } from '../types'

interface FriendAvatarProps {
  friend: Friend
  size?: 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'rounded'
  className?: string
  zoom?: boolean
}

export function FriendAvatar({
  friend,
  size = 'md',
  shape = 'rounded',
  className = '',
  zoom = true,
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
  const isImageAvatar =
    friend.avatar.startsWith('/') ||
    friend.avatar.startsWith('http') ||
    friend.avatar.startsWith('data:')

  return (
    <div
      className={`relative overflow-hidden flex-shrink-0 bg-rose-50 border border-rose-200/80 shadow-xs ${sizeClasses} ${shapeClasses} ${className}`}
    >
      {isImageAvatar ? (
        <img
          src={friend.avatar}
          alt={friend.name}
          className={`w-full h-full object-cover transition-transform ${
            zoom ? zoomClasses : ''
          }`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-bold text-rose-500">
          {friend.name.charAt(0)}
        </div>
      )}
    </div>
  )
}
