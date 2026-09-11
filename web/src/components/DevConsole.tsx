import { useState } from 'react'
import type { Friend } from '../types'
import type { FriendProfile } from '../data/friendProfile'
import { SttDebugPane } from './SttDebugPane'
import { LlmDebugPane } from './LlmDebugPane'
import { CharacterAdminPane } from './CharacterAdminPane'
import '../styles/devConsole.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** TTS の検証は既存のモーダルをそのまま使う。ここからは開くだけ。 */
  onOpenTtsDebug: () => void
  friends: readonly Friend[]
  currentFriend: Friend
  hskLevel: number
  /** キャラクターモード: プロフィールの保存・リセット、声質編集、会話相手の切り替え。 */
  onSaveProfile: (friendId: string, profile: FriendProfile) => void
  onResetProfile: (friendId: string) => void
  onEditVoice: (friend: Friend) => void
  onSelectFriend: (friend: Friend) => void
}

type DevTab = 'character' | 'stt' | 'llm' | 'tts'

const TAB_LABELS: Record<DevTab, string> = {
  character: 'キャラクター',
  stt: 'STT 比較',
  llm: 'LLM 比較',
  tts: 'TTS 比較',
}

/**
 * 開発者モード（#dev）。
 *
 * 既定モデルを決めた以上、それが最良かを測り続けられる場所が要る。
 * STT・LLM・TTS の三段を同じ土俵で比較するための画面をここに集める。
 * キャラクターの立ち絵・声・プロフィールを俯瞰して直すキャラクターモードもここに置く。
 * 通常の設定画面からは辿れないようにし、URLハッシュだけを入口にする。
 */
export function DevConsole({
  isOpen,
  onClose,
  onOpenTtsDebug,
  friends,
  currentFriend,
  hskLevel,
  onSaveProfile,
  onResetProfile,
  onEditVoice,
  onSelectFriend,
}: Props) {
  const [tab, setTab] = useState<DevTab>('character')

  if (!isOpen) return null

  return (
    <div className={'dev-console'} role={'dialog'} aria-modal={'true'} aria-labelledby={'dev-console-title'}>
      <header className={'dev-console-header'}>
        <div>
          <h1 id={'dev-console-title'}>開発者モード</h1>
          <p>キャラクターの立ち絵・声・プロフィールを確認して直し、STT・LLM・TTS を同じ条件で比較します。</p>
        </div>
        <button type={'button'} onClick={onClose}>閉じる</button>
      </header>

      <nav className={'dev-console-tabs'}>
        {(['character', 'stt', 'llm', 'tts'] as const).map((item) => (
          <button key={item} type={'button'} data-active={tab === item} onClick={() => setTab(item)}>
            {TAB_LABELS[item]}
          </button>
        ))}
      </nav>

      <main className={'dev-console-body'}>
        {tab === 'character' ? (
          <CharacterAdminPane
            friends={friends}
            currentFriend={currentFriend}
            onSaveProfile={onSaveProfile}
            onResetProfile={onResetProfile}
            onEditVoice={onEditVoice}
            onSelectFriend={onSelectFriend}
          />
        ) : null}
        {tab === 'stt' ? <SttDebugPane /> : null}
        {tab === 'llm' ? (
          <LlmDebugPane friends={friends} currentFriend={currentFriend} hskLevel={hskLevel} />
        ) : null}
        {tab === 'tts' ? (
          <div className={'dev-console-placeholder'}>
            <p style={{ marginTop: 0 }}>TTS の比較は既存の検証モーダルを使います。</p>
            <button type={'button'} className={'tts-debug-launch'} onClick={onOpenTtsDebug}>
              TTSモデル検証を開く
            </button>
          </div>
        ) : null}
      </main>
    </div>
  )
}
