import { useState, useEffect } from 'react'
import {
  SettingsIcon,
  CloseIcon,
  CpuIcon,
  ExternalLinkIcon,
  CheckIcon,
  KeyIcon,
  SparklesIcon,
  SpeakerIcon,
} from './Icons'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentApiKey: string
  currentModel: string
  autoPlayTts?: boolean
  speechInputLang?: 'zh-CN' | 'ja-JP'
  toneColoring?: boolean
  onSave: (
    apiKey: string,
    model: string,
    autoPlayTts: boolean,
    speechInputLang: 'zh-CN' | 'ja-JP',
    toneColoring: boolean
  ) => void
}

const PRESET_MODELS = [
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: '推奨・最安・超高速', desc: '中国語の精度が高く、コスト効率が圧倒的' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', tag: '定番・高精度', desc: '指示遵守力が高く安定した構造化JSON生成' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat (V3)', tag: '中国語ニュアンス特化', desc: 'ネイティブらしい自然な中国語口語表現' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', tag: 'オープン最高峰', desc: 'Meta社の高性能オープンモデル' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)', tag: '完全無料枠', desc: 'OpenRouter提供の無料モデル（レート制限あり）' },
]

export function SettingsModal({
  isOpen,
  onClose,
  currentApiKey,
  currentModel,
  autoPlayTts = false,
  speechInputLang = 'zh-CN',
  toneColoring = true,
  onSave,
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState(currentApiKey)
  const [model, setModel] = useState(currentModel || 'google/gemini-2.5-flash')
  const [autoPlay, setAutoPlay] = useState(autoPlayTts)
  const [inputLang, setInputLang] = useState<'zh-CN' | 'ja-JP'>(speechInputLang)
  const [enableToneColor, setEnableToneColor] = useState(toneColoring)

  useEffect(() => {
    setApiKey(currentApiKey)
    setModel(currentModel || 'google/gemini-2.5-flash')
    setAutoPlay(autoPlayTts)
    setInputLang(speechInputLang)
    setEnableToneColor(toneColoring)
  }, [currentApiKey, currentModel, autoPlayTts, speechInputLang, toneColoring, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(apiKey, model, autoPlay, inputLang, enableToneColor)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-rose-100 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-xl font-bold text-stone-900 m-0 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-rose-500" />
              <span>AI 設定 & プロバイダ (BYO-AI)</span>
            </h3>
            <p className="text-xs text-stone-500 m-0 mt-0.5">
              文章生成モデルの選定や API キーを設定できます
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-stone-400 hover:text-stone-600 p-1.5 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-5 text-sm text-stone-600">
          {/* Section 1: 文章生成モデルの選定 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <CpuIcon className="w-4 h-4 text-stone-600" />
                <span>文章生成 (LLM) モデル:</span>
              </label>
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-rose-600 hover:underline font-normal flex items-center gap-1"
              >
                <span>OpenRouter モデル一覧</span>
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            </div>

            {/* プリセットモデル選択ボタン */}
            <div className="space-y-1.5 mb-2.5 max-h-44 overflow-y-auto pr-1">
              {PRESET_MODELS.map((m) => {
                const isSelected = model === m.id
                return (
                  <div
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-rose-50/90 border-rose-400 shadow-2xs'
                        : 'bg-white border-stone-200/80 hover:border-stone-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-stone-900">{m.name}</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-stone-100 text-stone-600 rounded font-semibold">
                          {m.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-400 m-0 leading-tight mt-0.5">
                        {m.desc}
                      </p>
                    </div>
                    {isSelected && (
                      <span className="text-rose-600 text-xs font-bold flex-shrink-0 ml-2 flex items-center gap-1">
                        <CheckIcon className="w-3.5 h-3.5" />
                        <span>選択中</span>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* モデル名直接入力 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500 flex-shrink-0">カスタム指定:</span>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="例: openai/gpt-4o または deepseek/deepseek-chat"
                className="flex-1 px-3 py-1.5 border border-stone-300 rounded-xl text-xs font-mono focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 2: OpenRouter API キー */}
          <div className="pt-3 border-t border-stone-100">
            <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center gap-1.5">
              <KeyIcon className="w-4 h-4 text-stone-600" />
              <span>OpenRouter API Key (ブラウザ保持):</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs font-mono focus:border-rose-500 focus:outline-none"
            />
            <p className="text-[11px] text-stone-400 mt-1 m-0">
              ※ 空欄の場合は、Worker 側の環境変数（<code>.dev.vars</code>）に設定されたキーが自動適用されます。
            </p>
          </div>

          {/* Section 3: 音声（TTS / STT）設定 */}
          <div className="pt-3 border-t border-stone-100 space-y-3">
            <label className="block text-xs font-bold text-stone-800 flex items-center gap-1.5">
              <SpeakerIcon className="w-4 h-4 text-stone-600" />
              <span>音声機能設定 (TTS / STT):</span>
            </label>

            {/* 自動読み上げトグル */}
            <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-200/80">
              <div>
                <span className="text-xs font-bold text-stone-800 block">
                  AIの返答を自動で読み上げる
                </span>
                <span className="text-[11px] text-stone-500 block mt-0.5">
                  ONにすると返信が届いた際に中国語音声が自動再生されます
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAutoPlay(!autoPlay)}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                  autoPlay ? 'bg-rose-500' : 'bg-stone-300'
                }`}
                role="switch"
                aria-checked={autoPlay}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white transition-transform transform shadow-xs ${
                    autoPlay ? 'translate-x-6' : 'translate-x-1'
                  } top-1`}
                />
              </button>
            </div>

            {/* 音声入力の初期言語 */}
            <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-200/80">
              <div>
                <span className="text-xs font-bold text-stone-800 block">
                  音声入力（マイク）のデフォルト言語
                </span>
                <span className="text-[11px] text-stone-500 block mt-0.5">
                  入力欄でもいつでもワンタップで切り替え可能です
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setInputLang('zh-CN')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    inputLang === 'zh-CN'
                      ? 'bg-rose-500 text-white shadow-2xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  🇨🇳 中国語
                </button>
                <button
                  type="button"
                  onClick={() => setInputLang('ja-JP')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    inputLang === 'ja-JP'
                      ? 'bg-rose-500 text-white shadow-2xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  🇯🇵 日本語
                </button>
              </div>
            </div>

            {/* ピンイン声調の色分け表示 */}
            <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-200/80">
              <div>
                <span className="text-xs font-bold text-stone-800 block">
                  ピンイン声調の色分け表示
                </span>
                <span className="text-[11px] text-stone-500 block mt-0.5">
                  第1声(赤)・第2声(橙)・第3声(緑)・第4声(青)・軽声(灰)をハイライト
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEnableToneColor(!enableToneColor)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  enableToneColor ? 'bg-rose-500' : 'bg-stone-300'
                }`}
                role="switch"
                aria-checked={enableToneColor}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white transition-transform transform shadow-xs ${
                    enableToneColor ? 'translate-x-6' : 'translate-x-1'
                  } top-1`}
                />
              </button>
            </div>
          </div>

          {/* Section 4: トークン効率についての案内 */}
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/60 text-xs space-y-1 text-stone-700">
            <p className="font-bold text-amber-900 m-0 flex items-center gap-1.5">
              <SparklesIcon className="w-4 h-4 text-amber-600" />
              <span>トークン効率最適化について</span>
            </p>
            <p className="m-0 leading-relaxed text-[11px] text-stone-600">
              • <strong>文章生成</strong>: <code>max_tokens: 1000</code> および直近6ターンの履歴制限により、トークン浪費を徹底抑制しています。<br />
              • <strong>聞き取り (STT) ＆ 読み上げ (TTS)</strong>: ブラウザ標準エンジン（Web Speech API）を使用するため、<strong>API トークン消費はゼロ（完全無料）</strong> です。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-2 pt-3 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            設定を保存
          </button>
        </div>
      </div>
    </div>
  )
}
