import { useState, useEffect, useRef } from 'react'
import {
  SettingsIcon,
  CloseIcon,
  CpuIcon,
  ExternalLinkIcon,
  CheckIcon,
  KeyIcon,
  SparklesIcon,
  SpeakerIcon,
  GlobeIcon,
  ChinaFlagIcon,
  JapanFlagIcon,
} from './Icons'

export const PRESET_TTS_MODELS = [
  {
    id: 'hexgrad/kokoro-82m',
    name: 'Kokoro 82M',
    tag: '推奨・5人全員の個別声質対応',
    price: '$4 / 100万tok',
    desc: '破格の低価格オープンTTS。中国語8話者対応で王浩・張偉・美玲たち5人全員を別々のリアルな声に演じ分け！',
  },
  {
    id: 'qwen/qwen-audio-3.0-tts-flash',
    name: 'Qwen Audio 3.0 TTS Flash',
    tag: '中国語最高峰の抑揚',
    price: '$15 / 100万tok',
    desc: 'アリババ製。四声や抑揚が圧倒的に自然（※話者は男性1種・女性1種の計2種のみ提供）',
  },
  {
    id: 'qwen/qwen-audio-3.0-tts-plus',
    name: 'Qwen Audio 3.0 TTS Plus',
    tag: '最高品質',
    price: '$20 / 100万tok',
    desc: 'Qwenの上位モデル。豊かな表現力と細やかなニュアンス（男女各1種）',
  },
  {
    id: 'fish-audio/s2.1-pro-free:free',
    name: 'Fish Audio S2.1 Pro (Free)',
    tag: '完全無料枠',
    price: '$0 (無料)',
    desc: 'Fish Audioが提供する無料利用枠。テストやコストゼロ運用に最適',
  },
]

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  currentApiKey: string
  currentModel: string
  currentTtsModel?: string
  currentTtsProvider?: 'browser' | 'openrouter'
  autoPlayTts?: boolean
  speechInputLang?: 'zh-CN' | 'ja-JP'
  toneColoring?: boolean
  onOpenTtsDebug?: () => void
  /** 声の管理ダッシュボード（全キャラクターの声設定）を開く。 */
  onOpenVoiceAdmin?: () => void
  onSave: (
    apiKey: string,
    model: string,
    autoPlayTts: boolean,
    speechInputLang: 'zh-CN' | 'ja-JP',
    toneColoring: boolean,
    ttsModel?: string,
    ttsProvider?: 'browser' | 'openrouter'
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
  currentTtsModel = 'qwen/qwen-audio-3.0-tts-flash',
  currentTtsProvider = 'openrouter',
  autoPlayTts = false,
  speechInputLang = 'zh-CN',
  toneColoring = false,
  onOpenTtsDebug,
  onOpenVoiceAdmin,
  onSave,
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState(currentApiKey)
  const [model, setModel] = useState(currentModel || 'google/gemini-2.5-flash')
  const [ttsModel, setTtsModel] = useState(currentTtsModel)
  const [ttsProvider, setTtsProvider] = useState<'browser' | 'openrouter'>(currentTtsProvider)
  const [autoPlay, setAutoPlay] = useState(autoPlayTts)
  const [inputLang, setInputLang] = useState<'zh-CN' | 'ja-JP'>(speechInputLang)
  const [enableToneColor, setEnableToneColor] = useState(toneColoring)
  const scrollRef = useRef<HTMLDivElement>(null)
  const showTtsDebug = import.meta.env.DEV
    || new URLSearchParams(window.location.search).get('ttsDebug') === '1'

  useEffect(() => {
    setApiKey(currentApiKey)
    setModel(currentModel || 'google/gemini-2.5-flash')
    setTtsModel(currentTtsModel || 'qwen/qwen-audio-3.0-tts-flash')
    setTtsProvider(currentTtsProvider)
    setAutoPlay(autoPlayTts)
    setInputLang(speechInputLang)
    setEnableToneColor(toneColoring)
  }, [currentApiKey, currentModel, currentTtsModel, currentTtsProvider, autoPlayTts, speechInputLang, toneColoring, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(apiKey, model, autoPlay, inputLang, enableToneColor, ttsModel, ttsProvider)
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
            <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center gap-1.5">
              <KeyIcon className="w-4 h-4 text-rose-500" />
              <span>OpenRouter API Key (会話生成 & 音声合成):</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full px-3 py-2 border border-stone-300 rounded-xl text-xs font-mono focus:border-rose-500 focus:outline-none"
            />
            <p className="text-[11px] text-stone-400 mt-1 m-0">
              ※ 本アプリは OpenRouter 契約者向けです。キーはブラウザ（IndexedDB）内にのみ安全に保持されます。
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

          {/* Section 3: 音声合成 (TTS) エンジン & モデル設定 */}
          <div className="pt-3 border-t border-stone-100 space-y-3">
            <label className="block text-xs font-bold text-stone-800 flex items-center gap-1.5">
              <SpeakerIcon className="w-4 h-4 text-stone-600" />
              <span>中国語 音声合成 (TTS) エンジン設定:</span>
            </label>

            {/* TTSプロバイダ切り替え */}
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2">
              <span className="text-xs font-bold text-stone-800 block">
                読み上げエンジン
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTtsProvider('openrouter')}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border text-left cursor-pointer transition-all ${
                    ttsProvider === 'openrouter'
                      ? 'border-rose-400 bg-rose-50 text-rose-800 shadow-2xs'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3 text-amber-500" />
                    <span>OpenRouter AI音声</span>
                  </div>
                  <div className="text-[10px] text-stone-400 font-normal mt-0.5">
                    推奨・ネイティブ四声 (要キー)
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setTtsProvider('browser')}
                  className={`py-2 px-3 text-xs font-bold rounded-xl border text-left cursor-pointer transition-all ${
                    ttsProvider === 'browser'
                      ? 'border-rose-400 bg-rose-50 text-rose-800 shadow-2xs'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <GlobeIcon className="w-3.5 h-3.5 text-sky-600" />
                    <span>ブラウザ / Edge</span>
                  </div>
                  <div className="text-[10px] text-stone-400 font-normal mt-0.5">
                    完全無料・ローカル音声
                  </div>
                </button>
              </div>

              {/* OpenRouter TTS モデル一覧 (OpenRouter選択時) */}
              {ttsProvider === 'openrouter' && (
                <div className="mt-3 pt-2 border-t border-stone-200/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-stone-700 block">
                    使用するTTS音声モデル（高コスパ厳選・高額モデル除外済み）:
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {PRESET_TTS_MODELS.map((m) => {
                      const isSelected = ttsModel === m.id
                      return (
                        <div
                          key={m.id}
                          onClick={() => setTtsModel(m.id)}
                          className={`p-2 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'border-rose-400 bg-white shadow-2xs font-semibold'
                              : 'border-stone-200 bg-white/70 hover:border-stone-300 hover:bg-white text-stone-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-stone-900 text-xs">{m.name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-700 font-bold">
                                {m.tag}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-stone-100 text-stone-600 font-mono">
                                {m.price}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-500 m-0 mt-0.5 leading-tight">{m.desc}</p>
                          </div>
                          {isSelected && (
                            <span className="flex items-center gap-1 text-rose-600 text-xs font-bold flex-shrink-0 ml-2">
                              <CheckIcon className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-stone-400 mt-1 m-0">
                    ※ 各友達キャラクター（美玲や王浩など）の「声のトーン・話者」は、友達カードの「声質」ボタンから個別にカスタマイズ可能です（Kokoro 82M または ブラウザ/Edge なら5人全員が別々の個性的な声になります）。
                  </p>
                </div>
              )}
            </div>

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
