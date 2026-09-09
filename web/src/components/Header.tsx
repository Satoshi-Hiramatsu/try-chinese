import { useEffect, useRef, useState } from 'react'
import type { ViewMode } from '../services/storage'
import {
  UsersIcon, SparklesIcon, SettingsIcon, TrashIcon, BookOpenIcon,
  SpeakerIcon, UserIcon, MessageSquareIcon, ChevronDownIcon,
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

const actionClass = 'header-menu-item flex items-center gap-2 rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer whitespace-nowrap'

export function Header({
  hskLevel, onHskChange, hasApiKey, onOpenApiKeyModal, onClearHistory,
  onOpenOnboarding, onOpenFriendList, onOpenVocabulary, vocabularyCount = 0,
  autoPlayTts = false, onToggleAutoPlayTts, toneColoring = false,
  onToggleToneColoring, viewMode = 'novel', onChangeViewMode,
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))
  const menuRef = useRef<HTMLDivElement>(null)
  const fullscreenSupported = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function'

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    const handlePointerDown = (event: PointerEvent) => {
      if (isMenuOpen && !menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMenuOpen])

  const runAndClose = (action: () => void) => {
    setIsMenuOpen(false)
    action()
  }

  const toggleFullscreen = async () => {
    setIsMenuOpen(false)
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      // 拒否・非対応時も通常表示とPWA表示はそのまま利用できる。
    }
  }

  const secondaryActions = (menu: boolean) => (
    <>
      {onOpenFriendList && <button type="button" onClick={() => menu ? runAndClose(onOpenFriendList) : onOpenFriendList()} className={actionClass}><UsersIcon className="w-4 h-4" /><span>友達</span></button>}
      {onOpenVocabulary && <button type="button" onClick={() => menu ? runAndClose(onOpenVocabulary) : onOpenVocabulary()} className={actionClass}><BookOpenIcon className="w-4 h-4 text-rose-500" /><span>語彙</span>{vocabularyCount > 0 && <span className="px-1.5 bg-rose-500 text-white rounded-full text-[10px] font-bold">{vocabularyCount}</span>}</button>}
      <button type="button" onClick={() => menu ? runAndClose(onOpenOnboarding) : onOpenOnboarding()} className={actionClass}><SparklesIcon className="w-4 h-4 text-amber-500" /><span>趣味</span></button>
      {onToggleAutoPlayTts && <button type="button" onClick={() => menu ? runAndClose(onToggleAutoPlayTts) : onToggleAutoPlayTts()} aria-pressed={autoPlayTts} className={`${actionClass} ${autoPlayTts ? 'bg-rose-100 border-rose-300 text-rose-700' : ''}`}><SpeakerIcon className="w-4 h-4" /><span>{autoPlayTts ? '音声ON' : '音声OFF'}</span></button>}
      {onToggleToneColoring && <button type="button" onClick={() => menu ? runAndClose(onToggleToneColoring) : onToggleToneColoring()} aria-pressed={toneColoring} className={`${actionClass} ${toneColoring ? 'bg-amber-100 border-amber-300 text-amber-800' : ''}`}><span className="font-mono text-xs font-bold">ā/a</span><span>声調カラー{toneColoring ? 'ON' : 'OFF'}</span></button>}
      <button type="button" onClick={() => menu ? runAndClose(onOpenApiKeyModal) : onOpenApiKeyModal()} className={actionClass}><SettingsIcon className="w-4 h-4" /><span>設定</span>{hasApiKey && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="ブラウザAPIキー設定済み" />}</button>
      {fullscreenSupported && <button type="button" onClick={() => void toggleFullscreen()} className={actionClass} aria-pressed={isFullscreen}><span>{isFullscreen ? '全画面を終了' : '全画面で表示'}</span></button>}
      <button type="button" onClick={() => menu ? runAndClose(onClearHistory) : onClearHistory()} className={`${actionClass} text-rose-700`}><TrashIcon className="w-4 h-4" /><span>会話履歴を削除</span></button>
    </>
  )

  return (
    <header className="app-header w-full max-w-[1920px] flex items-center border-b border-rose-200/60 flex-shrink-0">
      <div className="app-brand flex items-center flex-shrink min-w-0">
        <div className="app-logo rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white font-bold shadow-md shadow-rose-500/20 flex-shrink-0"><span className="font-chinese">中</span></div>
        <h1 className="app-title font-bold tracking-tight text-stone-900 m-0 leading-tight truncate">しゃべチャイナ</h1>
      </div>

      <div className="header-primary ml-auto flex items-center min-w-0">
        {onChangeViewMode && (
          <div className="view-switch flex items-center gap-0.5 p-0.5 bg-stone-100 rounded-full border border-stone-200 flex-shrink-0" role="group" aria-label="画面モードの切り替え">
            <button type="button" onClick={() => onChangeViewMode('novel')} aria-pressed={viewMode === 'novel'} title="ノベル画面" className={`flex items-center gap-1 rounded-full text-[11px] font-bold cursor-pointer whitespace-nowrap ${viewMode === 'novel' ? 'bg-white text-rose-600 shadow-2xs' : 'text-stone-500 hover:text-stone-800'}`}><UserIcon className="w-3.5 h-3.5" /><span className="mode-label">ノベル</span></button>
            <button type="button" onClick={() => onChangeViewMode('chat')} aria-pressed={viewMode === 'chat'} title="チャット画面" className={`flex items-center gap-1 rounded-full text-[11px] font-bold cursor-pointer whitespace-nowrap ${viewMode === 'chat' ? 'bg-white text-rose-600 shadow-2xs' : 'text-stone-500 hover:text-stone-800'}`}><MessageSquareIcon className="w-3.5 h-3.5" /><span className="mode-label">チャット</span></button>
          </div>
        )}

        <label className="hsk-selector flex items-center gap-1 bg-white/95 rounded-full border border-rose-200/80 shadow-2xs whitespace-nowrap flex-shrink-0"><span className="text-[11px] font-semibold text-stone-600">HSK:</span><select value={hskLevel} onChange={(event) => onHskChange(Number(event.target.value))} aria-label="HSKレベル設定" className="text-xs font-bold text-rose-600 bg-transparent border-none outline-none cursor-pointer">{[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>{level} 級</option>)}</select></label>

        <div ref={menuRef} className="header-menu-wrap relative xl:hidden flex-shrink-0">
          <button type="button" onClick={() => setIsMenuOpen((open) => !open)} aria-expanded={isMenuOpen} aria-controls="header-more-menu" className="header-more flex items-center rounded-full border border-stone-200 bg-white text-stone-700 font-bold shadow-2xs"><span>その他</span><ChevronDownIcon className={`w-3.5 h-3.5 ${isMenuOpen ? 'rotate-180' : ''}`} /></button>
          {isMenuOpen && <div id="header-more-menu" aria-label="その他の操作" className="header-menu absolute right-0 top-[calc(100%+0.35rem)] z-50 grid min-w-48 rounded-2xl border border-stone-200 bg-white/98 p-2 shadow-xl backdrop-blur-md">{secondaryActions(true)}</div>}
        </div>
        <div className="header-secondary hidden xl:flex items-center gap-1.5">{secondaryActions(false)}</div>
      </div>
    </header>
  )
}
