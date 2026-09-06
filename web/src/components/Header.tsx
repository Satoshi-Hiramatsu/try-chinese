interface HeaderProps {
  hskLevel: number
  onHskChange: (level: number) => void
  hasApiKey: boolean
  onOpenApiKeyModal: () => void
  onClearHistory: () => void
  onOpenOnboarding: () => void
  onOpenFriendList?: () => void
}

export function Header({
  hskLevel,
  onHskChange,
  hasApiKey,
  onOpenApiKeyModal,
  onClearHistory,
  onOpenOnboarding,
  onOpenFriendList,
}: HeaderProps) {
  return (
    <header className="w-full max-w-3xl flex items-center justify-between py-3 px-2 sm:px-0 border-b border-rose-200/60">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-rose-500/20">
          中
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
            onClick={onOpenFriendList}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-white/90 text-stone-700 border border-stone-200 hover:bg-stone-50 transition-colors shadow-xs"
            title="友達を切り替え・作成"
          >
            <span>👥</span>
            <span className="hidden md:inline">友達切替</span>
          </button>
        )}

        {/* Onboarding Wizard Button */}
        <button
          onClick={onOpenOnboarding}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-white/90 text-stone-700 border border-stone-200 hover:bg-stone-50 transition-colors shadow-xs"
          title="趣味とHSK設定ウィザード"
        >
          <span>✨</span>
          <span className="hidden md:inline">趣味設定</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenApiKeyModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-white/90 text-stone-700 border-stone-200 hover:bg-stone-50 transition-colors shadow-xs"
          title="AIモデル・キー設定"
        >
          <span>⚙️</span>
          <span className="hidden sm:inline">AI設定</span>
          {hasApiKey && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="ブラウザAPIキー設定済み" />
          )}
        </button>

        {/* Clear History Button */}
        <button
          onClick={onClearHistory}
          className="p-1.5 text-stone-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors"
          title="会話履歴をクリア"
        >
          🗑️
        </button>
      </div>
    </header>
  )
}
