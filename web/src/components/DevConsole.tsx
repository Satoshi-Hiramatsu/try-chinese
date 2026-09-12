import { useEffect, useState } from 'react'
import type { Friend, Voice } from '../types'
import type { FriendProfile } from '../data/friendProfile'
import { SttDebugPane } from './SttDebugPane'
import { LlmDebugPane } from './LlmDebugPane'
import { CharacterAdminPane } from './CharacterAdminPane'
import { VoiceAdminDashboard } from './VoiceAdminDashboard'
import { DevTestModePane } from './DevTestModePane'
import '../styles/devConsole.css'

export type DevTab = 'character' | 'voices' | 'test' | 'stt' | 'llm' | 'tts'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** 開いたときに出すタブ。#admin から来たときは声の管理。 */
  initialTab?: DevTab
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
  /** 声の管理: 1人分の声設定を保存する。 */
  onSaveVoice: (friendId: string, voice: Voice) => void
  /** テストモード: 会話モデルの上書きと、声の上書きの全リセット。 */
  devLlmModel: string | null
  onChangeDevLlmModel: (model: string) => void
  voiceOverrideCount: number
  onResetAllVoices: () => number
}

const TAB_ORDER: readonly DevTab[] = ['character', 'voices', 'test', 'stt', 'llm', 'tts']

const TAB_LABELS: Record<DevTab, string> = {
  character: 'キャラクター',
  voices: '声の管理',
  test: 'テストモード',
  stt: 'STT 比較',
  llm: 'LLM 比較',
  tts: 'TTS 比較',
}

/**
 * 開発者モード（#dev）。
 *
 * 既定モデルを決めた以上、それが最良かを測り続けられる場所が要る。
 * STT・LLM・TTS の三段を同じ土俵で比較するための画面をここに集める。
 * キャラクターの立ち絵・声・プロフィールを俯瞰して直すキャラクターモードと、
 * 全員の話者IDを一覧する声の管理もここに置く。
 * 通常の設定画面からは辿れないようにし、URLハッシュだけを入口にする（#admin は声の管理タブへ転送）。
 */
export function DevConsole({
  isOpen,
  onClose,
  initialTab = 'character',
  onOpenTtsDebug,
  friends,
  currentFriend,
  hskLevel,
  onSaveProfile,
  onResetProfile,
  onEditVoice,
  onSelectFriend,
  onSaveVoice,
  devLlmModel,
  onChangeDevLlmModel,
  voiceOverrideCount,
  onResetAllVoices,
}: Props) {
  const [tab, setTab] = useState<DevTab>(initialTab)

  // #admin で開き直したときなど、入口が変わったら指定のタブへ移る
  useEffect(() => {
    if (isOpen) setTab(initialTab)
  }, [initialTab, isOpen])

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
        {TAB_ORDER.map((item) => (
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
            onOpenVoiceAdmin={() => setTab('voices')}
          />
        ) : null}
        {tab === 'voices' ? (
          <VoiceAdminDashboard friends={[...friends]} onSaveVoice={onSaveVoice} onEditFriend={onEditVoice} />
        ) : null}
        {tab === 'test' ? (
          <DevTestModePane
            devLlmModel={devLlmModel}
            onChangeDevLlmModel={onChangeDevLlmModel}
            voiceOverrideCount={voiceOverrideCount}
            onResetAllVoices={onResetAllVoices}
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
