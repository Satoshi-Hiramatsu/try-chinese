import { useEffect, useState } from 'react'
import { EXPRESSIONS, type Expression, type Friend } from '../types'
import {
  getPortraitImage,
  getPortraitLayer,
  getSceneImage,
  hasPortraitExpressions,
  resolvePortrait,
} from '../data/portraits'
import { CharacterPortrait, EXPRESSION_LABELS } from './CharacterPortrait'
import { SceneBackdrop } from './SceneBackdrop'
import { promptInstall, useInstallMode } from '../services/installPrompt'
import { formatApiKeyStatusNote, type ApiKeyStatus } from '../services/openRouterKey'

/**
 * 起動時のタイトル画面。
 *
 * 画面は1枚だけで、待機（PRESS START）→ メニューの2段階を同じシーン上で切り替える。
 * 最初のタップが「最初のユーザー操作」になるので、全画面化や音声の解錠はここで済む
 * （App 側のシェルが pointerdown で拾う）。
 */

/** 「つづきから」に添える直近セッションの要約 */
export interface ContinueSummary {
  /** 最後にやり取りした時刻（ミリ秒） */
  lastAt: number
  /** ユーザーが話した回数 */
  turns: number
}

interface TitleScreenProps {
  /** 出迎える友達（最後に話した友達） */
  friend: Friend
  /** 直近の会話。無ければ「つづきから」を出さない */
  continueSummary: ContinueSummary | null
  /** オンボーディング未完了。メニューを「はじめる」だけにする */
  isFirstLaunch: boolean
  /** APIキーの状態。メニューの「APIキー」に添える */
  apiKeyStatus: ApiKeyStatus
  onContinue: () => void
  onNewGame: () => void
  onChooseFriend: () => void
  onOpenSettings: () => void
  onOpenApiKey: () => void
  onBegin: () => void
}

type Phase = 'idle' | 'menu'

/** 待機中にときどき差し込む表情。放置していても生きて見える程度にとどめる */
const IDLE_EXPRESSIONS: readonly Expression[] = ['thinking', 'wink', 'smile']
const IDLE_MIN_MS = 8000
const IDLE_RANGE_MS = 6000
const IDLE_HOLD_MS = 2600

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 「3日前」のような相対表記。細かい精度は要らないので分・時間・日で丸める */
function formatRelativeTime(at: number, now = Date.now()): string {
  const diff = Math.max(0, now - at)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}日前`
  const date = new Date(at)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function TitleScreen({
  friend,
  continueSummary,
  isFirstLaunch,
  apiKeyStatus,
  onContinue,
  onNewGame,
  onChooseFriend,
  onOpenSettings,
  onOpenApiKey,
  onBegin,
}: TitleScreenProps) {
  // モーション削減時は待機フェーズ自体を飛ばしてメニューを直接出す
  const [phase, setPhase] = useState<Phase>(() => (prefersReducedMotion() ? 'menu' : 'idle'))
  const [idleExpression, setIdleExpression] = useState<Expression>('neutral')
  // 「アプリとして追加」。Chromium は純正ダイアログ、Safari は手順案内を出す
  const installMode = useInstallMode()
  const [isInstallGuideOpen, setIsInstallGuideOpen] = useState(false)

  const portrait = resolvePortrait(friend)
  const portraitImage = getPortraitImage(portrait.id)
  const layered = hasPortraitExpressions(portrait.id)
  const scene = portrait.scene
  const sceneImage = getSceneImage(scene)

  // 待機中は 8〜14 秒おきに表情をひとつ差し込み、しばらくして通常に戻す
  useEffect(() => {
    if (phase !== 'idle') return
    let holdTimer: number | undefined
    let nextTimer: number | undefined
    const schedule = () => {
      nextTimer = window.setTimeout(() => {
        const pick = IDLE_EXPRESSIONS[Math.floor(Math.random() * IDLE_EXPRESSIONS.length)]
        setIdleExpression(pick)
        holdTimer = window.setTimeout(() => {
          setIdleExpression('neutral')
          schedule()
        }, IDLE_HOLD_MS)
      }, IDLE_MIN_MS + Math.random() * IDLE_RANGE_MS)
    }
    schedule()
    return () => {
      window.clearTimeout(holdTimer)
      window.clearTimeout(nextTimer)
    }
  }, [phase])

  const expression: Expression = phase === 'menu' ? 'smile' : idleExpression
  const isIdle = phase === 'idle'

  const wake = () => {
    if (isIdle) setPhase('menu')
  }

  // 待機中はキーボードでも起こせるようにする
  useEffect(() => {
    if (!isIdle) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setPhase('menu')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isIdle])

  // 名前から英語表記や括弧を取り除いた簡潔な呼び名（例: "王浩 (Wang Hao)" -> "王浩"）
  const shortName = friend.name.replace(/\s*\(.*?\)/g, '').trim() || friend.name

  const apiKeyItem = {
    key: 'apikey',
    label: 'APIキー',
    note: formatApiKeyStatusNote(apiKeyStatus),
    onClick: onOpenApiKey,
  }

  const menuItems = isFirstLaunch
    ? [{ key: 'begin', label: 'はじめる', note: '趣味とレベルをえらぶ', onClick: onBegin }, apiKeyItem]
    : [
        ...(continueSummary
          ? [
              {
                key: 'continue',
                label: 'つづきから',
                note: `${shortName} · ${formatRelativeTime(continueSummary.lastAt)} · ${continueSummary.turns}往復`,
                onClick: onContinue,
              },
            ]
          : []),
        { key: 'new', label: 'はじめから', note: '友達をえらんで新しく話す', onClick: onNewGame },
        { key: 'choose', label: '友達をえらぶ', note: undefined, onClick: onChooseFriend },
        apiKeyItem,
        { key: 'settings', label: 'せってい', note: undefined, onClick: onOpenSettings },
        ...(installMode !== 'unavailable'
          ? [
              {
                key: 'install',
                label: 'アプリとして追加',
                note: 'ホーム画面から直接ひらけるようにする',
                onClick: () => {
                  if (installMode === 'prompt') void promptInstall()
                  else setIsInstallGuideOpen(true)
                },
              },
            ]
          : []),
      ]

  return (
    <section
      className={`title-screen relative w-full h-[100dvh] overflow-hidden scene scene-${scene} ${
        isIdle ? 'title-idle' : 'title-menu'
      }`}
      aria-label="タイトル画面"
      onClick={wake}
    >
      {/* ---------------------------------------------------------------- 背景 */}
      {sceneImage ? (
        <img src={sceneImage} alt="" className="vn-backdrop-img" draggable={false} />
      ) : (
        <SceneBackdrop scene={scene} />
      )}

      {/* ---------------------------------------------------------------- 立ち絵 */}
      <div className="title-figure">
        {layered ? (
          EXPRESSIONS.map((candidate) => (
            <img
              key={candidate}
              src={getPortraitLayer(portrait.id, candidate) || ''}
              alt={candidate === expression ? `${friend.name} の立ち絵（${EXPRESSION_LABELS[candidate]}）` : ''}
              className="vn-portrait-img vn-portrait-layer"
              style={{ opacity: candidate === expression ? 1 : 0 }}
              aria-hidden={candidate === expression ? undefined : true}
              draggable={false}
            />
          ))
        ) : portraitImage ? (
          <img src={portraitImage} alt={`${friend.name} の立ち絵`} className="vn-portrait-img" draggable={false} />
        ) : (
          <div className="absolute inset-0 flex items-end justify-center px-2">
            <CharacterPortrait
              spec={portrait}
              expression={expression}
              crop="bust"
              className="w-full h-full drop-shadow-[0_10px_24px_rgba(60,40,45,0.22)]"
              title={`${friend.name}（${EXPRESSION_LABELS[expression]}）`}
            />
          </div>
        )}
      </div>

      {/* 文字を載せる側だけを暗く落とすスクリム。待機中は全面を薄暗くする */}
      <div className="title-scrim" aria-hidden="true" />
      <div className="title-dim" aria-hidden="true" />

      {/* ---------------------------------------------------------------- ロゴ */}
      <div className="title-logo">
        <h1 className="title-logo-ja font-bold text-white tracking-wide">しゃべチャイナ</h1>
        <p className="title-logo-zh font-chinese text-rose-100/90">说吧，中国</p>
        <p className="title-logo-tag text-white/85">趣味の合う外国人の友達と、中国語で話す。</p>
      </div>

      {/* ---------------------------------------------------------------- 待機 */}
      {isIdle && (
        <button
          type="button"
          className="title-press absolute inset-x-0 mx-auto block w-fit px-6 py-3 text-white/95 text-base sm:text-lg tracking-[0.3em] cursor-pointer bg-transparent"
          onClick={wake}
        >
          ─ タップしてはじめる ─
        </button>
      )}

      {/* ---------------------------------------------------------------- メニュー */}
      {!isIdle && (
        <nav className="title-menu-list" aria-label="スタートメニュー">
          {menuItems.map((item, index) => (
            <button
              key={item.key}
              type="button"
              autoFocus={index === 0}
              className={`title-menu-item${index === 0 ? ' title-menu-item-primary' : ''}`}
              style={{ animationDelay: `${120 + index * 90}ms` }}
              onClick={(event) => {
                event.stopPropagation()
                item.onClick()
              }}
            >
              <span className="title-menu-cursor" aria-hidden="true">
                ▶
              </span>
              <span className="flex flex-col items-start min-w-0">
                <span className="title-menu-label">{item.label}</span>
                {item.note && <span className="title-menu-note truncate">{item.note}</span>}
              </span>
            </button>
          ))}
        </nav>
      )}

      {/* ------------------------------------------------- Safari 向けの追加手順 */}
      {isInstallGuideOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
          onClick={(event) => {
            event.stopPropagation()
            setIsInstallGuideOpen(false)
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white/95 text-stone-800 p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="install-guide-title" className="text-lg font-bold mb-3">
              ホーム画面に追加する
            </h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed">
              <li>
                Safari 下部（iPad は上部）の <span className="font-semibold">共有</span> ボタン
                <span aria-hidden="true"> ⎋ </span>をタップ
              </li>
              <li>
                メニューから <span className="font-semibold">「ホーム画面に追加」</span> をえらぶ
              </li>
              <li>右上の「追加」をタップ</li>
            </ol>
            <p className="mt-3 text-xs text-stone-500">
              ホーム画面のアイコンからひらくと、ブラウザの枠なしで全画面で使えます。
            </p>
            <button
              type="button"
              autoFocus
              className="mt-4 w-full rounded-xl bg-rose-500 text-white py-2.5 font-semibold hover:bg-rose-600"
              onClick={() => setIsInstallGuideOpen(false)}
            >
              とじる
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
