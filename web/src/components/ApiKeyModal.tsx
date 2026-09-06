import { useState, useEffect } from 'react'

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  currentApiKey: string
  onSaveApiKey: (key: string) => void
}

export function ApiKeyModal({
  isOpen,
  onClose,
  currentApiKey,
  onSaveApiKey,
}: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState(currentApiKey)

  useEffect(() => {
    setApiKey(currentApiKey)
  }, [currentApiKey, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    onSaveApiKey(apiKey)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-stone-200 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h3 className="text-lg font-bold text-stone-900 flex items-center gap-2 m-0">
            <span>🔑</span>
            <span>API キー設定 (BYO-AI)</span>
          </h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-xl font-bold p-1 leading-none"
          >
            ×
          </button>
        </div>

        <div className="mt-4 space-y-4 text-sm text-stone-600">
          <p className="leading-relaxed text-xs sm:text-sm">
            本アプリは個人利用向け（BYO-AI）として動作します。
            入力された API キー（OpenRouter 等）はお使いのブラウザ内（ローカルストレージ）にのみ保存され、外部サーバーに永続化されることはありません。
          </p>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              OpenRouter API Key:
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-3 py-2 border border-stone-300 rounded-xl text-sm font-mono focus:border-rose-500 focus:outline-none"
            />
          </div>

          <div className="bg-rose-50 p-3 rounded-xl border border-rose-200/60 text-xs text-rose-800 space-y-1">
            <p className="font-semibold m-0">💡 ヒント</p>
            <p className="m-0 leading-relaxed text-rose-700">
              OpenRouter で取得したキーを入力すると、Cloudflare Workers 経由で直接 AI フレンドと会話できます。
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-100 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-xs transition-colors"
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  )
}
