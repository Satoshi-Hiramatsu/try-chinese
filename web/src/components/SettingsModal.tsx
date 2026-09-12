import { useState, useEffect, useRef } from 'react'
import {
  SettingsIcon,
  CloseIcon,
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
  autoPlayTts?: boolean
  speechInputLang?: 'zh-CN' | 'ja-JP'
  toneColoring?: boolean
  /** 音声入力を打ち切る（ハンズフリーでは自動送信する）までの無音許容時間(ms) */
  silenceTimeoutMs?: number
  onSave: (
    apiKey: string,
    autoPlayTts: boolean,
    speechInputLang: 'zh-CN' | 'ja-JP',
    toneColoring: boolean,
    silenceTimeoutMs: number
  ) => void
}


export function SettingsModal({
  isOpen,
  onClose,
  currentApiKey,
  apiKeyStatus,
  autoPlayTts = false,
  speechInputLang = 'zh-CN',
  toneColoring = false,
  silenceTimeoutMs = DEFAULT_SILENCE_TIMEOUT_MS,
  onSave,
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState(currentApiKey)
  const [autoPlay, setAutoPlay] = useState(autoPlayTts)
  const [inputLang, setInputLang] = useState<'zh-CN' | 'ja-JP'>(speechInputLang)
  const [enableToneColor, setEnableToneColor] = useState(toneColoring)
  const [silenceMs, setSilenceMs] = useState(clampSilenceTimeoutMs(silenceTimeoutMs))
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setApiKey(currentApiKey)
    setAutoPlay(autoPlayTts)
    setInputLang(speechInputLang)
    setEnableToneColor(toneColoring)
    setSilenceMs(clampSilenceTimeoutMs(silenceTimeoutMs))
  }, [currentApiKey, autoPlayTts, speechInputLang, toneColoring, silenceTimeoutMs, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(apiKey, autoPlay, inputLang, enableToneColor, silenceMs)
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
            <h2 className="text-base sm:text-lg font-bold m-0">設定</h2>
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
          {/* Section 1: OpenRouter API キー */}
          <div>
            <ApiKeyField value={apiKey} onChange={setApiKey} savedKey={currentApiKey} savedStatus={apiKeyStatus} />
            <p className="text-[11px] text-stone-400 mt-1 m-0">
              ※ キーはこのブラウザの中にだけ保存されます。会話と読み上げの利用料は、このキーの OpenRouter 残高から使われます。
            </p>
          </div>

          {/* Section 2: 音声・入力の設定 */}
          <div className="pt-3 border-t border-stone-100 space-y-3">
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
