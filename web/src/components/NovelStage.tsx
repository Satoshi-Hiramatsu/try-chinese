import { useEffect, useRef, useState } from 'react'
import { EXPRESSIONS, type ChatMessage, type Expression, type Friend } from '../types'
import {
  getPortraitImage,
  getPortraitLayer,
  getSceneImage,
  hasPortraitExpressions,
  resolvePortrait,
} from '../data/portraits'
import { CharacterPortrait, EXPRESSION_LABELS } from './CharacterPortrait'
import { SceneBackdrop } from './SceneBackdrop'
import { TonePinyin } from './TonePinyin'
import { SampleReplyPanel } from './SampleReplyPanel'
import {
  BulbIcon,
  SpeakerIcon,
  StopCircleIcon,
  BookmarkIcon,
  BookmarkFilledIcon,
  MessageSquareIcon,
  SettingsIcon,
  UsersIcon,
} from './Icons'

interface NovelStageProps {
  friend: Friend
  /** 現在ステージに表示している Friend の返答 */
  message: ChatMessage | null
  /** 直前のユーザー発話（画面上部に小さく残す） */
  lastUserText?: string
  isLoading: boolean
  playingText?: string | null
  onPlayText?: (text: string, speechText?: string) => void
  onStopText?: () => void
  savedTerms?: Set<string>
  enableToneColoring?: boolean
  showSampleReplies?: boolean
  onSaveVocabulary?: (item: {
    term: string
    pinyin: string
    ja: string
    hskLevel?: number
    source: 'chat_vocabulary' | 'chat_correction'
  }) => void
  onOpenLog?: () => void
  onOpenFriendList?: () => void
  onOpenVoiceSettings?: () => void
  logCount?: number
}

/** 1文字あたりの表示間隔（ミリ秒）— 中国語本文のタイプライター表示 */
const TYPE_SPEED_MS = 32

export function NovelStage({
  friend,
  message,
  lastUserText,
  isLoading,
  playingText,
  onPlayText,
  onStopText,
  savedTerms,
  enableToneColoring = false,
  showSampleReplies = false,
  onSaveVocabulary,
  onOpenLog,
  onOpenFriendList,
  onOpenVoiceSettings,
  logCount = 0,
}: NovelStageProps) {
  const portrait = resolvePortrait(friend)
  const portraitImage = getPortraitImage(portrait.id)
  /** 表情差分を持つ立ち絵は、背景レイヤーとキャラクターレイヤーを分けて描く。 */
  const layered = hasPortraitExpressions(portrait.id)
  const reply = message?.reply
  const correction = message?.correction
  const vocabulary = message?.vocabulary || []
  const expression: Expression = message?.expression || 'smile'

  const zh = reply?.zh || ''
  const [typed, setTyped] = useState(zh.length)
  const [showCorrection, setShowCorrection] = useState(false)
  const messageId = message?.id

  // メッセージが変わるたびに本文を1文字ずつ送る
  useEffect(() => {
    if (!zh) {
      setTyped(0)
      return
    }
    setTyped(0)
    let i = 0
    const timer = window.setInterval(() => {
      i += 1
      setTyped(i)
      if (i >= zh.length) window.clearInterval(timer)
    }, TYPE_SPEED_MS)
    return () => window.clearInterval(timer)
  }, [messageId, zh])

  // 添削は返答ごとに畳んだ状態に戻す
  useEffect(() => {
    setShowCorrection(false)
  }, [messageId])

  const isComplete = typed >= zh.length
  const skipTyping = () => setTyped(zh.length)

  const isPlayingMain = Boolean(reply && playingText === reply.zh)
  const isPlayingCorrection = Boolean(correction?.suggested && playingText === correction.suggested)
  const talking = isPlayingMain || !isComplete

  // 表情が変わったときだけ立ち絵をひと跳ねさせる
  const prevExpression = useRef<Expression>(expression)
  const [reactKey, setReactKey] = useState(0)
  useEffect(() => {
    if (prevExpression.current !== expression) {
      prevExpression.current = expression
      setReactKey((k) => k + 1)
    }
  }, [expression])

  const scene = portrait.scene
  const sceneImage = getSceneImage(scene)
  const isNight = scene === 'night'

  return (
    <section
      className={`vn-stage relative flex-1 min-h-0 overflow-hidden rounded-2xl sm:rounded-3xl border border-rose-200/70 shadow-sm scene scene-${scene}`}
      aria-label={`${friend.name} との会話画面`}
    >
      {/* ---------------------------------------------------------------- 立ち絵 */}
      <div className="vn-figure overflow-hidden">
        {layered ? (
          /*
           * 背景とキャラクターを別レイヤーで描く。
           * 表情差分は全パターンを重ねて置き、不透明度だけを切り替える。
           * 表示のたびに画像を読み込み直さないので、切り替え時にちらつかない。
           */
          <>
            {sceneImage ? (
              <img src={sceneImage} alt="" className="vn-backdrop-img" draggable={false} />
            ) : (
              <SceneBackdrop scene={scene} />
            )}
            <div key={friend.id} className="absolute inset-0 stage-enter">
              <div key={reactKey} className="w-full h-full stage-react">
                {EXPRESSIONS.map((candidate) => (
                  <img
                    key={candidate}
                    src={getPortraitLayer(portrait.id, candidate) || ''}
                    alt={
                      candidate === expression
                        ? `${friend.name} の立ち絵（${EXPRESSION_LABELS[candidate]}）`
                        : ''
                    }
                    className="vn-portrait-img vn-portrait-layer"
                    style={{ opacity: candidate === expression ? 1 : 0 }}
                    aria-hidden={candidate === expression ? undefined : true}
                    draggable={false}
                  />
                ))}
              </div>
            </div>
          </>
        ) : portraitImage ? (
          /* 表情差分をまだ持たないイラスト立ち絵。背景はイラストに描き込まれている。 */
          <div key={friend.id} className="absolute inset-0 stage-enter">
            <img
              src={portraitImage}
              alt={`${friend.name} の立ち絵`}
              className="vn-portrait-img"
              draggable={false}
            />
          </div>
        ) : (
          /* イラストを持たないカスタム友達は SVG 立ち絵で描画する。 */
          <>
            <SceneBackdrop scene={scene} />
            <div className="absolute inset-0 flex items-end justify-center px-2">
              <div key={friend.id} className="w-full h-full stage-enter">
                <div key={reactKey} className="w-full h-full stage-react">
                  <CharacterPortrait
                    spec={portrait}
                    expression={expression}
                    crop="bust"
                    talking={talking}
                    className="w-full h-full drop-shadow-[0_10px_24px_rgba(60,40,45,0.22)]"
                    title={`${friend.name}（${EXPRESSION_LABELS[expression]}）`}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ネームプレート */}
        <div className="vn-nameplate absolute top-2.5 left-2.5 sm:top-4 sm:left-4 flex items-center gap-2 max-w-[calc(100%-1.25rem)]">
          <span className="vn-name font-chinese font-bold text-white bg-rose-500/95 px-3 py-1 rounded-lg shadow-md truncate">
            {friend.name}
          </span>
          <span
            className={`vn-meta vn-expr px-2 py-0.5 rounded-md font-semibold backdrop-blur-sm ${
              isNight ? 'bg-white/20 text-white' : 'bg-white/80 text-stone-600'
            }`}
          >
            {EXPRESSION_LABELS[expression]}
          </span>
        </div>
      </div>

      {/* ステージ上のクイックボタン */}
      <div className="vn-controls flex items-center gap-1.5">
        {onOpenFriendList && (
          <button
            type="button"
            onClick={onOpenFriendList}
            title="友達を切り替え"
            aria-label="友達を切り替え"
            className="p-2 rounded-xl bg-white/85 hover:bg-white text-stone-600 hover:text-rose-600 shadow-sm backdrop-blur-sm transition-colors cursor-pointer"
          >
            <UsersIcon className="w-4 h-4" />
          </button>
        )}
        {onOpenVoiceSettings && (
          <button
            type="button"
            onClick={onOpenVoiceSettings}
            title="声の高さを変える"
            aria-label="声の高さを変える"
            className="p-2 rounded-xl bg-white/85 hover:bg-white text-stone-600 hover:text-rose-600 shadow-sm backdrop-blur-sm transition-colors cursor-pointer"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        )}
        {onOpenLog && (
          <button
            type="button"
            onClick={onOpenLog}
            title="これまでの会話ログ"
            aria-label="これまでの会話ログ"
            className="p-2 rounded-xl bg-white/85 hover:bg-white text-stone-600 hover:text-rose-600 shadow-sm backdrop-blur-sm transition-colors cursor-pointer flex items-center gap-1"
          >
            <MessageSquareIcon className="w-4 h-4" />
            {logCount > 0 && <span className="text-[10px] font-bold">{logCount}</span>}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------ テキスト枠 */}
      <div className="vn-dialogue relative px-2 pb-2 sm:px-4 sm:pb-4">
        {/* 直前のユーザー発話（テキスト枠の上に小さく残す） */}
        {lastUserText && (
          <div className="vn-echo vn-measure flex justify-end pb-1.5 pointer-events-none">
            <span className="vn-meta max-w-[80%] truncate px-3 py-1 rounded-xl shadow-sm bg-white/85 text-stone-600">
              あなた: {lastUserText}
            </span>
          </div>
        )}

        <div
          className="vn-measure vn-panel relative bg-white/94 backdrop-blur-md rounded-2xl border border-rose-200/70 shadow-lg px-4 py-3 sm:px-6 sm:py-4 overflow-y-auto overscroll-contain"
          onClick={skipTyping}
        >
          {isLoading ? (
            <div className="flex items-center gap-2 py-4">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-bounce" />
              <span className="vn-ja text-stone-500 ml-2">考えています...</span>
            </div>
          ) : reply ? (
            <div className="space-y-2">
              {/* ピンイン＋発音ボタン */}
              <div className="flex items-start justify-between gap-3">
                <TonePinyin
                  pinyin={reply.pinyin}
                  enableColoring={enableToneColoring}
                  className="vn-pinyin text-stone-600 m-0 flex-1"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isPlayingMain) onStopText?.()
                    else onPlayText?.(reply.zh, reply.speech)
                  }}
                  title={isPlayingMain ? '音声を停止' : '発音を聞く'}
                  aria-label={isPlayingMain ? '音声を停止' : '発音を聞く'}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                    isPlayingMain
                      ? 'bg-rose-500 text-white shadow-xs'
                      : 'text-stone-500 hover:text-rose-600 hover:bg-rose-50 border border-stone-200'
                  }`}
                >
                  {isPlayingMain ? (
                    <StopCircleIcon className="w-4 h-4" />
                  ) : (
                    <SpeakerIcon className="w-4 h-4" />
                  )}
                  <span className="text-[11px] font-bold hidden sm:inline">
                    {isPlayingMain ? '停止' : '発音'}
                  </span>
                </button>
              </div>

              {/* 中国語本文（タイプライター表示） */}
              <p
                lang="zh-CN"
                className="vn-zh font-chinese font-bold text-stone-900 m-0 tracking-wide select-text"
              >
                {zh.slice(0, typed)}
                {!isComplete && <span className="text-rose-400">▍</span>}
              </p>

              {/* 日本語訳 */}
              {isComplete && (
                <p className="vn-ja text-stone-600 m-0 pt-1.5 border-t border-stone-150 select-text">
                  {reply.ja}
                </p>
              )}

              {/* 趣味語彙 */}
              {isComplete && vocabulary.length > 0 && (
                <div className="pt-1.5 flex flex-wrap gap-1.5 items-center">
                  <span className="vn-meta font-semibold text-stone-400 mr-0.5">新出表現:</span>
                  {vocabulary.map((vocab, idx) => {
                    const isSaved = savedTerms?.has(vocab.term.trim().toLowerCase())
                    return (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200/70 shadow-2xs"
                      >
                        <span lang="zh-CN" className="font-chinese font-bold text-amber-900 text-sm">
                          {vocab.term}
                        </span>
                        <span className="text-[11px] text-stone-500">
                          <TonePinyin pinyin={vocab.pinyin} enableColoring={enableToneColoring} />
                        </span>
                        <span className="text-[11px] text-stone-500">{vocab.ja}</span>
                        {onSaveVocabulary && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSaveVocabulary({
                                term: vocab.term,
                                pinyin: vocab.pinyin,
                                ja: vocab.ja,
                                hskLevel: vocab.hskLevel,
                                source: 'chat_vocabulary',
                              })
                            }}
                            title={isSaved ? '語彙帳に保存済み' : '語彙帳に保存'}
                            className="p-0.5 rounded cursor-pointer"
                          >
                            {isSaved ? (
                              <BookmarkFilledIcon className="w-4 h-4 text-amber-500" />
                            ) : (
                              <BookmarkIcon className="w-4 h-4 text-stone-300 hover:text-amber-600" />
                            )}
                          </button>
                        )}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* 添削（控えめに折りたたむ） */}
              {isComplete && correction?.hasCorrection && (
                <div className="pt-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCorrection((v) => !v)
                    }}
                    className="vn-meta flex items-center gap-1.5 text-stone-500 hover:text-stone-800 font-semibold cursor-pointer"
                  >
                    <BulbIcon className="w-4 h-4 text-amber-500" />
                    <span>添削アドバイス</span>
                    <span className="text-stone-400 font-normal">
                      {showCorrection ? '閉じる' : '詳細を見る'}
                    </span>
                  </button>

                  {showCorrection && (
                    <div className="mt-2 p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                      {correction.original && (
                        <p className="vn-meta text-stone-500 m-0">
                          <span className="font-semibold text-stone-400 mr-2">あなたの文</span>
                          <span lang="zh-CN" className="font-chinese line-through decoration-rose-400/60">
                            {correction.original}
                          </span>
                        </p>
                      )}
                      {correction.suggested && (
                        <div className="flex items-center justify-between gap-2">
                          <p className="m-0">
                            <span className="vn-meta font-bold text-rose-500 mr-2">自然な中国語</span>
                            <span lang="zh-CN" className="font-chinese font-bold text-stone-900">
                              {correction.suggested}
                            </span>
                            {correction.pinyin && (
                              <span className="vn-meta text-stone-500 ml-2">
                                <TonePinyin
                                  pinyin={correction.pinyin}
                                  enableColoring={enableToneColoring}
                                />
                              </span>
                            )}
                          </p>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            {onSaveVocabulary && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onSaveVocabulary({
                                    term: correction.suggested!,
                                    pinyin: correction.pinyin || '',
                                    ja: correction.ja || '自然な表現',
                                    source: 'chat_correction',
                                  })
                                }}
                                title="この添削表現を語彙帳に保存"
                                className="p-1 rounded-md cursor-pointer"
                              >
                                {savedTerms?.has(correction.suggested.trim().toLowerCase()) ? (
                                  <BookmarkFilledIcon className="w-4 h-4 text-rose-500" />
                                ) : (
                                  <BookmarkIcon className="w-4 h-4 text-stone-400 hover:text-rose-600" />
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isPlayingCorrection) onStopText?.()
                                else onPlayText?.(correction.suggested!)
                              }}
                              title="添削文の発音を聞く"
                              aria-label="添削文の発音を聞く"
                              className={`p-1 rounded-md cursor-pointer ${
                                isPlayingCorrection
                                  ? 'bg-rose-500 text-white'
                                  : 'text-stone-400 hover:text-rose-600'
                              }`}
                            >
                              {isPlayingCorrection ? (
                                <StopCircleIcon className="w-3.5 h-3.5" />
                              ) : (
                                <SpeakerIcon className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </span>
                        </div>
                      )}
                      {correction.ja && (
                        <p className="vn-meta text-stone-500 leading-normal m-0">{correction.ja}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isComplete && showSampleReplies && message?.sampleReplies && message.sampleReplies.length > 0 && (
                <SampleReplyPanel
                  sampleReplies={message.sampleReplies}
                  playingText={playingText}
                  onPlayText={onPlayText}
                  onStopText={onStopText}
                  enableToneColoring={enableToneColoring}
                  compact
                />
              )}

              {/* 送りマーカー */}
              {isComplete && (
                <div className="flex justify-end">
                  <span className="vn-tick text-rose-400 text-xs">▼</span>
                </div>
              )}
            </div>
          ) : (
            <p className="vn-ja text-stone-500 m-0 py-2">
              下の入力欄から話しかけてみましょう。日本語や片言でも大丈夫です。
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
