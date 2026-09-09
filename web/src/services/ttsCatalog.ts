/**
 * OpenRouterで音声出力できるモデルの一覧を取得し、
 * 静的なオーバーレイ情報と結合して検証モードで使える形にする。
 */

import {
  getTtsModelOverlay,
  inferBillingUnit,
  type TtsBillingUnit,
  type TtsVoicePreset,
} from '../data/openRouterTtsModels'

export interface TtsCatalogModel {
  id: string
  displayName: string
  provider: string
  description: string
  /** OpenRouterが公開している全話者。空配列はプロバイダ既定に任せるモデル。 */
  supportedVoices: readonly string[]
  /** 話者セレクトの先頭に出す推奨プリセット。カタログに存在するものだけを残す。 */
  voicePresets: readonly TtsVoicePreset[]
  defaultVoice?: string
  billingUnit: TtsBillingUnit
  /** 入力単位あたりのUSD。 */
  unitPriceUsd: number
  /** 出力音声トークンあたりのUSD。0なら文字/バイト課金のみ。 */
  audioTokenPriceUsd: number
  priceNote: string
  languages: readonly string[]
  note: string
  recommendedUse: string
  sourceUrl: string
  /** オーバーレイに登録済みか。未登録モデルは注記を控えめに扱う。 */
  curated: boolean
}

interface CatalogResponseModel {
  id: string
  name: string
  description: string
  supportedVoices: string[]
  pricing: { prompt: number; completion: number }
}

const BILLING_UNIT_LABELS: Record<TtsBillingUnit, string> = {
  character: '1M文字',
  'utf8-byte': '1M バイト(UTF-8)',
  'audio-token': '1M 音声トークン',
}

function buildPriceNote(billingUnit: TtsBillingUnit, unitPriceUsd: number, audioTokenPriceUsd: number): string {
  if (billingUnit === 'audio-token') {
    return `$${(unitPriceUsd * 1_000_000).toFixed(2)} / 1M テキストトークン ＋ $${(audioTokenPriceUsd * 1_000_000).toFixed(2)} / 1M 音声トークン`
  }
  const price = unitPriceUsd * 1_000_000
  if (price === 0) return '無料プレビュー'
  return `$${price.toFixed(2)} / ${BILLING_UNIT_LABELS[billingUnit]}`
}

function toCatalogModel(raw: CatalogResponseModel): TtsCatalogModel {
  const overlay = getTtsModelOverlay(raw.id)
  const voices = raw.supportedVoices
  const billingUnit = inferBillingUnit(raw.id, raw.pricing.completion)
  // 推奨プリセットは、カタログが実際に受け付ける話者だけに絞る。
  const presets = (overlay?.voicePresets || []).filter((preset) => voices.length === 0 || voices.includes(preset.id))
  const preferred = (overlay?.preferredVoices || []).find((voice) => voices.length === 0 || voices.includes(voice))

  return {
    id: raw.id,
    displayName: raw.name.replace(/^[^:]+:\s*/, '') || raw.id,
    provider: raw.id.split('/')[0],
    description: raw.description,
    supportedVoices: voices,
    voicePresets: presets,
    defaultVoice: preferred || presets[0]?.id || voices[0],
    billingUnit,
    unitPriceUsd: raw.pricing.prompt,
    audioTokenPriceUsd: raw.pricing.completion,
    priceNote: buildPriceNote(billingUnit, raw.pricing.prompt, raw.pricing.completion),
    languages: overlay?.languages || [],
    note: overlay?.note || '',
    recommendedUse: overlay?.recommendedUse || '',
    sourceUrl: `https://openrouter.ai/${raw.id.replace(/:free$/, '')}`,
    curated: overlay !== undefined,
  }
}

export interface TtsCatalog {
  models: TtsCatalogModel[]
  /** OpenRouterから取得できず、既知のモデルだけを返した状態。 */
  stale: boolean
}

export async function loadTtsCatalog(signal?: AbortSignal): Promise<TtsCatalog> {
  const response = await fetch('/api/tts/models', { signal })
  if (!response.ok) throw new Error(`モデル一覧を取得できませんでした (${response.status})`)
  const payload = (await response.json()) as { models?: CatalogResponseModel[]; stale?: boolean }
  const models = (payload.models || []).map(toCatalogModel)
  // 中国語・日本語に使えるモデルを先に、その中では安い順に並べる。
  models.sort((left, right) => {
    const leftScore = left.languages.includes('zh') ? 0 : left.curated ? 1 : 2
    const rightScore = right.languages.includes('zh') ? 0 : right.curated ? 1 : 2
    if (leftScore !== rightScore) return leftScore - rightScore
    return left.unitPriceUsd - right.unitPriceUsd
  })
  return { models, stale: payload.stale === true }
}

/**
 * 入力テキストから概算費用を出す。
 * 音声トークン課金のモデルは出力長が事前に決まらないため undefined を返す。
 */
export function estimateCatalogCostUsd(model: TtsCatalogModel, text: string): number | undefined {
  if (model.billingUnit === 'audio-token') return undefined
  const units =
    model.billingUnit === 'utf8-byte' ? new TextEncoder().encode(text).byteLength : Array.from(text).length
  return units * model.unitPriceUsd
}
