import { UsersIcon, SparklesIcon, SettingsIcon, TrashIcon, BookOpenIcon, SpeakerIcon } from './Icons'

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
}: HeaderProps) {
  return (
    <header className="w-full max-w-3xl flex items-center justify-between py-3 px-2 sm:px-0 border-b border-rose-200/60">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-rose-500/20">
          <span className="font-chinese">中</span>
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900 m-0 flex items-center gap-2">
            しゃべチャイナ
          </h1>
          <p className="text-xs text-stone-500 m-0">趣味の合う外国人の友達と、中国語で話す</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* HSK Selector */}
        <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full border border-rose-200/70 shadow-xs">
          <span className="text-xs font-semibold text-stone-600">HSK:</span>
          <select
            value={hskLevel}
            onChange={(e) => onHskChange(Number(e.target.value))}
            aria-label="HSKレベル設定"
            className="text-xs font-bold text-rose-600 bg-transparent border-none outline-none cursor-pointer pr-1"
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/90 text-stone-700 border border-stone-200 hover:bg-stone-50 transition-colors shadow-xs cursor-pointer"
            title="友達を切り替え・作成"
          >
            <UsersIcon className="w-3.5 h-3.5 text-stone-500" />
            <span className="hidden md:inline">友達切替</span>
          </button>
        )}

        {/* Vocabulary Modal Button */}
        {onOpenVocabulary && (
          <button
            type="button"
            onClick={onOpenVocabulary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/90 text-stone-700 border border-stone-200 hover:bg-stone-50 transition-colors shadow-xs cursor-pointer relative"
            title="語彙帳・復習"
          >
            <BookOpenIcon className="w-3.5 h-3.5 text-rose-500" />
            <span className="hidden md:inline">語彙帳</span>
            {vocabularyCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px] font-bold leading-tight">
                {vocabularyCount}
              </span>
            )}
          </button>
        )}

        {/* Onboarding Wizard Button */}
        <button
          type="button"
          onClick={onOpenOnboarding}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/90 text-stone-700 border border-stone-200 hover:bg-stone-50 transition-colors shadow-xs cursor-pointer"
          title="趣味とHSK設定ウィザード"
        >
          <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
          <span className="hidden md:inline">趣味設定</span>
        </button>

        {/* Auto Play TTS Toggle Button */}
        {onToggleAutoPlayTts && (
          <button
            type="button"
            onClick={onToggleAutoPlayTts}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors shadow-xs cursor-pointer ${
              autoPlayTts
                ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                : 'bg-white/90 text-stone-400 border-stone-200 hover:text-stone-600'
            }`}
            title={autoPlayTts ? '返答の自動読み上げ: ON（クリックでOFF）' : '返答の自動読み上げ: OFF（クリックでON）'}
          >
            <SpeakerIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{autoPlayTts ? '音声:ON' : '音声:OFF'}</span>
          </button>
        )}

        {/* Tone Coloring Toggle Button */}
        {onToggleToneColoring && (
          <button
            type="button"
            onClick={onToggleToneColoring}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors shadow-xs cursor-pointer ${
              toneColoring
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-white/90 text-stone-400 border-stone-200 hover:text-stone-600'
            }`}
            title={toneColoring ? 'ピンイン声調カラー: ON（クリックでOFF）' : 'ピンイン声調カラー: OFF（クリックでON）'}
          >
            <span className="font-mono text-[11px] font-bold">ā/a</span>
            <span className="hidden lg:inline">{toneColoring ? '色分:ON' : '色分:OFF'}</span>
          </button>
        )}

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenApiKeyModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-white/90 text-stone-700 border-stone-200 hover:bg-stone-50 transition-colors shadow-xs cursor-pointer"
          title="AIモデル・キー設定"
        >
          <SettingsIcon className="w-3.5 h-3.5 text-stone-500" />
          <span className="hidden sm:inline">AI設定</span>
          {hasApiKey && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="ブラウザAPIキー設定済み" />
          )}
        </button>

        {/* Clear History Button */}
        <button
          type="button"
          onClick={onClearHistory}
          className="p-2 text-stone-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors cursor-pointer flex items-center justify-center"
          title="会話履歴をクリア"
        >
          <TrashIcon className="w-4 h-4 text-stone-400 hover:text-rose-500 transition-colors" />
        </button>
      </div>
    </header>
  )
}
