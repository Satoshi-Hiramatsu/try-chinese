/**
 * 話者プリセットを持たないモデルで、声を固定・作り込むための入力群。
 * 検証モード（TtsDebugModal）と声質カスタマイズ（VoiceSettingsModal）で共有する。
 */

import { useEffect, useState } from 'react'
import type { TtsVoiceTuning } from '../types'
import {
  TTS_LATENCY_OPTIONS,
  type TtsTuningCapability,
  type TtsTuningNumberField,
  type TtsTuningNumberKey,
  type TtsTuningTextKey,
} from '../data/ttsVoiceTuning'

interface Props {
  capability: TtsTuningCapability
  tuning: TtsVoiceTuning
  onChange: (tuning: TtsVoiceTuning) => void
  /** 話者IDを自由入力するモデルで使う。未指定なら入力欄を出さない。 */
  voiceId?: string
  onVoiceIdChange?: (voiceId: string) => void
}

function NumberField({ field, value, onChange }: {
  field: TtsTuningNumberField
  value?: number
  onChange: (value?: number) => void
}) {
  const current = value ?? field.fallback
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-bold text-stone-700">{field.label}</label>
        <div className="flex items-center gap-1.5">
          <span className={`font-mono text-[11px] ${value === undefined ? 'text-stone-400' : 'text-rose-700 font-bold'}`}>
            {current}
            {value === undefined ? '（既定）' : ''}
          </span>
          {value === undefined ? null : (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-500 hover:bg-stone-200 cursor-pointer"
            >
              既定に戻す
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        className="w-full accent-rose-500"
        min={field.min}
        max={field.max}
        step={field.step}
        value={current}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={field.label}
      />
      <p className="m-0 text-[10px] text-stone-500 leading-snug">{field.help}</p>
    </div>
  )
}

export function VoiceTuningFields({ capability, tuning, onChange, voiceId, onVoiceIdChange }: Props) {
  const [rawOptions, setRawOptions] = useState(() =>
    tuning.providerOptions ? JSON.stringify(tuning.providerOptions, null, 2) : ''
  )
  const [optionsError, setOptionsError] = useState('')

  // 履歴の復元やモデル切り替えで外から値が変わったときは、入力欄の表示も合わせる。
  useEffect(() => {
    setRawOptions(tuning.providerOptions ? JSON.stringify(tuning.providerOptions, null, 2) : '')
    setOptionsError('')
  }, [tuning.providerOptions])

  const patch = (next: Partial<TtsVoiceTuning>) => onChange({ ...tuning, ...next })
  const patchNumber = (key: TtsTuningNumberKey, value?: number) => onChange({ ...tuning, [key]: value })
  const patchText = (key: TtsTuningTextKey, value: string) => onChange({ ...tuning, [key]: value })

  const applyRawOptions = (text: string) => {
    setRawOptions(text)
    if (text.trim() === '') {
      setOptionsError('')
      patch({ providerOptions: undefined })
      return
    }
    try {
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setOptionsError('オブジェクト形式のJSONを入力してください。')
        return
      }
      setOptionsError('')
      patch({ providerOptions: parsed as Record<string, unknown> })
    } catch {
      setOptionsError('JSONとして読み取れません。')
    }
  }

  return (
    <div className="text-xs text-stone-700">
      <p className="m-0 mb-2 text-[11px] text-stone-600 leading-snug">{capability.summary}</p>

      {capability.voiceIdField && onVoiceIdChange ? (
        <div className="mb-3">
          <label className="text-[11px] font-bold text-stone-700 block mb-1">{capability.voiceIdField.label}</label>
          <input
            type="text"
            value={voiceId || ''}
            onChange={(event) => onVoiceIdChange(event.target.value)}
            placeholder={capability.voiceIdField.placeholder}
            className="w-full px-2 py-1.5 rounded-lg border border-stone-200 font-mono text-[11px] focus:outline-hidden focus:border-rose-300"
          />
          <p className="m-0 mt-1 text-[10px] text-stone-500 leading-snug">
            {capability.voiceIdField.help}
            {capability.voiceIdField.docsUrl ? (
              <>
                {' '}
                <a
                  href={capability.voiceIdField.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-rose-600 underline"
                >
                  ボイス一覧を開く
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {capability.presets.length > 0 ? (
        <div className="mb-3">
          <span className="text-[11px] font-bold text-stone-700 block mb-1">プリセット</span>
          <div className="flex flex-wrap gap-1.5">
            {capability.presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.description}
                onClick={() => onChange({ ...tuning, ...preset.tuning })}
                className="px-2 py-1 rounded-lg border border-stone-200 bg-stone-50 text-[11px] font-bold text-stone-700 hover:bg-rose-50 hover:border-rose-300 cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {capability.numbers.map((field) => (
        <NumberField
          key={field.key}
          field={field}
          value={tuning[field.key]}
          onChange={(value) => patchNumber(field.key, value)}
        />
      ))}

      {capability.hasLatency ? (
        <label className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-bold text-stone-700">応答の優先度 (latency)</span>
          <select
            value={tuning.latency || ''}
            onChange={(event) => patch({ latency: (event.target.value || undefined) as TtsVoiceTuning['latency'] })}
            className="px-2 py-1 rounded-lg border border-stone-200 text-[11px]"
          >
            <option value="">既定</option>
            {TTS_LATENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}

      {capability.texts.map((field) => (
        <div key={field.key} className="mb-2">
          <label className="text-[11px] font-bold text-stone-700 block mb-1">{field.label}</label>
          {field.multiline ? (
            <textarea
              rows={2}
              value={tuning[field.key] || ''}
              onChange={(event) => patchText(field.key, event.target.value)}
              placeholder={field.placeholder}
              className="w-full px-2 py-1.5 rounded-lg border border-stone-200 text-[11px] focus:outline-hidden focus:border-rose-300"
            />
          ) : (
            <input
              type="text"
              value={tuning[field.key] || ''}
              onChange={(event) => patchText(field.key, event.target.value)}
              placeholder={field.placeholder}
              className="w-full px-2 py-1.5 rounded-lg border border-stone-200 text-[11px] focus:outline-hidden focus:border-rose-300"
            />
          )}
          <p className="m-0 mt-0.5 text-[10px] text-stone-500 leading-snug">{field.help}</p>
        </div>
      ))}

      <details className="mt-2">
        <summary className="text-[11px] font-bold text-stone-600 cursor-pointer">
          詳細設定（provider.options: {capability.providerSlug}）
        </summary>
        <textarea
          rows={3}
          value={rawOptions}
          onChange={(event) => applyRawOptions(event.target.value)}
          placeholder={'{ "normalize": true }'}
          className="mt-1 w-full px-2 py-1.5 rounded-lg border border-stone-200 font-mono text-[11px] focus:outline-hidden focus:border-rose-300"
        />
        <p className="m-0 text-[10px] text-stone-500 leading-snug">
          プロバイダへそのまま渡す。対応していないキーは無視される。
        </p>
        {optionsError ? <p role="alert" className="m-0 text-[10px] text-red-700">{optionsError}</p> : null}
      </details>
    </div>
  )
}
