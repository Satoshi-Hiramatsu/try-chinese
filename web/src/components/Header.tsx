import type { ViewMode } from '../services/storage'
import {
  UsersIcon,
  SparklesIcon,
  SettingsIcon,
  TrashIcon,
  BookOpenIcon,
  SpeakerIcon,
  UserIcon,
  MessageSquareIcon,
} from './Icons'

interface HeaderProps {
  hskLevel: number
  onHskChange: (level: number) => void
  hasApiKey: boolean
  onOpenApiKeyModal: () => void
  onClearHistory: () => void
  onOpenOnboarding: () => void
  onOpenFriendList?: () => void
  onOpenVocabulary?: () => void
  vocabularyCount?: number
  autoPlayTts?: boolean
  onToggleAutoPlayTts?: () => void
  toneColoring?: boolean
  onToggleToneColoring?: () => void
  viewMode?: ViewMode
  onChangeViewMode?: (mode: ViewMode) => void
}

export function Header({
  hskLevel,
  onHskChange,
  hasApiKey,
  onOpenApiKeyModal,
  onClearHistory,
  onOpenOnboarding,
  onOpenFriendList,
  onOpenVocabulary,
  vocabularyCount = 0,
  autoPlayTts = false,
  onToggleAutoPlayTts,
  toneColoring = false,
  onToggleToneColoring,
  viewMode = 'novel',
  onChangeViewMode,
}: HeaderProps) {
  return (
    <header className="w-full max-w-[1920px] flex items-center justify-between py-2 px-1 sm:px-0 border-b border-rose-200/60 gap-2 flex-shrink-0">
      {/* App Logo & Title */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-rose-500/20 flex-shrink-0">
          <span className="font-chinese">中</span>
        </div>
        <div className="flex flex-col justify-center">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-stone-900 m-0 leading-tight">
            しゃべチャイナ
          </h1>
          <p className="text-[11px] text-stone-500 m-0 hidden lg:block leading-none mt-0.5">
            趣味の合う外国人の友達と、中国語で話す
          </p>
        </div>
      </div>

      {/* Action Buttons & Toggles */}
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
        {/* View Mode Switch (ノベル / チャット) */}
        {onChangeViewMode && (
          <div
            className="flex items-center gap-0.5 p-0.5 bg-stone-100 rounded-full border border-stone-200 flex-shrink-0"
            role="group"
            aria-label="画面モードの切り替え"
          >
            <button
              type="button"
              onClick={() => onChangeViewMode('novel')}
              aria-pressed={viewMode === 'novel'}
              title="ノベル画面（立ち絵で会話）"
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'novel'
                  ? 'bg-white text-rose-600 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ノベル</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('chat')}
              aria-pressed={viewMode === 'chat'}
              title="チャット画面（履歴を一覧で確認）"
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                viewMode === 'chat'
                  ? 'bg-white text-rose-600 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <MessageSquareIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">チャット</span>
            </button>
          </div>
        )}

        {/* HSK Selector */}
        <div className="flex items-center gap-1 bg-white/95 px-2.5 py-1 rounded-full border border-rose-200/80 shadow-2xs whitespace-nowrap flex-shrink-0">
          <span className="text-[11px] font-semibold text-stone-600">HSK:</span>
          <select
            value={hskLevel}
            onChange={(e) => onHskChange(Number(e.target.value))}
            aria-label="HSKレベル設定"
            className="text-xs font-bold text-rose-600 bg-transparent border-none outline-none cursor-pointer pr-0.5"
          >
            {[1, 2, 3, 4, 5, 6].map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl} 級
              </option>
            ))}
          </select>
        </div>

        {/* Friend List Modal Button */}
        {onOpenFriendList && (
          <button
            type="button"
            onClick={onOpenFriendList}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/95 text-stone-700 border border-stone-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors shadow-2xs cursor-pointer whitespace-nowrap flex-shrink-0"
            title="友達を切り替え・作成"
          >
            <UsersIcon className="w-3.5 h-3.5 text-stone-500" />
            <span className="hidden md:inline">友達</span>
          </button>
        )}

        {/* Vocabulary Modal Button */}
        {onOpenVocabulary && (
          <button
            type="button"
            onClick={onOpenVocabulary}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/95 text-stone-700 border border-stone-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors shadow-2xs cursor-pointer relative whitespace-nowrap flex-shrink-0"
            title="語彙帳・復習"
          >
            <BookOpenIcon className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden md:inline">語彙</span>
            {vocabularyCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold leading-tight ml-0.5">
                {vocabularyCount}
              </span>
            )}
          </button>
        )}

        {/* Onboarding Wizard Button */}
        <button
          type="button"
          onClick={onOpenOnboarding}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/95 text-stone-700 border border-stone-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-colors shadow-2xs cursor-pointer whitespace-nowrap flex-shrink-0"
          title="趣味とHSK設定ウィザード"
        >
          <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
          <span className="hidden md:inline">趣味</span>
        </button>

        {/* Auto Play TTS Toggle Button */}
        {onToggleAutoPlayTts && (
          <button
            type="button"
            onClick={onToggleAutoPlayTts}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors shadow-2xs cursor-pointer whitespace-nowrap flex-shrink-0 ${
              autoPlayTts
                ? 'bg-rose-100 text-rose-700 border-rose-300 font-semibold'
                : 'bg-white/95 text-stone-400 border-stone-200 hover:text-stone-600'
            }`}
            title={autoPlayTts ? '返答の自動読み上げ: ON（クリックでOFF）' : '返答の自動読み上げ: OFF（クリックでON）'}
          >
            <SpeakerIcon className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden sm:inline">{autoPlayTts ? '音声ON' : '音声OFF'}</span>
          </button>
        )}

        {/* Tone Coloring Toggle Button */}
        {onToggleToneColoring && (
          <button
            type="button"
            onClick={onToggleToneColoring}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors shadow-2xs cursor-pointer whitespace-nowrap flex-shrink-0 ${
              toneColoring
                ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
                : 'bg-white/95 text-stone-400 border-stone-200 hover:text-stone-600'
            }`}
            title={toneColoring ? 'ピンイン声調カラー: ON（クリックでOFF）' : 'ピンイン声調カラー: OFF（クリックでON）'}
          >
            <span className="font-mono text-[11px] font-bold">ā/a</span>
            <span className="text-[11px] hidden sm:inline">{toneColoring ? '色分ON' : '色分OFF'}</span>
          </button>
        )}

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenApiKeyModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-white/95 text-stone-700 border-stone-200 hover:bg-stone-50 transition-colors shadow-2xs cursor-pointer whitespace-nowrap flex-shrink-0"
          title="AIモデル・キー設定"
        >
          <SettingsIcon className="w-3.5 h-3.5 text-stone-500" />
          <span className="hidden sm:inline">設定</span>
          {hasApiKey && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="ブラウザAPIキー設定済み" />
          )}
        </button>

        {/* Clear History Button */}
        <button
          type="button"
          onClick={onClearHistory}
          className="p-1.5 text-stone-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors cursor-pointer flex items-center justify-center flex-shrink-0"
          title="会話履歴をクリア"
        >
          <TrashIcon className="w-4 h-4 text-stone-400 hover:text-rose-500 transition-colors" />
        </button>
      </div>
    </header>
  )
}
