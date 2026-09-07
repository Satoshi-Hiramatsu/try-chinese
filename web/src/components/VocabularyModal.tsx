import { useState, useMemo } from 'react'
import type { VocabularyItem } from '../types'
import {
  CloseIcon,
  BookOpenIcon,
  SpeakerIcon,
  StopCircleIcon,
  CheckIcon,
  TrashIcon,
  SearchIcon,
  PlusIcon,
  SparklesIcon,
} from './Icons'
import { speakChinese, stopSpeaking } from '../services/speech'
import { TonePinyin } from './TonePinyin'

interface VocabularyModalProps {
  isOpen: boolean
  onClose: () => void
  vocabularyList: VocabularyItem[]
  onDeleteItem: (id: string) => void
  onToggleMastered: (id: string) => void
  onAddItem: (item: Omit<VocabularyItem, 'id' | 'createdAt'>) => void
  onStartReview: () => void
}

type FilterType = 'all' | 'unmastered' | 'mastered'

export function VocabularyModal({
  isOpen,
  onClose,
  vocabularyList,
  onDeleteItem,
  onToggleMastered,
  onAddItem,
  onStartReview,
}: VocabularyModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [hskFilter, setHskFilter] = useState<number | 'all'>('all')
  const [playingTerm, setPlayingTerm] = useState<string | null>(null)

  // 手動追加フォーム状態
  const [isAddFormOpen, setIsAddFormOpen] = useState(false)
  const [newTerm, setNewTerm] = useState('')
  const [newPinyin, setNewPinyin] = useState('')
  const [newJa, setNewJa] = useState('')
  const [newHskLevel, setNewHskLevel] = useState<number>(2)

  // 絞り込み
  const filteredList = useMemo(() => {
    return vocabularyList.filter((item) => {
      // 検索フィルター
      const q = searchQuery.trim().toLowerCase()
      if (q) {
        const matchTerm = item.term.toLowerCase().includes(q)
        const matchPinyin = item.pinyin.toLowerCase().includes(q)
        const matchJa = item.ja.toLowerCase().includes(q)
        if (!matchTerm && !matchPinyin && !matchJa) return false
      }

      // 習得状況フィルター
      if (filterType === 'unmastered' && item.mastered) return false
      if (filterType === 'mastered' && !item.mastered) return false

      // HSKフィルター
      if (hskFilter !== 'all' && item.hskLevel !== hskFilter) return false

      return true
    })
  }, [vocabularyList, searchQuery, filterType, hskFilter])

  // 音声再生
  const handlePlay = (term: string) => {
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

  // 手動追加サブミット
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTerm.trim() || !newJa.trim()) return

    onAddItem({
      term: newTerm.trim(),
      pinyin: newPinyin.trim(),
      ja: newJa.trim(),
      hskLevel: newHskLevel,
      source: 'manual',
    })

    setNewTerm('')
    setNewPinyin('')
    setNewJa('')
    setIsAddFormOpen(false)
  }

  if (!isOpen) return null

  const masteredCount = vocabularyList.filter((v) => v.mastered).length
  const unmasteredCount = vocabularyList.length - masteredCount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in">
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-stone-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-stone-150 flex items-center justify-between bg-gradient-to-r from-rose-50/70 via-white to-amber-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-sm">
              <BookOpenIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2 m-0">
                <span>語彙帳</span>
                <span className="font-chinese text-sm font-normal text-stone-500">(生词本)</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold">
                  {vocabularyList.length} 語
                </span>
              </h2>
              <p className="text-xs text-stone-500 m-0 mt-0.5">
                習得済み: <span className="font-semibold text-emerald-600">{masteredCount}</span> / 未習得: <span className="font-semibold text-amber-600">{unmasteredCount}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {vocabularyList.length > 0 && (
              <button
                type="button"
                onClick={onStartReview}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 text-white text-xs font-bold hover:brightness-105 active:scale-95 transition-all shadow-xs cursor-pointer"
                title="フラッシュカードやクイズで復習"
              >
                <SparklesIcon className="w-3.5 h-3.5 text-amber-300" />
                <span>復習する</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              aria-label="閉じる"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* コントロールバー（検索・フィルター・追加） */}
        <div className="p-4 border-b border-stone-150 space-y-3 bg-stone-50/50">
          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* 検索入力 */}
            <div className="relative flex-1">
              <SearchIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="単語・ピンイン・日本語で検索..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 bg-white text-xs focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 新規登録トグルボタン */}
            <button
              type="button"
              onClick={() => setIsAddFormOpen(!isAddFormOpen)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-stone-200 text-stone-700 hover:border-rose-300 hover:text-rose-600 transition-all cursor-pointer shadow-2xs"
            >
              <PlusIcon className="w-4 h-4 text-rose-500" />
              <span>単語を手動登録</span>
            </button>
          </div>

          {/* フィルタータブ */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex items-center gap-1 bg-stone-200/60 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-white text-stone-900 shadow-2xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                すべて ({vocabularyList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('unmastered')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filterType === 'unmastered'
                    ? 'bg-white text-amber-700 shadow-2xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                未習得 ({unmasteredCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('mastered')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filterType === 'mastered'
                    ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                習得済み ({masteredCount})
              </button>
            </div>

            {/* HSKフィルター */}
            <div className="flex items-center gap-1.5 text-stone-500">
              <span className="font-medium">HSK:</span>
              <select
                value={hskFilter}
                onChange={(e) =>
                  setHskFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="bg-white border border-stone-200 rounded-lg px-2 py-1 text-xs font-semibold text-stone-700 focus:outline-none"
              >
                <option value="all">すべて</option>
                {[1, 2, 3, 4, 5, 6].map((lvl) => (
                  <option key={lvl} value={lvl}>
                    HSK {lvl} 級
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 新規追加フォーム（アコーディオン） */}
          {isAddFormOpen && (
            <form
              onSubmit={handleFormSubmit}
              className="p-3.5 bg-white rounded-2xl border border-rose-200/80 shadow-xs space-y-3 animate-fade-in"
            >
              <h3 className="text-xs font-bold text-stone-800 m-0">新しい単語・表現を追加</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1">
                    中国語 (簡体字) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    placeholder="例: 学习"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-chinese font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1">
                    ピンイン
                  </label>
                  <input
                    type="text"
                    value={newPinyin}
                    onChange={(e) => setNewPinyin(e.target.value)}
                    placeholder="例: xuéxí"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-500 mb-1">
                    日本語の意味 *
                  </label>
                  <input
                    type="text"
                    required
                    value={newJa}
                    onChange={(e) => setNewJa(e.target.value)}
                    placeholder="例: 学ぶ、勉強する"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-stone-500 font-medium">HSK目安:</span>
                  <select
                    value={newHskLevel}
                    onChange={(e) => setNewHskLevel(Number(e.target.value))}
                    className="border border-stone-200 rounded px-2 py-1 text-xs"
                  >
                    {[1, 2, 3, 4, 5, 6].map((lvl) => (
                      <option key={lvl} value={lvl}>
                        HSK {lvl} 級
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddFormOpen(false)}
                    className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg shadow-xs cursor-pointer"
                  >
                    登録する
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* 語彙一覧リスト */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-stone-400 space-y-2">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-300">
                <BookOpenIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-stone-600 m-0">
                {vocabularyList.length === 0
                  ? '語彙帳に登録されている単語はありません'
                  : '条件に一致する単語が見つかりませんでした'}
              </p>
              <p className="text-xs text-stone-400 max-w-sm mx-auto m-0">
                {vocabularyList.length === 0
                  ? '会話中のメッセージ下部にある新出表現や、添削アドバイス横のブックマークアイコンを押すと、いつでもここに保存して復習できます。'
                  : '検索ワードやフィルター条件を変更してお試しください。'}
              </p>
            </div>
          ) : (
            filteredList.map((item) => {
              const isPlaying = playingTerm === item.term
              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    item.mastered
                      ? 'bg-stone-50/70 border-stone-200/60 opacity-80'
                      : 'bg-white border-stone-200 shadow-2xs hover:border-rose-200'
                  }`}
                >
                  {/* 単語本体情報 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span
                        lang="zh-CN"
                        className={`font-chinese text-base sm:text-lg font-bold ${
                          item.mastered ? 'text-stone-600 line-through' : 'text-stone-900'
                        }`}
                      >
                        {item.term}
                      </span>
                      {item.pinyin && (
                        <TonePinyin
                          pinyin={item.pinyin}
                          className="text-xs sm:text-sm text-stone-600"
                        />
                      )}
                      {item.hskLevel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-amber-100 text-amber-800">
                          HSK {item.hskLevel}
                        </span>
                      )}
                      {item.source === 'chat_correction' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-rose-50 text-rose-600 border border-rose-200">
                          添削文
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-stone-600 m-0 mt-1 truncate">
                      {item.ja}
                    </p>
                  </div>

                  {/* アクションボタン群 */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* 発音ボタン */}
                    <button
                      type="button"
                      onClick={() => handlePlay(item.term)}
                      title={isPlaying ? '停止' : '発音を聞く'}
                      className={`p-2 rounded-xl transition-all cursor-pointer ${
                        isPlaying
                          ? 'bg-rose-500 text-white animate-pulse'
                          : 'text-stone-400 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                    >
                      {isPlaying ? (
                        <StopCircleIcon className="w-4 h-4" />
                      ) : (
                        <SpeakerIcon className="w-4 h-4" />
                      )}
                    </button>

                    {/* 習得トグルボタン */}
                    <button
                      type="button"
                      onClick={() => onToggleMastered(item.id)}
                      title={item.mastered ? '未習得に戻す' : '習得済みにマーク'}
                      className={`p-2 rounded-xl transition-all cursor-pointer ${
                        item.mastered
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          : 'text-stone-300 hover:text-emerald-600 hover:bg-emerald-50/50'
                      }`}
                    >
                      <CheckIcon className="w-4 h-4" />
                    </button>

                    {/* 削除ボタン */}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`「${item.term}」を語彙帳から削除しますか？`)) {
                          onDeleteItem(item.id)
                        }
                      }}
                      title="削除"
                      className="p-2 rounded-xl text-stone-300 hover:text-rose-500 hover:bg-rose-50 transition-all cursor-pointer"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-3 border-t border-stone-150 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
          <span>
            表示中: <strong className="text-stone-800">{filteredList.length}</strong> 件
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-stone-200 bg-white font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
