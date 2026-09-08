import type { Expression } from '../types'
import type { BackHairId, FrontHairId, OutfitId } from './portraitParts'

/** 立ち絵の背景シーン（友達の居住地・雰囲気に対応） */
export type SceneId =
  | 'city'
  | 'cafe'
  | 'studio'
  | 'park'
  | 'night'
  | 'teahouse'
  | 'kitchen'
  | 'campus'
  | 'gym'
  | 'travel'

export interface PortraitSpec {
  id: string
  gender: 'male' | 'female'
  /** 肌 */
  skin: string
  skinShade: string
  /** 髪 */
  hair: string
  hairShade: string
  hairLight: string
  backHair: BackHairId
  frontHair: FrontHairId
  sideLock: boolean
  /** 瞳 */
  eye: string
  /** 服 */
  outfit: OutfitId
  outfitColor: string
  outfitShade: string
  innerColor: string
  /** 装飾 */
  glasses?: boolean
  earring?: boolean
  hairPin?: string
  freckles?: boolean
  /** 背景シーン */
  scene: SceneId
}

const SKIN = {
  light: { skin: '#fdece0', skinShade: '#f2cfba' },
  fair: { skin: '#fae2d2', skinShade: '#e9c2ab' },
  warm: { skin: '#f4d7bd', skinShade: '#e0b494' },
  tan: { skin: '#e8c19f', skinShade: '#cfa079' },
  deep: { skin: '#d9a97f', skinShade: '#bd8a5f' },
} as const

/**
 * 20人分の立ち絵パラメータ。
 * 髪型・髪色・瞳・服装・装飾の組み合わせがすべて異なるため、
 * 同一の顔グラフィックが生成されることはない。
 */
export const PORTRAITS: Record<string, PortraitSpec> = {
  // ------------------------------------------------------------------ 女性
  'pt-meiling': {
    id: 'pt-meiling',
    gender: 'female',
    ...SKIN.light,
    hair: '#4a2f2a',
    hairShade: '#331f1c',
    hairLight: '#6b453d',
    backHair: 'bob',
    frontHair: 'straightBang',
    sideLock: true,
    eye: '#8b4f3f',
    outfit: 'tee',
    outfitColor: '#f2919f',
    outfitShade: '#d9707f',
    innerColor: '#fff5f6',
    hairPin: '#ffd166',
    scene: 'campus',
  },
  'pt-lixue': {
    id: 'pt-lixue',
    gender: 'female',
    ...SKIN.fair,
    hair: '#2b2b33',
    hairShade: '#191920',
    hairLight: '#484855',
    backHair: 'longStraight',
    frontHair: 'himeBang',
    sideLock: true,
    eye: '#5a6f8c',
    outfit: 'apron',
    outfitColor: '#8fb8a4',
    outfitShade: '#6f9a86',
    innerColor: '#fdfbf5',
    scene: 'studio',
  },
  'pt-zihan': {
    id: 'pt-zihan',
    gender: 'female',
    ...SKIN.light,
    hair: '#1f1a17',
    hairShade: '#100d0b',
    hairLight: '#3c322c',
    backHair: 'bun',
    frontHair: 'curtainBang',
    sideLock: true,
    eye: '#4b3a2a',
    outfit: 'hanfu',
    outfitColor: '#c8dbe0',
    outfitShade: '#a2bcc4',
    innerColor: '#fffaf2',
    hairPin: '#c9a227',
    scene: 'teahouse',
  },
  'pt-yuchen': {
    id: 'pt-yuchen',
    gender: 'female',
    ...SKIN.warm,
    hair: '#6d3b2a',
    hairShade: '#4d2719',
    hairLight: '#8f5740',
    backHair: 'ponytail',
    frontHair: 'sideSwept',
    sideLock: false,
    eye: '#3f7a68',
    outfit: 'sporty',
    outfitColor: '#4fa3a8',
    outfitShade: '#37858a',
    innerColor: '#eefaf9',
    scene: 'gym',
  },
  'pt-nuan': {
    id: 'pt-nuan',
    gender: 'female',
    ...SKIN.light,
    hair: '#9a6b4f',
    hairShade: '#7a5039',
    hairLight: '#c08b68',
    backHair: 'twinTail',
    frontHair: 'splitBang',
    sideLock: false,
    eye: '#c47a5c',
    outfit: 'dress',
    outfitColor: '#f6c65b',
    outfitShade: '#dda63c',
    innerColor: '#fffdf4',
    freckles: true,
    scene: 'cafe',
  },
  'pt-jingyi': {
    id: 'pt-jingyi',
    gender: 'female',
    ...SKIN.fair,
    hair: '#26313f',
    hairShade: '#161e28',
    hairLight: '#3f5165',
    backHair: 'longWavy',
    frontHair: 'curtainBang',
    sideLock: true,
    eye: '#3a5a8c',
    outfit: 'blazer',
    outfitColor: '#3c4a63',
    outfitShade: '#2a3547',
    innerColor: '#ffffff',
    glasses: true,
    scene: 'city',
  },
  'pt-xiaoyu': {
    id: 'pt-xiaoyu',
    gender: 'female',
    ...SKIN.light,
    hair: '#3d2a4a',
    hairShade: '#291a33',
    hairLight: '#5c4270',
    backHair: 'mediumF',
    frontHair: 'messyBang',
    sideLock: false,
    eye: '#7b5aa6',
    outfit: 'hoodie',
    outfitColor: '#a892d1',
    outfitShade: '#8871b3',
    innerColor: '#f6f2fb',
    earring: true,
    scene: 'night',
  },
  'pt-shanshan': {
    id: 'pt-shanshan',
    gender: 'female',
    ...SKIN.tan,
    hair: '#1b1614',
    hairShade: '#0d0a09',
    hairLight: '#3a2f2a',
    backHair: 'braid',
    frontHair: 'shortSideBang',
    sideLock: false,
    eye: '#6b4a2f',
    outfit: 'jacket',
    outfitColor: '#c96a4a',
    outfitShade: '#a94f33',
    innerColor: '#fdf3ea',
    scene: 'travel',
  },
  'pt-anqi': {
    id: 'pt-anqi',
    gender: 'female',
    ...SKIN.fair,
    hair: '#5b6470',
    hairShade: '#414a55',
    hairLight: '#7d8794',
    backHair: 'bob',
    frontHair: 'splitBang',
    sideLock: true,
    eye: '#4d7f7a',
    outfit: 'sweater',
    outfitColor: '#e2e6ea',
    outfitShade: '#c3c9d1',
    innerColor: '#ffffff',
    earring: true,
    scene: 'cafe',
  },
  'pt-ruoxi': {
    id: 'pt-ruoxi',
    gender: 'female',
    ...SKIN.warm,
    hair: '#7e2f3a',
    hairShade: '#5c1e26',
    hairLight: '#a04a55',
    backHair: 'longStraight',
    frontHair: 'straightBang',
    sideLock: true,
    eye: '#9c3f4c',
    outfit: 'shirt',
    outfitColor: '#f7f2e8',
    outfitShade: '#ddd5c6',
    innerColor: '#ffffff',
    hairPin: '#e05a6d',
    scene: 'kitchen',
  },

  // ------------------------------------------------------------------ 男性
  'pt-wanghao': {
    id: 'pt-wanghao',
    gender: 'male',
    ...SKIN.fair,
    hair: '#241d1a',
    hairShade: '#130f0d',
    hairLight: '#43372f',
    backHair: 'shortM',
    frontHair: 'shortSideBang',
    sideLock: false,
    eye: '#4a5a6b',
    outfit: 'shirt',
    outfitColor: '#5b7fa6',
    outfitShade: '#426182',
    innerColor: '#ffffff',
    glasses: true,
    scene: 'city',
  },
  'pt-zhangwei': {
    id: 'pt-zhangwei',
    gender: 'male',
    ...SKIN.tan,
    hair: '#181310',
    hairShade: '#0a0807',
    hairLight: '#372c25',
    backHair: 'undercut',
    frontHair: 'slickBack',
    sideLock: false,
    eye: '#5a3f2a',
    outfit: 'sporty',
    outfitColor: '#e8593f',
    outfitShade: '#c33f2a',
    innerColor: '#fff2ee',
    scene: 'gym',
  },
  'pt-chenyu': {
    id: 'pt-chenyu',
    gender: 'male',
    ...SKIN.light,
    hair: '#3a2a20',
    hairShade: '#241812',
    hairLight: '#5b4434',
    backHair: 'waveM',
    frontHair: 'curtainBang',
    sideLock: false,
    eye: '#6b7f4a',
    outfit: 'sweater',
    outfitColor: '#7c9a5e',
    outfitShade: '#5f7a45',
    innerColor: '#fbfdf6',
    scene: 'park',
  },
  'pt-lijun': {
    id: 'pt-lijun',
    gender: 'male',
    ...SKIN.warm,
    hair: '#141414',
    hairShade: '#070707',
    hairLight: '#333333',
    backHair: 'spiky',
    frontHair: 'spikeBang',
    sideLock: false,
    eye: '#8a4a2a',
    outfit: 'jacket',
    outfitColor: '#2f3a4a',
    outfitShade: '#1e2733',
    innerColor: '#f0f4f8',
    earring: true,
    scene: 'night',
  },
  'pt-haoran': {
    id: 'pt-haoran',
    gender: 'male',
    ...SKIN.fair,
    hair: '#5a4632',
    hairShade: '#3d2f20',
    hairLight: '#7c6247',
    backHair: 'shortM',
    frontHair: 'messyBang',
    sideLock: false,
    eye: '#4f6f8a',
    outfit: 'hoodie',
    outfitColor: '#5c6ac4',
    outfitShade: '#4451a4',
    innerColor: '#f3f4ff',
    scene: 'campus',
  },
  'pt-tianyou': {
    id: 'pt-tianyou',
    gender: 'male',
    ...SKIN.deep,
    hair: '#1d1a18',
    hairShade: '#0e0c0b',
    hairLight: '#3b352f',
    backHair: 'undercut',
    frontHair: 'sideSwept',
    sideLock: false,
    eye: '#4a3423',
    outfit: 'blazer',
    outfitColor: '#4a4038',
    outfitShade: '#332c26',
    innerColor: '#faf6ef',
    scene: 'teahouse',
  },
  'pt-yifan': {
    id: 'pt-yifan',
    gender: 'male',
    ...SKIN.light,
    hair: '#7d5a3c',
    hairShade: '#5b4028',
    hairLight: '#a07a55',
    backHair: 'waveM',
    frontHair: 'sideSwept',
    sideLock: false,
    eye: '#3f6f5a',
    outfit: 'apron',
    outfitColor: '#3f5d52',
    outfitShade: '#2c4239',
    innerColor: '#fdfaf3',
    scene: 'kitchen',
  },
  'pt-shixun': {
    id: 'pt-shixun',
    gender: 'male',
    ...SKIN.fair,
    hair: '#2a2f3a',
    hairShade: '#181c24',
    hairLight: '#464e5e',
    backHair: 'shortM',
    frontHair: 'splitBang',
    sideLock: false,
    eye: '#5a6a7a',
    outfit: 'tee',
    outfitColor: '#3d4551',
    outfitShade: '#2a3039',
    innerColor: '#f2f4f7',
    glasses: true,
    scene: 'studio',
  },
  'pt-guangyao': {
    id: 'pt-guangyao',
    gender: 'male',
    ...SKIN.tan,
    hair: '#4a2a1a',
    hairShade: '#2f180d',
    hairLight: '#6d4429',
    backHair: 'spiky',
    frontHair: 'messyBang',
    sideLock: false,
    eye: '#a05a2a',
    outfit: 'tee',
    outfitColor: '#f2b544',
    outfitShade: '#d0942a',
    innerColor: '#fffaef',
    freckles: true,
    scene: 'travel',
  },
  'pt-zhiyuan': {
    id: 'pt-zhiyuan',
    gender: 'male',
    ...SKIN.light,
    hair: '#63676e',
    hairShade: '#4a4d53',
    hairLight: '#868b93',
    backHair: 'waveM',
    frontHair: 'slickBack',
    sideLock: false,
    eye: '#4a6a8a',
    outfit: 'shirt',
    outfitColor: '#8a95a5',
    outfitShade: '#6d7382',
    innerColor: '#ffffff',
    scene: 'cafe',
  },
}

export function getPortrait(id?: string): PortraitSpec | null {
  if (!id) return null
  return PORTRAITS[id] || null
}

/**
 * 立ち絵イラスト（`web/public/portraits/`）のURL。
 * プリセット20人はイラストを持つ。イラストが無いカスタム友達は null を返し、
 * 呼び出し側は PortraitSpec から組み立てる SVG 立ち絵にフォールバックする。
 */
export function getPortraitImage(id?: string): string | null {
  if (!id || !PORTRAITS[id]) return null
  return `/portraits/${id}.jpg`
}

/**
 * 背景を抜いた表情差分（`web/public/portraits/<id>-<expression>.webp`）を持つ立ち絵。
 * 差分を持つ立ち絵はノベル画面で背景レイヤーと分離して表示するため、
 * キャラクターを描き替えても背景が動かない。
 * 差分の生成は `scripts/sheet-to-portraits.mjs` を参照。
 */
export const PORTRAIT_EXPRESSION_IDS: ReadonlySet<string> = new Set(['pt-meiling'])

/** 表情差分（透過画像）を持つ立ち絵かどうか。 */
export function hasPortraitExpressions(id?: string): boolean {
  return !!id && PORTRAIT_EXPRESSION_IDS.has(id)
}

/**
 * 表情差分（透過画像）のURL。差分を持たない立ち絵は null を返す。
 * 背景が入っていないので、シーン背景の上に重ねて表示する。
 */
export function getPortraitLayer(id: string | undefined, expression: Expression): string | null {
  if (!hasPortraitExpressions(id)) return null
  return `/portraits/${id}-${expression}.webp`
}

/**
 * シーン背景イラスト（`web/public/scenes/`）を持つシーン。
 * 未生成のシーンは SVG の `SceneBackdrop` にフォールバックする。
 */
export const SCENE_IMAGE_IDS: ReadonlySet<SceneId> = new Set<SceneId>(['campus'])

/** シーン背景イラストのURL。未生成のシーンは null を返す。 */
export function getSceneImage(scene: SceneId): string | null {
  return SCENE_IMAGE_IDS.has(scene) ? `/scenes/${scene}.webp` : null
}

export const PORTRAIT_IDS = Object.keys(PORTRAITS)

const PORTRAIT_LIST = Object.values(PORTRAITS)

/**
 * 立ち絵が未設定の Friend（旧バージョンで作成したカスタム友達など）にも
 * 必ず立ち絵を割り当てる。同じ Friend には常に同じ立ち絵が返る。
 */
export function resolvePortrait(friend: {
  id?: string
  name?: string
  portraitId?: string
  voice?: { gender?: 'male' | 'female' }
}): PortraitSpec {
  const explicit = getPortrait(friend.portraitId)
  if (explicit) return explicit

  const gender = friend.voice?.gender === 'male' ? 'male' : 'female'
  const candidates = PORTRAIT_LIST.filter((p) => p.gender === gender)
  const seed = friend.id || friend.name || ''
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000
  }
  return candidates[hash % candidates.length]
}
