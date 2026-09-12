import { useEffect, useState } from 'react'
import { checkApiKey, formatApiKeyStatusNote, type ApiKeyStatus } from '../services/openRouterKey'
import { CheckIcon, ExternalLinkIcon, KeyIcon } from './Icons'

/**
 * OpenRouter API キーの入力欄。設定画面とタイトルの「APIキー」モーダルで共用する。
 *
 * 入力中のキーは保存前に「確認」で検査できる。
 * 保存済みのキーと同じ文字列のあいだは、親が持つ保存済みの状態をそのまま出す。
 */

export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/settings/keys'

const KEY_PREFIX = 'sk-or-v1-'

interface ApiKeyFieldProps {
  value: string
  onChange: (value: string) => void
  /** 保存済みのキー。入力がこれと同じなら savedStatus を表示する。 */
  savedKey: string
  savedStatus: ApiKeyStatus
  autoFocus?: boolean
  /** ラベルを出さない（モーダルの見出しが兼ねる場合）。 */
  hideLabel?: boolean
}

function statusTone(state: ApiKeyStatus['state']): string {
  switch (state) {
    case 'valid':
      return 'text-emerald-700'
    case 'invalid':
    case 'exhausted':
      return 'text-rose-600'
    case 'unreachable':
      return 'text-amber-700'
    default:
      return 'text-stone-500'
  }
}

export function ApiKeyStatusLine({ status, className = '' }: { status: ApiKeyStatus; className?: string }) {
  return (
    <p className={`m-0 text-[11px] flex items-center gap-1 ${statusTone(status.state)} ${className}`} role="status">
      {status.state === 'valid' && <CheckIcon className="w-3.5 h-3.5" />}
      <span>{formatApiKeyStatusNote(status)}</span>
      {status.state === 'valid' && status.label && <span className="text-stone-400">（{status.label}）</span>}
    </p>
  )
}

export function ApiKeyField({ value, onChange, savedKey, savedStatus, autoFocus, hideLabel }: ApiKeyFieldProps) {
  const [isVisible, setIsVisible] = useState(false)
  /** 入力中のキーを検査した結果。入力が変わったら捨てる。 */
  const [draftStatus, setDraftStatus] = useState<ApiKeyStatus | null>(null)

  useEffect(() => {
    setDraftStatus(null)
  }, [value])

  const trimmed = value.trim()
  const isSaved = trimmed === savedKey
  const status: ApiKeyStatus | null = isSaved ? savedStatus : draftStatus
  const looksWrong = trimmed !== '' && !trimmed.startsWith(KEY_PREFIX)

  const verify = async () => {
    if (!trimmed) return
    setDraftStatus({ state: 'checking' })
    setDraftStatus(await checkApiKey(trimmed, null))
  }

  return (
    <div className="space-y-1.5">
      {!hideLabel && (
        <label className="block text-xs font-bold text-stone-800 flex items-center gap-1.5">
          <KeyIcon className="w-4 h-4 text-rose-500" />
          <span>OpenRouter API Key (会話生成 & 音声合成):</span>
        </label>
      )}
      <div className="flex gap-1.5">
        <input
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isSaved) {
              e.preventDefault()
              void verify()
            }
          }}
          placeholder="sk-or-v1-..."
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-label="OpenRouter API キー"
          className="flex-1 min-w-0 px-3 py-2 border border-stone-300 rounded-xl text-xs font-mono focus:border-rose-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setIsVisible((v) => !v)}
          className="px-2.5 py-2 text-[11px] font-bold text-stone-600 border border-stone-300 rounded-xl hover:bg-stone-100 cursor-pointer flex-shrink-0"
          aria-pressed={isVisible}
        >
          {isVisible ? '隠す' : '表示'}
        </button>
        <button
          type="button"
          onClick={() => void verify()}
          disabled={!trimmed || status?.state === 'checking'}
          className="px-3 py-2 text-[11px] font-bold text-white bg-stone-700 hover:bg-stone-800 disabled:bg-stone-300 rounded-xl cursor-pointer disabled:cursor-default flex-shrink-0"
        >
          確認
        </button>
      </div>
      {looksWrong && (
        <p className="m-0 text-[11px] text-amber-700">OpenRouter のキーは「{KEY_PREFIX}」で始まります。</p>
      )}
      {status ? (
        <ApiKeyStatusLine status={status} />
      ) : (
        <p className="m-0 text-[11px] text-stone-400">
          {trimmed ? '「確認」で有効なキーか調べられます。' : '会話と読み上げにはキーが必要です。'}
        </p>
      )}
      <a
        href={OPENROUTER_KEYS_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-0.5 text-[11px] text-rose-600 hover:underline"
      >
        <span>OpenRouter でキーを取得する</span>
        <ExternalLinkIcon className="w-3 h-3" />
      </a>
    </div>
  )
}
