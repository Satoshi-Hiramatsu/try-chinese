import { useState, useEffect, useRef } from 'react'
import {
  SettingsIcon,
  CloseIcon,
  CpuIcon,
  ExternalLinkIcon,
  CheckIcon,
  SparklesIcon,
  ChinaFlagIcon,
  JapanFlagIcon,
} from './Icons'
import {
  DEFAULT_SILENCE_TIMEOUT_MS,
  MIN_SILENCE_TIMEOUT_MS,
  MAX_SILENCE_TIMEOUT_MS,
  clampSilenceTimeoutMs,
} from '../services/speech'
import type { ApiKeyStatus } from '../services/openRouterKey'
import { ApiKeyField } from './ApiKeyField'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentApiKey: string
  /** 保存済みキーの検査結果。入力欄の下に出す。 */
  apiKeyStatus: ApiKeyStatus
  currentModel: string
  autoPlayTts?: boolean
  speechInputLang?: 'zh-CN' | 'ja-JP'
  toneColoring?: boolean
  /** 音声入力を打ち切る（ハンズフリーでは自動送信する）までの無音許容時間(ms) */
  silenceTimeoutMs?: number
  onOpenTtsDebug?: () => void
  /** 声の管理ダッシュボード（全キャラクターの声設定）を開く。 */
  onOpenVoiceAdmin?: () => void
  /** このブラウザに保存されている声の上書きの件数。0 なら全リセットを出さない */
  voiceOverrideCount?: number
  /** 全員の声の上書きを捨ててプリセットに戻す。消した件数を返す */
  onResetAllVoices?: () => number
  onSave: (
    apiKey: string,
    model: string,
    autoPlayTts: boolean,
    speechInputLang: 'zh-CN' | 'ja-JP',
    toneColoring: boolean,
    silenceTimeoutMs: number
  ) => void
}

const PRESET_MODELS = [
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', tag: '推奨・中国語ネイティブ', desc: '出力単価が従来の1/4。スキーマ指定に対応し返答が崩れない' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: '従来の既定', desc: '実績のある比較基準。単価は高め' },
  { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', tag: '速度優先', desc: 'さらに安く速い。返答の厚みは落ちる' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', tag: '定番・高精度', desc: '指示遵守力が高く安定した構造化JSON生成' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', tag: '中国語ニュアンス特化', desc: 'ネイティブらしい自然な中国語口語表現' },
]

export function SettingsModal({
  isOpen,
  onClose,
  currentApiKey,
  apiKeyStatus,
  currentModel,
  autoPlayTts = false,
  speechInputLang = 'zh-CN',
  toneColoring = false,
  silenceTimeoutMs = DEFAULT_SILENCE_TIMEOUT_MS,
  onOpenTtsDebug,
  onOpenVoiceAdmin,
  voiceOverrideCount = 0,
  onResetAllVoices,
  onSave,
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState(currentApiKey)
  const [model, setModel] = useState(currentModel || PRESET_MODELS[0].id)
  const [autoPlay, setAutoPlay] = useState(autoPlayTts)
  const [inputLang, setInputLang] = useState<'zh-CN' | 'ja-JP'>(speechInputLang)
  const [enableToneColor, setEnableToneColor] = useState(toneColoring)
  const [silenceMs, setSilenceMs] = useState(clampSilenceTimeoutMs(silenceTimeoutMs))
  const scrollRef = useRef<HTMLDivElement>(null)
  const showTtsDebug = import.meta.env.DEV
    || new URLSearchParams(window.location.search).get('ttsDebug') === '1'

  useEffect(() => {
    setApiKey(currentApiKey)
    setModel(currentModel || PRESET_MODELS[0].id)
    setAutoPlay(autoPlayTts)
    setInputLang(speechInputLang)
    setEnableToneColor(toneColoring)
    setSilenceMs(clampSilenceTimeoutMs(silenceTimeoutMs))
  }, [currentApiKey, currentModel, autoPlayTts, speechInputLang, toneColoring, silenceTimeoutMs, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(apiKey, model, autoPlay, inputLang, enableToneColor, silenceMs)
    onClose()
  }

  const handleCardWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // ヘッダーやフッター、余白にカーソルがある場合でも、設定リストをスムーズにスクロールさせる
    if (scrollRef.current && !scrollRef.current.contains(e.target as Node)) {
      scrollRef.current.scrollTop += e.deltaY
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl border border-stone-200/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleCardWheel}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-stone-100 flex items-center justify-between flex-shrink-0 bg-white">
          <div className="flex items-center gap-2 text-stone-800">
            <SettingsIcon className="w-5 h-5 text-rose-500" />
            <h2 className="text-base sm:text-lg font-bold m-0">AIモデル・音声・APIキー設定</h2>
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

        {/* Content */}
        <div
          ref={scrollRef}
          className="px-5 sm:px-6 py-4 space-y-4 text-left flex-1 overflow-y-auto overscroll-contain"
        >
          {/* Section 1: OpenRouter API キー (一本化) */}
          <div>
            <ApiKeyField value={apiKey} onChange={setApiKey} savedKey={currentApiKey} savedStatus={apiKeyStatus} />
            <p className="text-[11px] text-stone-400 mt-1 m-0">
              ※ キーはブラウザ内にのみ保持されます。未入力のあいだは無料の音声モデル（Fish Audio S2.1 Pro Free）で動きます。
            </p>
          </div>

          {/* Section 2: 会話LLMモデル選択 */}
          <div className="pt-3 border-t border-stone-100 space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <CpuIcon className="w-4 h-4 text-stone-600" />
                <span>会話用 AI モデル (LLM):</span>
              </label>
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-rose-600 hover:underline flex items-center gap-0.5"
              >
                <span>モデル一覧</span>
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            </div>

            {/* プリセット一覧 */}
            <div className="grid grid-cols-1 gap-1.5">
              {PRESET_MODELS.map((m) => {
                const isSelected = model === m.id
                return (
                  <div
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-rose-400 bg-rose-50/60 shadow-2xs font-semibold'
                        : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-stone-900">{m.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                            isSelected
                              ? 'bg-rose-200 text-rose-800 font-bold'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {m.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-500 m-0 mt-0.5">{m.desc}</p>
                    </div>
                    {isSelected && (
                      <span className="flex items-center gap-1 text-rose-600 text-xs font-bold flex-shrink-0">
                        <CheckIcon className="w-4 h-4" />
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

          {/* Section 3: 音声・入力の設定 */}
          <div className="pt-3 border-t border-stone-100 space-y-3">
            {onOpenVoiceAdmin && (
              <button
                type="button"
                onClick={onOpenVoiceAdmin}
                className="w-full mt-2 py-2.5 px-3 rounded-2xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <SettingsIcon className="w-3.5 h-3.5 text-rose-500" />
                <span>声の管理ダッシュボードを開く（全キャラクターの声設定）</span>
              </button>
            )}

            {onResetAllVoices && voiceOverrideCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (
                    !confirm(
                      `${voiceOverrideCount}人分の声の設定をプリセットの値に戻します。\nこのブラウザで保存した音声モデル・話者ID・調整値はすべて消え、元に戻せません。\n続けますか？`
                    )
                  ) {
                    return
                  }
                  const count = onResetAllVoices()
                  alert(`${count}人分の声の設定をプリセットに戻しました。`)
                }}
                className="w-full py-2 px-3 rounded-2xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>全員の声をプリセットに戻す（このブラウザの上書き {voiceOverrideCount} 人分を削除）</span>
              </button>
            )}

            {showTtsDebug && onOpenTtsDebug && (
              <button
                type={'button'}
                className={'tts-debug-launch'}
                onClick={onOpenTtsDebug}
              >
                TTSモデル検証モードを開く
              </button>
            )}

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
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    inputLang === 'zh-CN'
                      ? 'bg-rose-500 text-white shadow-2xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <ChinaFlagIcon className="w-3.5 h-3.5" />
                  <span>中国語</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputLang('ja-JP')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    inputLang === 'ja-JP'
                      ? 'bg-rose-500 text-white shadow-2xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <JapanFlagIcon className="w-3.5 h-3.5" />
                  <span>日本語</span>
                </button>
              </div>
            </div>

            {/* 無音の待機時間（ハンズフリーの自動送信タイミング） */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-stone-800 block">
                    無音の待機時間（自動送信までの長さ）
                  </span>
                  <span className="text-[11px] text-stone-500 block mt-0.5">
                    話し終えてこの時間だけ黙ると、ハンズフリーでは自動送信、通常の音声入力ではマイクを停止します
                  </span>
                </div>
                <span className="text-sm font-bold text-rose-600 tabular-nums flex-shrink-0">
                  {(silenceMs / 1000).toFixed(1)}秒
                </span>
              </div>
              <input
                type="range"
                min={MIN_SILENCE_TIMEOUT_MS}
                max={MAX_SILENCE_TIMEOUT_MS}
                step={500}
                value={silenceMs}
                onChange={(e) => setSilenceMs(clampSilenceTimeoutMs(Number(e.target.value)))}
                aria-label="無音の待機時間"
                className="w-full mt-2.5 accent-rose-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
                <span>{MIN_SILENCE_TIMEOUT_MS / 1000}秒（テンポ重視）</span>
                <span>既定 {DEFAULT_SILENCE_TIMEOUT_MS / 1000}秒</span>
                <span>{MAX_SILENCE_TIMEOUT_MS / 1000}秒（じっくり考える）</span>
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

          {/* Section 4: トークン効率・コストについての案内 */}
          <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/60 text-xs space-y-1 text-stone-700">
            <p className="font-bold text-amber-900 m-0 flex items-center gap-1.5">
              <SparklesIcon className="w-4 h-4 text-amber-600" />
              <span>OpenRouter 1本化と低コスト運用について</span>
            </p>
            <p className="m-0 leading-relaxed text-[11px] text-stone-600">
              • <strong>API一本化</strong>: OpenRouter APIキー 1つで、会話文生成から自然な音声合成（TTS）まで完結します。<br />
              • <strong>高コスパ厳選</strong>: 単価の高いMiniMax等は除外し、中国語最高峰のQwen Flash（$15/1M）や超爆安のKokoro（$4/1M）、完全無料枠（$0）のみを採用しています。<br />
              • <strong>ブラウザ標準音声</strong>: キー不要で端末内蔵音声（完全無料）もいつでも選択可能です。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-stone-100 bg-stone-50/80 flex-shrink-0 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 rounded-xl hover:bg-stone-200/60 transition-colors cursor-pointer"
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
