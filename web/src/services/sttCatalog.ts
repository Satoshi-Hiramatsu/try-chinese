/**
 * OpenRouter で文字起こしできるモデルの一覧を取得し、
 * 検証モードで選びやすい形に整える。
 *
 * TTS と同じく、カタログは単価だけを返して課金単位を返さない。
 * 単位はモデルによって秒・分・トークンが混在するため、
 * ここでは単価を横並び比較には使わず、参考値として添えるだけにする。
 * 実費は文字起こし応答の usage.cost を見る。
 */

import { loadApiKey } from './storage'

export interface SttCatalogModel {
  id: string
  displayName: string
  provider: string
  description: string
  /** 単価。課金単位が不明なため、そのままの数値を持つ。 */
  unitPriceUsd: number
  /** 中国語・日本語での利用可否の見立て。 */
  note: string
  recommendedUse: string
  /** 既定で選んでおくモデル。 */
  featured: boolean
}

export interface SttCatalog {
  models: SttCatalogModel[]
  stale: boolean
}

/** 本体の既定。開発者モードでもこれを基準に比較する。 */
export const DEFAULT_STT_MODEL = 'qwen/qwen3-asr-flash-2026-02-10'

interface SttModelOverlay {
  note: string
  recommendedUse: string
  featured?: boolean
}

/**
 * 中国語・日本語での使い勝手に関する注記。
 * カタログの説明文だけでは判断できないため、調査結果を静的に持つ。
 */
export const STT_MODEL_OVERLAY: Record<string, SttModelOverlay> = {
  'qwen/qwen3-asr-flash-2026-02-10': {
    note: 'Qwen3-Omni 基盤の中国語ネイティブASR。11言語・自動言語判定。公開レイテンシ 542ms。',
    recommendedUse: '本体の既定。中国語の基準にする',
    featured: true,
  },
  'qwen/qwen3-asr-1.7b': {
    note: '30言語と中国語22方言に対応。Flash で精度が足りないときの候補。',
    recommendedUse: '方言・訛りの比較',
    featured: true,
  },
  'qwen/qwen3-asr-0.6b': {
    note: 'Qwen3 ASR の軽量版。速度優先。',
    recommendedUse: '速度の下限を見る',
  },
  'microsoft/mai-transcribe-2': {
    note: 'FLEURS 多言語ベンチ1位・60言語。混在発話(コードスイッチング)を明示的に謳う唯一のモデル。',
    recommendedUse: '日中混在の発話を試す',
    featured: true,
  },
  'microsoft/mai-transcribe-1.5': {
    note: '43言語。公開レイテンシ 1.2s で会話にはやや遅い。',
    recommendedUse: '参考比較',
  },
  'fish-audio/transcribe-1': {
    note: 'TTS と同じベンダー。自動言語判定と語単位タイムスタンプに対応。',
    recommendedUse: '運用先を揃えたい場合',
    featured: true,
  },
  'openai/gpt-4o-mini-transcribe': {
    note: 'トークン課金で費用が読める。公開レイテンシ 899ms。',
    recommendedUse: '費用が読める比較対象',
    featured: true,
  },
  'openai/gpt-transcribe': {
    note: '高精度志向。キーワードヒントに対応。',
    recommendedUse: '精度の上限を見る',
  },
  'openai/whisper-large-v3-turbo': {
    note: '99言語で最安級だが公開レイテンシ 4.0s。会話には遅すぎる。',
    recommendedUse: '精度の基準としてのみ',
  },
  'openai/whisper-1': {
    note: '50言語以上。公開レイテンシ 1.6s。',
    recommendedUse: '参考比較',
  },
  'deepgram/nova-3': {
    note: '公開レイテンシ 209ms と非常に速い。多言語対応に中国語が含まれるかは要確認。',
    recommendedUse: '速度の上限を見る',
  },
  'google/chirp-3': {
    note: '24言語GA＋77言語プレビュー。公開レイテンシ 2.0s。',
    recommendedUse: '参考比較',
  },
  'mistralai/voxtral-mini-transcribe': {
    note: '転写特化。公開レイテンシ 358ms。',
    recommendedUse: '速度と精度の中間帯',
  },
  'nvidia/parakeet-tdt-0.6b-v3': {
    note: '最速級だが学習元の Granary は欧州言語中心。中国語・日本語は非対応の疑いがある。',
    recommendedUse: '対応有無の確認',
  },
  'x-ai/grok-stt-1.0': {
    note: '語単位タイムスタンプと話者分離に対応。公開レイテンシ 287ms。',
    recommendedUse: '速度の上限を見る',
  },
}

interface CatalogResponseModel {
  id: string
  name: string
  description: string
  pricing: { prompt: number; completion: number }
}

function toModel(raw: CatalogResponseModel): SttCatalogModel {
  const overlay = STT_MODEL_OVERLAY[raw.id]
  return {
    id: raw.id,
    displayName: raw.name.replace(/^[^:]+:\s*/, '') || raw.id,
    provider: raw.id.split('/')[0],
    description: raw.description,
    unitPriceUsd: raw.pricing.prompt,
    note: overlay?.note || '調査していないモデル。中国語・日本語で使えるかは実測で確かめる。',
    recommendedUse: overlay?.recommendedUse || '未調査',
    featured: overlay?.featured ?? false,
  }
}

/** 既定モデルを先頭に、注記のあるものを優先して並べる。 */
export function sortSttCatalog(models: readonly SttCatalogModel[]): SttCatalogModel[] {
  return [...models].sort((left, right) => {
    if (left.id === DEFAULT_STT_MODEL) return -1
    if (right.id === DEFAULT_STT_MODEL) return 1
    if (left.featured !== right.featured) return left.featured ? -1 : 1
    return left.displayName.localeCompare(right.displayName)
  })
}

export async function loadSttCatalog(): Promise<SttCatalog> {
  const apiKey = loadApiKey()
  const response = await fetch('/api/stt/models', {
    headers: apiKey ? { 'x-api-key': apiKey } : {},
  })
  if (!response.ok) throw new Error('文字起こしモデル一覧を取得できませんでした。')
  const payload = (await response.json()) as { models: CatalogResponseModel[]; stale: boolean }
  return { models: sortSttCatalog(payload.models.map(toModel)), stale: payload.stale }
}
