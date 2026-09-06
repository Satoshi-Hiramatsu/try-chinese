import { useState } from 'react'
import type { ChatMessage, Friend } from '../types'
import { BulbIcon, SpeakerIcon, StopCircleIcon } from './Icons'
import { FriendAvatar } from './FriendAvatar'

interface ChatMessageItemProps {
  message: ChatMessage
  friend: Friend
  playingText?: string | null
  onPlayText?: (text: string) => void
  onStopText?: () => void
}

export function ChatMessageItem({
  message,
  friend,
  playingText,
  onPlayText,
  onStopText,
}: ChatMessageItemProps) {
  const [showCorrection, setShowCorrection] = useState(true)

  if (message.role === 'user') {
    return (
      <div className="flex justify-end my-3">
        <div className="max-w-[85%] sm:max-w-[75%] bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-2xl rounded-tr-xs px-4 py-2.5 shadow-sm">
          <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap m-0 font-medium">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  const reply = message.reply
  const correction = message.correction
  const vocabulary = message.vocabulary || []

  const isPlayingMain = reply && playingText === reply.zh
  const isPlayingCorrection = correction?.suggested && playingText === correction.suggested

  const handleTogglePlayMain = () => {
    if (!reply) return
    if (isPlayingMain) {
      onStopText?.()
    } else {
      onPlayText?.(reply.zh)
    }
  }

  const handleTogglePlayCorrection = () => {
    if (!correction?.suggested) return
    if (isPlayingCorrection) {
      onStopText?.()
    } else {
      onPlayText?.(correction.suggested)
    }
  }

  return (
    <div className="flex items-start gap-3 my-4">
      {/* Friend Avatar (顔拡大クリップ) */}
      <FriendAvatar friend={friend} size="sm" shape="circle" className="mt-1" />

      <div className="max-w-[88%] sm:max-w-[80%] space-y-2">
        {/* Reply Bubble */}
        <div className="bg-white rounded-2xl rounded-tl-xs p-4 shadow-sm border border-rose-150/70 space-y-2.5 relative group">
          {reply ? (
            <div>
              {/* 音声再生ボタン (右上) */}
              <div className="flex items-center justify-between mb-1">
                {/* ピンイン常時表示（発音重視） */}
                <p className="text-xs sm:text-sm text-rose-600 font-mono tracking-wide m-0 select-text leading-snug">
                  {reply.pinyin}
                </p>

                <button
                  type="button"
                  onClick={handleTogglePlayMain}
                  title={isPlayingMain ? '音声を停止' : '発音を聞く (TTS)'}
                  aria-label={isPlayingMain ? '音声を停止' : '発音を聞く'}
                  className={`p-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer select-none text-xs ${
                    isPlayingMain
                      ? 'bg-rose-500 text-white animate-pulse shadow-xs'
                      : 'text-stone-400 hover:text-rose-600 hover:bg-rose-50'
                  }`}
                >
                  {isPlayingMain ? (
                    <>
                      <StopCircleIcon className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold">停止</span>
                    </>
                  ) : (
                    <>
                      <SpeakerIcon className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-semibold hidden sm:inline">発音</span>
                    </>
                  )}
                </button>
              </div>

              {/* 中国語本文 */}
              <p
                lang="zh-CN"
                className="font-chinese text-base sm:text-lg font-bold text-stone-900 mt-0.5 mb-0 leading-relaxed select-text tracking-wide"
              >
                {reply.zh}
              </p>

              {/* 日本語訳 */}
              <p className="text-xs sm:text-sm text-stone-500 mt-1.5 mb-0 select-text border-t border-stone-100 pt-1.5">
                {reply.ja}
              </p>
            </div>
          ) : (
            <p className="text-sm text-stone-700 m-0">{message.content}</p>
          )}

          {/* 趣味語彙チップ (HobbyVocabulary) */}
          {vocabulary.length > 0 && (
            <div className="pt-2 border-t border-stone-100 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] font-semibold text-stone-400 mr-1">新出表現:</span>
              {vocabulary.map((vocab, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50/80 border border-amber-200/60 text-stone-700 text-xs"
                >
                  <span lang="zh-CN" className="font-chinese font-bold text-amber-900">{vocab.term}</span>
                  <span className="text-[10px] text-amber-700 font-mono">({vocab.pinyin})</span>
                  <span className="text-[10px] text-stone-500">{vocab.ja}</span>
                  {vocab.hskLevel && (
                    <span className="text-[9px] px-1 bg-amber-200/60 text-amber-800 rounded font-semibold">
                      H{vocab.hskLevel}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 控えめな発話添削 (Correction) */}
        {correction && correction.hasCorrection && (
          <div className="bg-stone-50/90 rounded-xl p-3 border border-stone-200/80 text-xs shadow-2xs transition-all">
            <div
              className="flex items-center justify-between cursor-pointer select-none text-stone-500 hover:text-stone-700"
              onClick={() => setShowCorrection(!showCorrection)}
            >
              <span className="font-semibold text-stone-600 flex items-center gap-1.5">
                <BulbIcon className="w-3.5 h-3.5 text-amber-500" />
                <span>添削アドバイス</span>
              </span>
              <span className="text-[10px] text-stone-400">
                {showCorrection ? '閉じる' : '詳細を見る'}
              </span>
            </div>

            {showCorrection && (
              <div className="mt-2.5 pt-2 border-t border-stone-200/60 space-y-1.5 text-stone-600">
                {correction.original && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-medium text-stone-400 uppercase w-12 flex-shrink-0">
                      あなたの文
                    </span>
                    <span lang="zh-CN" className="font-chinese text-stone-500 line-through decoration-rose-400/50">
                      {correction.original}
                    </span>
                  </div>
                )}

                {correction.suggested && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-bold text-rose-500 uppercase w-12 flex-shrink-0">
                        自然な中国語
                      </span>
                      <div>
                        <span lang="zh-CN" className="font-chinese font-bold text-stone-900 text-sm">
                          {correction.suggested}
                        </span>
                        {correction.pinyin && (
                          <span className="text-[11px] text-rose-600 font-mono ml-2">
                            ({correction.pinyin})
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleTogglePlayCorrection}
                      title={isPlayingCorrection ? '音声を停止' : '添削文の発音を聞く'}
                      aria-label="添削文の発音を聞く"
                      className={`p-1 rounded-md transition-colors cursor-pointer select-none ${
                        isPlayingCorrection
                          ? 'bg-rose-500 text-white animate-pulse'
                          : 'text-stone-400 hover:text-rose-600 hover:bg-stone-200/50'
                      }`}
                    >
                      {isPlayingCorrection ? (
                        <StopCircleIcon className="w-3 h-3" />
                      ) : (
                        <SpeakerIcon className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                )}

                {correction.ja && (
                  <p className="text-[11px] text-stone-500 leading-normal pl-14 m-0">
                    {correction.ja}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
