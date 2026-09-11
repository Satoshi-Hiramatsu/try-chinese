import { useEffect, useState } from 'react'
import type { ApiKeyStatus } from '../services/openRouterKey'
import { ApiKeyField } from './ApiKeyField'
import { CloseIcon, KeyIcon } from './Icons'

/**
 * タイトル画面と会話画面のバッジから開く、APIキーだけの小さなモーダル。
 * 設定画面の奥まで潜らずにキーの入力・確認・削除ができる。
 */

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  currentApiKey: string
  status: ApiKeyStatus
  /** 空文字で保存すると削除（無料モードへ戻る）。 */
  onSave: (apiKey: string) => void
}

export function ApiKeyModal({ isOpen, onClose, currentApiKey, status, onSave }: ApiKeyModalProps) {
  const [draft, setDraft] = useState(currentApiKey)

  useEffect(() => {
    if (isOpen) setDraft(currentApiKey)
  }, [currentApiKey, isOpen])

  if (!isOpen) return null

  const trimmed = draft.trim()
  const isDirty = trimmed !== currentApiKey

  const save = () => {
    onSave(trimmed)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-stone-200/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-stone-800">
            <KeyIcon className="w-5 h-5 text-rose-500" />
            <h2 id="api-key-modal-title" className="text-base sm:text-lg font-bold m-0">
              OpenRouter API キー
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-4 space-y-3 text-left">
          <p className="m-0 text-xs text-stone-600 leading-relaxed">
            キーを入れると、友達ごとに作り込んだ AI 音声で話せます。
            キーが無くても無料の音声モデルで会話できます。
          </p>
          <ApiKeyField
            value={draft}
            onChange={setDraft}
            savedKey={currentApiKey}
            savedStatus={status}
            autoFocus
            hideLabel
          />
          <p className="m-0 text-[11px] text-stone-400">
            キーはこのブラウザの中にだけ保存され、サーバーには残りません。
          </p>
        </div>

        <div className="px-5 sm:px-6 py-3.5 border-t border-stone-100 bg-stone-50/80 flex items-center gap-2">
          {currentApiKey && (
            <button
              type="button"
              onClick={() => {
                onSave('')
                onClose()
              }}
              className="px-3 py-2 text-xs font-medium text-rose-600 hover:text-rose-800 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
            >
              キーを削除
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-200/60 transition-colors cursor-pointer"
            >
              {isDirty ? 'キャンセル' : 'とじる'}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!isDirty}
              className="px-5 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:bg-stone-300 rounded-xl shadow-xs transition-colors cursor-pointer disabled:cursor-default"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
