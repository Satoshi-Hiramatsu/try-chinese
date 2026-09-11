import { useState } from 'react'
import type { Friend } from '../types'
import { SttDebugPane } from './SttDebugPane'
import { LlmDebugPane } from './LlmDebugPane'
import '../styles/devConsole.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** TTS の検証は既存のモーダルをそのまま使う。ここからは開くだけ。 */
  onOpenTtsDebug: () => void
  friends: readonly Friend[]
  currentFriend: Friend
  hskLevel: number
}

type DevTab = 'stt' | 'llm' | 'tts'

const TAB_LABELS: Record<DevTab, string> = {
  stt: 'STT 比較',
  llm: 'LLM 比較',
  tts: 'TTS 比較',
}

/**
 * 開発者モード（#dev）。
 *
 * 既定モデルを決めた以上、それが最良かを測り続けられる場所が要る。
 * STT・LLM・TTS の三段を同じ土俵で比較するための画面をここに集める。
 * 通常の設定画面からは辿れないようにし、URLハッシュだけを入口にする。
 */
export function DevConsole({ isOpen, onClose, onOpenTtsDebug, friends, currentFriend, hskLevel }: Props) {
  const [tab, setTab] = useState<DevTab>('stt')

  if (!isOpen) return null

  return (
    <div className={'dev-console'} role={'dialog'} aria-modal={'true'} aria-labelledby={'dev-console-title'}>
      <header className={'dev-console-header'}>
        <div>
          <h1 id={'dev-console-title'}>開発者モード</h1>
          <p>STT・LLM・TTS を同じ条件で比較し、既定モデルの妥当性を実測で確かめます。</p>
        </div>
        <button type={'button'} onClick={onClose}>閉じる</button>
      </header>

      <nav className={'dev-console-tabs'}>
        {(['stt', 'llm', 'tts'] as const).map((item) => (
          <button key={item} type={'button'} data-active={tab === item} onClick={() => setTab(item)}>
            {TAB_LABELS[item]}
          </button>
        ))}
      </nav>

      <main className={'dev-console-body'}>
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
