import { useState, useMemo, useEffect } from 'react'
import type { VocabularyItem } from '../types'
import {
  CloseIcon,
  SparklesIcon,
  SpeakerIcon,
  StopCircleIcon,
  CheckIcon,
  RotateCwIcon,
  BookOpenIcon,
} from './Icons'
import { speakChinese, stopSpeaking } from '../services/speech'
import { TonePinyin } from './TonePinyin'

interface ReviewModalProps {
  isOpen: boolean
  onClose: () => void
  vocabularyList: VocabularyItem[]
  onToggleMastered: (id: string) => void
  onUpdateVocabularyItem?: (item: VocabularyItem) => void
}

type ReviewMode = 'flashcard' | 'quiz'

export function ReviewModal({
  isOpen,
  onClose,
  vocabularyList,
  onToggleMastered,
}: ReviewModalProps) {
  const [mode, setMode] = useState<ReviewMode>('flashcard')
  const [filterMode, setFilterMode] = useState<'unmastered' | 'all'>('unmastered')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [showPinyinOnFront, setShowPinyinOnFront] = useState(true)
  const [playingTerm, setPlayingTerm] = useState<string | null>(null)

  // クイズ用状態
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [quizScore, setQuizScore] = useState(0)
  const [isQuizCompleted, setIsQuizCompleted] = useState(false)

  // 復習対象の単語リスト
  const targetList = useMemo(() => {
    let list =
      filterMode === 'unmastered'
        ? vocabularyList.filter((v) => !v.mastered)
        : [...vocabularyList]
    // 未習得が0件なら全単語を対象にするフォールバック
    if (list.length === 0 && vocabularyList.length > 0) {
      list = [...vocabularyList]
    }
    return list
  }, [vocabularyList, filterMode])

  // モーダルが開いた時やフィルター変更時にインデックス等をリセット
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0)
      setIsFlipped(false)
      setSelectedOption(null)
      setQuizScore(0)
      setIsQuizCompleted(false)
    }
  }, [isOpen, filterMode, mode])

  const currentItem: VocabularyItem | undefined = targetList[currentIndex]

  // クイズ用の4択肢生成
  const quizOptions = useMemo(() => {
    if (!currentItem || targetList.length < 2) return []
    const correctAnswer = currentItem.ja

    // 他の単語からダミーの選択肢を抽出（シャッフル）
    const otherAnswers = vocabularyList
      .filter((v) => v.id !== currentItem.id && v.ja !== correctAnswer)
      .map((v) => v.ja)

    // 重複除去
    const uniqueOthers = Array.from(new Set(otherAnswers)).sort(() => Math.random() - 0.5)
    const dummyCount = Math.min(3, uniqueOthers.length)
    const picked = uniqueOthers.slice(0, dummyCount)

    const all = [correctAnswer, ...picked].sort(() => Math.random() - 0.5)
    return all
  }, [currentItem, targetList, vocabularyList])

  // 音声再生
  const handlePlayAudio = (term: string) => {
    if (playingTerm === term) {
      stopSpeaking()
      setPlayingTerm(null)
      return
    }
    stopSpeaking()
    setPlayingTerm(term)
    speakChinese(term, undefined, {
      onEnd: () => setPlayingTerm(null),
      onError: () => setPlayingTerm(null),
    })
  }

  // フラッシュカード操作
  const handleNextCard = (markAsMastered?: boolean) => {
    if (!currentItem) return
    stopSpeaking()
    setPlayingTerm(null)

    if (markAsMastered && !currentItem.mastered) {
      onToggleMastered(currentItem.id)
    }

    if (currentIndex + 1 < targetList.length) {
      setCurrentIndex((prev) => prev + 1)
      setIsFlipped(false)
    } else {
      setIsQuizCompleted(true)
    }
  }

  // クイズ回答処理
  const handleSelectQuizOption = (option: string) => {
    if (selectedOption !== null || !currentItem) return
    setSelectedOption(option)

    const isCorrect = option === currentItem.ja
    if (isCorrect) {
      setQuizScore((prev) => prev + 1)
      if (!currentItem.mastered) {
        onToggleMastered(currentItem.id)
      }
    }

    // 1.2秒後に次の問題へ
    setTimeout(() => {
      setSelectedOption(null)
      if (currentIndex + 1 < targetList.length) {
        setCurrentIndex((prev) => prev + 1)
      } else {
        setIsQuizCompleted(true)
      }
    }, 1200)
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setIsFlipped(false)
    setSelectedOption(null)
    setQuizScore(0)
    setIsQuizCompleted(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col border border-stone-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-stone-150 flex items-center justify-between bg-gradient-to-r from-rose-50/70 via-white to-amber-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-sm">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 m-0">語彙の復習</h2>
              <p className="text-xs text-stone-500 m-0">学んだ表現を定着させる</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* コントロール（モード切替） */}
        <div className="p-4 border-b border-stone-150 flex items-center justify-between bg-stone-50/50">
          {/* モードトグル */}
          <div className="flex items-center gap-1 bg-stone-200/60 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setMode('flashcard')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                mode === 'flashcard'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              カード
            </button>
            <button
              type="button"
              onClick={() => setMode('quiz')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                mode === 'quiz'
                  ? 'bg-white text-rose-700 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              4択クイズ
            </button>
          </div>

          {/* 対象単語フィルター */}
          <div className="flex items-center gap-2 text-xs">
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as 'unmastered' | 'all')}
              className="bg-white border border-stone-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-700 focus:outline-none"
            >
              <option value="unmastered">未習得の単語</option>
              <option value="all">登録済みの全単語</option>
            </select>
          </div>
        </div>

        {/* メインエリア */}
        <div className="p-5 sm:p-6 min-h-[340px] flex flex-col justify-center">
          {targetList.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-300">
                <BookOpenIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-stone-700 m-0">復習する単語がありません</p>
              <p className="text-xs text-stone-400 max-w-xs mx-auto m-0">
                会話の中で新しい単語や添削文を語彙帳に保存すると、ここで復習できます。
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-rose-500 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-rose-600 transition-colors"
              >
                会話に戻る
              </button>
            </div>
          ) : isQuizCompleted ? (
            /* 完了リザルトカード */
            <div className="text-center py-6 space-y-4 animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-400 to-rose-500 flex items-center justify-center text-white mx-auto shadow-md">
                <SparklesIcon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900 m-0">復習セッション完了！</h3>
                <p className="text-xs text-stone-500 mt-1 m-0">お疲れさまでした！よく頑張りました。</p>
              </div>

              {mode === 'quiz' && (
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 inline-block px-8">
                  <span className="text-xs text-stone-500 block">スコア</span>
                  <span className="text-3xl font-extrabold text-rose-600">
                    {quizScore} <span className="text-sm text-stone-400 font-normal">/ {targetList.length}</span>
                  </span>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRestart}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-stone-200 bg-white font-bold text-xs text-stone-700 hover:bg-stone-50 transition-all cursor-pointer shadow-2xs"
                >
                  <RotateCwIcon className="w-4 h-4 text-stone-500" />
                  <span>もう一度復習</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold text-xs shadow-sm hover:brightness-105 transition-all cursor-pointer"
                >
                  完了
                </button>
              </div>
            </div>
          ) : mode === 'flashcard' && currentItem ? (
            /* フラッシュカードモード */
            <div className="space-y-4">
              {/* プログレスバー */}
              <div className="flex items-center justify-between text-xs text-stone-400 mb-1">
                <span>
                  カード <strong className="text-stone-700">{currentIndex + 1}</strong> / {targetList.length}
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] text-stone-500">
                  <input
                    type="checkbox"
                    checked={showPinyinOnFront}
                    onChange={(e) => setShowPinyinOnFront(e.target.checked)}
                    className="rounded text-rose-500 focus:ring-rose-400"
                  />
                  <span>ピンインを常に表示</span>
                </label>
              </div>

              <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-rose-500 to-amber-500 h-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / targetList.length) * 100}%` }}
                />
              </div>

              {/* カード本体 */}
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className={`min-h-[190px] p-6 rounded-3xl border-2 cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-center relative select-none shadow-sm ${
                  isFlipped
                    ? 'bg-gradient-to-b from-amber-50/50 to-white border-amber-300/80 shadow-amber-100/50'
                    : 'bg-gradient-to-b from-rose-50/30 to-white border-rose-200/80 hover:border-rose-300'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 absolute top-3 left-4">
                  {isFlipped ? '裏面 (意味)' : '表面 (中国語)'}
                </span>

                {/* 音声再生ボタン */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlayAudio(currentItem.term)
                  }}
                  title="発音を聞く"
                  className="absolute top-3 right-3 p-2 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  {playingTerm === currentItem.term ? (
                    <StopCircleIcon className="w-5 h-5 text-rose-500 animate-pulse" />
                  ) : (
                    <SpeakerIcon className="w-5 h-5" />
                  )}
                </button>

                {/* 中国語 */}
                <h3
                  lang="zh-CN"
                  className="font-chinese text-3xl sm:text-4xl font-bold text-stone-900 m-0 mb-1"
                >
                  {currentItem.term}
                </h3>

                {/* ピンイン */}
                {(showPinyinOnFront || isFlipped) && currentItem.pinyin && (
                  <div className="mb-2">
                    <TonePinyin
                      pinyin={currentItem.pinyin}
                      className="text-sm sm:text-base text-stone-600 font-medium"
                    />
                  </div>
                )}

                {/* 裏面の内容 */}
                {isFlipped ? (
                  <div className="mt-2 pt-2 border-t border-amber-200/70 w-full animate-fade-in">
                    <p className="text-base sm:text-lg font-bold text-stone-800 m-0">
                      {currentItem.ja}
                    </p>
                    {currentItem.hskLevel && (
                      <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        HSK {currentItem.hskLevel} 級
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-stone-400 mt-3 m-0 flex items-center gap-1">
                    <span>タップして裏面を確認</span>
                  </p>
                )}
              </div>

              {/* カード下部アクションボタン */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleNextCard(false)}
                  className="py-3 rounded-2xl border border-stone-200 bg-white font-bold text-xs text-stone-700 hover:bg-stone-50 transition-all cursor-pointer shadow-2xs"
                >
                  まだ覚えない
                </button>
                <button
                  type="button"
                  onClick={() => handleNextCard(true)}
                  className="py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs hover:brightness-105 transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <CheckIcon className="w-4 h-4" />
                  <span>覚えた！</span>
                </button>
              </div>
            </div>
          ) : mode === 'quiz' && currentItem ? (
            /* 4択クイズモード */
            <div className="space-y-4">
              {/* プログレス */}
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>
                  問題 <strong className="text-stone-700">{currentIndex + 1}</strong> / {targetList.length}
                </span>
                <span className="text-rose-600 font-bold">正解数: {quizScore}</span>
              </div>

              <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-rose-500 to-amber-500 h-full transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / targetList.length) * 100}%` }}
                />
              </div>

              {/* 問題カード */}
              <div className="p-5 rounded-2xl bg-stone-50 border border-stone-200 text-center relative">
                <button
                  type="button"
                  onClick={() => handlePlayAudio(currentItem.term)}
                  title="発音を聞く"
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-stone-100 transition-colors"
                >
                  {playingTerm === currentItem.term ? (
                    <StopCircleIcon className="w-4 h-4 text-rose-500 animate-pulse" />
                  ) : (
                    <SpeakerIcon className="w-4 h-4" />
                  )}
                </button>

                <span className="text-[11px] text-stone-400 font-semibold block mb-1">
                  正しい日本語の意味を選んでください
                </span>
                <h3 lang="zh-CN" className="font-chinese text-2xl sm:text-3xl font-bold text-stone-900 m-0">
                  {currentItem.term}
                </h3>
                {currentItem.pinyin && (
                  <div className="mt-1">
                    <TonePinyin
                      pinyin={currentItem.pinyin}
                      className="text-xs text-stone-600"
                    />
                  </div>
                )}
              </div>

              {/* 4択肢ボタン */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {quizOptions.map((opt, idx) => {
                  const isSelected = selectedOption === opt
                  const isCorrectAnswer = opt === currentItem.ja
                  let btnStyle = 'bg-white border-stone-200 text-stone-800 hover:border-rose-300 hover:bg-rose-50/40'

                  if (selectedOption !== null) {
                    if (isCorrectAnswer) {
                      btnStyle = 'bg-emerald-500 border-emerald-600 text-white font-bold shadow-xs'
                    } else if (isSelected) {
                      btnStyle = 'bg-rose-500 border-rose-600 text-white font-bold'
                    } else {
                      btnStyle = 'bg-stone-100 border-stone-200 text-stone-400 opacity-60'
                    }
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={selectedOption !== null}
                      onClick={() => handleSelectQuizOption(opt)}
                      className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-medium transition-all text-left flex items-center justify-between cursor-pointer ${btnStyle}`}
                    >
                      <span className="truncate mr-2">{opt}</span>
                      {selectedOption !== null && isCorrectAnswer && (
                        <CheckIcon className="w-4 h-4 text-white flex-shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-stone-150 bg-stone-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            復習を終了
          </button>
        </div>
      </div>
    </div>
  )
}
