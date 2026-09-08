import { useId } from 'react'
import type { Expression } from '../types'
import type { PortraitSpec } from '../data/portraits'
import {
  FACE_PATH,
  NECK_PATH,
  NECK_SHADOW_PATH,
  BODY_PATH,
  EAR_LEFT_PATH,
  EAR_RIGHT_PATH,
  BACK_HAIR_PATHS,
  FRONT_HAIR_PATHS,
  SIDE_LOCK_LEFT,
  SIDE_LOCK_RIGHT,
  FACE_CX,
  EYE_Y,
  EYE_DX,
  BROW_Y,
  MOUTH_Y,
} from '../data/portraitParts'

// ---------------------------------------------------------------------------
// 表情テーブル（喜怒哀楽ほか10パターン）
// ---------------------------------------------------------------------------

type BrowShape = 'flat' | 'soft' | 'raised' | 'angry' | 'sad' | 'worried'
type EyeShape = 'open' | 'wide' | 'arc' | 'half' | 'wink' | 'sharp' | 'teary' | 'lookUp'
type MouthShape = 'soft' | 'smile' | 'bigSmile' | 'laugh' | 'small' | 'o' | 'frown' | 'pout' | 'wavy'
type EffectId = 'sparkle' | 'note' | 'steam' | 'flash' | 'tear' | 'anger' | 'question'

interface FaceShape {
  brow: BrowShape
  eye: EyeShape
  mouth: MouthShape
  blush: number
  effect?: EffectId
  tilt: number
}

export const EXPRESSION_FACES: Record<Expression, FaceShape> = {
  neutral: { brow: 'flat', eye: 'open', mouth: 'soft', blush: 0, tilt: 0 },
  smile: { brow: 'soft', eye: 'open', mouth: 'smile', blush: 0.35, tilt: -1 },
  joy: { brow: 'raised', eye: 'arc', mouth: 'bigSmile', blush: 0.6, effect: 'sparkle', tilt: -2 },
  laugh: { brow: 'raised', eye: 'arc', mouth: 'laugh', blush: 0.5, effect: 'note', tilt: 2 },
  shy: { brow: 'worried', eye: 'half', mouth: 'small', blush: 1, effect: 'steam', tilt: -3 },
  surprised: { brow: 'raised', eye: 'wide', mouth: 'o', blush: 0.2, effect: 'flash', tilt: 0 },
  sad: { brow: 'sad', eye: 'teary', mouth: 'frown', blush: 0.25, effect: 'tear', tilt: 3 },
  angry: { brow: 'angry', eye: 'sharp', mouth: 'pout', blush: 0.45, effect: 'anger', tilt: 0 },
  thinking: { brow: 'worried', eye: 'lookUp', mouth: 'wavy', blush: 0, effect: 'question', tilt: -4 },
  wink: { brow: 'raised', eye: 'wink', mouth: 'smile', blush: 0.4, effect: 'sparkle', tilt: -2 },
}

/** 表情の日本語ラベル（UI表示・デバッグ用） */
export const EXPRESSION_LABELS: Record<Expression, string> = {
  neutral: '通常',
  smile: '微笑み',
  joy: '喜び',
  laugh: '笑い',
  shy: '照れ',
  surprised: '驚き',
  sad: '哀しみ',
  angry: '怒り',
  thinking: '考え中',
  wink: 'ウインク',
}

// ---------------------------------------------------------------------------
// 眉
// ---------------------------------------------------------------------------

/** 右目側（x>150）の座標系で定義。左側は scale(-1,1) で反転する。 */
const BROW_PATHS: Record<BrowShape, string> = {
  flat: 'M-14 -1 Q0 -4 14 -1',
  soft: 'M-14 0 Q0 -5 14 -1',
  raised: 'M-14 -4 Q0 -9 14 -4',
  angry: 'M-14 4 Q0 -3 14 -4',
  sad: 'M-14 -5 Q0 -1 14 4',
  worried: 'M-14 -3 Q0 -5 14 2',
}

// ---------------------------------------------------------------------------
// 口
// ---------------------------------------------------------------------------

function Mouth({ shape, lip, dark }: { shape: MouthShape; lip: string; dark: string }) {
  switch (shape) {
    case 'smile':
      return <path d="M-13 -2 Q0 9 13 -2" fill="none" stroke={dark} strokeWidth={3} strokeLinecap="round" />
    case 'bigSmile':
      return (
        <g>
          <path d="M-16 -3 Q0 3 16 -3 Q14 16 0 17 Q-14 16 -16 -3 Z" fill={dark} />
          <path d="M-15 -2 Q0 2 15 -2 Q0 3 -15 -2 Z" fill="#ffffff" />
          <path d="M-8 9 Q0 6 8 9 Q6 16 0 16 Q-6 16 -8 9 Z" fill="#e58a95" />
        </g>
      )
    case 'laugh':
      return (
        <g>
          <path d="M-18 -4 Q0 2 18 -4 Q16 20 0 21 Q-16 20 -18 -4 Z" fill={dark} />
          <path d="M-17 -3 Q0 2 17 -3 Q0 3 -17 -3 Z" fill="#ffffff" />
          <path d="M-9 11 Q0 8 9 11 Q7 20 0 20 Q-7 20 -9 11 Z" fill="#e58a95" />
        </g>
      )
    case 'small':
      return <path d="M-5 -1 Q0 4 5 -1 Q0 2 -5 -1 Z" fill={lip} />
    case 'o':
      return (
        <g>
          <ellipse cx={0} cy={2} rx={7.5} ry={10} fill={dark} />
          <ellipse cx={0} cy={7} rx={4.5} ry={4.5} fill="#e58a95" />
        </g>
      )
    case 'frown':
      return <path d="M-11 4 Q0 -5 11 4" fill="none" stroke={dark} strokeWidth={3} strokeLinecap="round" />
    case 'pout':
      return (
        <g>
          <path d="M-9 1 Q0 -6 9 1 Q0 7 -9 1 Z" fill={lip} />
          <path d="M-9 1 Q0 -4 9 1" fill="none" stroke={dark} strokeWidth={1.6} />
        </g>
      )
    case 'wavy':
      return (
        <path
          d="M-12 1 Q-6 -4 0 1 Q6 6 12 1"
          fill="none"
          stroke={dark}
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      )
    case 'soft':
    default:
      return <path d="M-9 0 Q0 4 9 0" fill="none" stroke={dark} strokeWidth={2.6} strokeLinecap="round" />
  }
}

// ---------------------------------------------------------------------------
// 目
// ---------------------------------------------------------------------------

interface EyeProps {
  shape: EyeShape
  color: string
  lash: string
  skin: string
  /** 内側方向（+1: 右目 / -1: 左目）— 視線オフセット用 */
  inner: number
}

const EYE_WHITE = 'M-13 2 C-13 -9 -6 -14 0 -14 C6 -14 13 -9 13 2 C13 8 6 12 0 12 C-6 12 -13 8 -13 2 Z'
const LASH_LINE = 'M-14 -1 C-12 -13 -5 -17 0 -17 C6 -17 13 -12 14 -1'
const ARC_EYE = 'M-13 4 C-9 -9 -4 -12 0 -12 C4 -12 9 -9 13 4'
const CLOSED_EYE = 'M-12 0 C-8 7 8 7 12 0'

function OpenEyeBase({
  color,
  lash,
  irisDX = 0,
  irisDY = 0,
  scaleY = 1,
  irisR = 8,
}: {
  color: string
  lash: string
  irisDX?: number
  irisDY?: number
  scaleY?: number
  irisR?: number
}) {
  return (
    <g transform={`scale(1 ${scaleY})`}>
      <path d={EYE_WHITE} fill="#fdfdfd" />
      <g transform={`translate(${irisDX} ${irisDY})`}>
        <ellipse cx={0} cy={-1} rx={irisR} ry={irisR * 1.22} fill={color} />
        <ellipse cx={0} cy={-1} rx={irisR * 0.55} ry={irisR * 0.8} fill="#2a1e1e" />
        <ellipse cx={0} cy={irisR * 0.75} rx={irisR * 0.8} ry={irisR * 0.42} fill="#ffffff" opacity={0.28} />
        <circle cx={-irisR * 0.42} cy={-irisR * 0.75} r={irisR * 0.36} fill="#ffffff" opacity={0.95} />
        <circle cx={irisR * 0.4} cy={irisR * 0.5} r={irisR * 0.18} fill="#ffffff" opacity={0.7} />
      </g>
      <path d={LASH_LINE} fill="none" stroke={lash} strokeWidth={3.4} strokeLinecap="round" />
    </g>
  )
}

function Eye({ shape, color, lash, skin, inner }: EyeProps) {
  switch (shape) {
    case 'wide':
      return <OpenEyeBase color={color} lash={lash} scaleY={1.16} irisR={6.8} />
    case 'arc':
      return <path d={ARC_EYE} fill="none" stroke={lash} strokeWidth={4} strokeLinecap="round" />
    case 'half':
      return (
        <g>
          <OpenEyeBase color={color} lash={lash} irisDY={1} />
          <path d="M-14 -14 L14 -14 L14 -3 L-14 -3 Z" fill={skin} />
          <path d="M-13 -3 C-10 -9 10 -9 13 -3" fill="none" stroke={lash} strokeWidth={3.2} strokeLinecap="round" />
        </g>
      )
    case 'sharp':
      return (
        <g>
          <OpenEyeBase color={color} lash={lash} scaleY={0.82} irisR={7} />
          <path
            d={inner > 0 ? 'M-14 -8 L2 -2' : 'M14 -8 L-2 -2'}
            fill="none"
            stroke={lash}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        </g>
      )
    case 'teary':
      return (
        <g>
          <OpenEyeBase color={color} lash={lash} irisDY={2} irisR={8.4} />
          <ellipse cx={0} cy={7} rx={9} ry={4} fill="#cfe8ff" opacity={0.72} />
          <path d="M-12 9 C-6 13 6 13 12 9" fill="none" stroke={lash} strokeWidth={2} strokeLinecap="round" opacity={0.8} />
        </g>
      )
    case 'lookUp':
      return <OpenEyeBase color={color} lash={lash} irisDX={inner * 2.5} irisDY={-4} />
    case 'wink':
      // 呼び出し側で左右を振り分ける（inner < 0 の側を閉じる）
      return inner < 0 ? (
        <path d={ARC_EYE} fill="none" stroke={lash} strokeWidth={4} strokeLinecap="round" />
      ) : (
        <OpenEyeBase color={color} lash={lash} />
      )
    case 'open':
    default:
      return <OpenEyeBase color={color} lash={lash} />
  }
}

/** まばたき用の閉じ目（CSSアニメーションで開き目と交互に表示） */
function ClosedEye({ lash }: { lash: string }) {
  return <path d={CLOSED_EYE} fill="none" stroke={lash} strokeWidth={3.4} strokeLinecap="round" />
}

const BLINKABLE: ReadonlySet<EyeShape> = new Set<EyeShape>(['open', 'wide', 'lookUp', 'teary'])

// ---------------------------------------------------------------------------
// 感情エフェクト
// ---------------------------------------------------------------------------

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <path
      d={`M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z`}
      fill={fill}
    />
  )
}

function Effect({ id }: { id?: EffectId }) {
  if (!id) return null
  switch (id) {
    case 'sparkle':
      return (
        <g className="pt-effect">
          <Star x={222} y={58} r={13} fill="#ffd75e" />
          <Star x={80} y={80} r={9} fill="#ffe79a" />
          <Star x={238} y={104} r={7} fill="#ffd75e" />
        </g>
      )
    case 'note':
      return (
        <g className="pt-effect" fill="#e8607a">
          <ellipse cx={226} cy={72} rx={7} ry={5.5} transform="rotate(-18 226 72)" />
          <rect x={231} y={44} width={3.4} height={28} rx={1.7} />
          <path d="M231 44 C240 46 244 52 243 58 C241 52 236 50 231 51 Z" />
          <ellipse cx={70} cy={104} rx={5.5} ry={4.4} transform="rotate(-18 70 104)" />
          <rect x={74} y={82} width={3} height={22} rx={1.5} />
        </g>
      )
    case 'steam':
      return (
        <g className="pt-effect" fill="none" stroke="#f6a8b6" strokeWidth={3.4} strokeLinecap="round">
          <path d="M214 52 C222 44 212 38 220 30" />
          <path d="M232 62 C240 54 230 48 238 40" />
        </g>
      )
    case 'flash':
      return (
        <g className="pt-effect" stroke="#ffcf5c" strokeWidth={5} strokeLinecap="round">
          <path d="M150 14 L150 -2" />
          <path d="M110 24 L102 8" />
          <path d="M190 24 L198 8" />
        </g>
      )
    case 'tear':
      return (
        <g className="pt-effect">
          <path d="M174 128 C168 144 172 158 180 158 C188 158 192 146 186 130 Z" fill="#8fc7f0" opacity={0.85} />
          <path d="M120 130 C116 142 119 152 125 152 C131 152 134 142 129 130 Z" fill="#8fc7f0" opacity={0.7} />
        </g>
      )
    case 'anger':
      return (
        <g className="pt-effect" fill="#e0475c">
          <path d="M212 40 L226 40 L226 34 L238 46 L226 58 L226 52 L212 52 Z" opacity={0.9} transform="rotate(-45 225 46)" />
          <path d="M212 40 L226 40 L226 34 L238 46 L226 58 L226 52 L212 52 Z" opacity={0.9} transform="rotate(45 225 46)" />
        </g>
      )
    case 'question':
      return (
        <g className="pt-effect">
          <text x={222} y={62} fontSize={44} fontWeight={800} fill="#8a7fbf" fontFamily="system-ui, sans-serif">
            ?
          </text>
        </g>
      )
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// 服装
// ---------------------------------------------------------------------------

function Outfit({ spec }: { spec: PortraitSpec }) {
  const { outfit, outfitColor, outfitShade, innerColor, skin, skinShade } = spec
  const base = (
    <>
      <path d={BODY_PATH} fill={outfitColor} />
      <path
        d="M150 188 C130 188 120 196 98 208 C86 214 76 222 68 234 C84 238 100 232 112 222 C124 212 138 206 150 206 C162 206 176 212 188 222 C200 232 216 238 232 234 C224 222 214 214 202 208 C180 196 170 188 150 188 Z"
        fill={outfitShade}
        opacity={0.55}
      />
    </>
  )

  switch (outfit) {
    case 'shirt':
      return (
        <g>
          {base}
          <path d="M126 194 L150 244 L174 194 C166 190 158 188 150 188 C142 188 134 190 126 194 Z" fill={innerColor} />
          <path d="M126 194 L150 244 L136 250 L112 210 Z" fill={innerColor} />
          <path d="M174 194 L150 244 L164 250 L188 210 Z" fill={innerColor} />
          <path d="M124 192 L150 246 L134 252 L110 212 Z" fill={outfitShade} opacity={0.35} />
          <path d="M150 246 L150 380" stroke={outfitShade} strokeWidth={2.5} opacity={0.5} />
          <circle cx={150} cy={278} r={3.4} fill={outfitShade} />
          <circle cx={150} cy={324} r={3.4} fill={outfitShade} />
          <path d="M120 200 C130 214 170 214 180 200" fill={skin} opacity={0.9} />
          <path d="M120 200 C130 214 170 214 180 200" fill={skinShade} opacity={0.25} />
        </g>
      )
    case 'hoodie':
      return (
        <g>
          {base}
          <path
            d="M150 184 C120 184 104 198 100 220 C112 232 132 238 150 238 C168 238 188 232 200 220 C196 198 180 184 150 184 Z"
            fill={outfitShade}
          />
          <path d="M124 206 C132 224 168 224 176 206 C168 198 158 194 150 194 C142 194 132 198 124 206 Z" fill={skin} />
          <path d="M138 224 L134 300" stroke={innerColor} strokeWidth={5} strokeLinecap="round" />
          <path d="M162 224 L166 300" stroke={innerColor} strokeWidth={5} strokeLinecap="round" />
          <circle cx={134} cy={302} r={5} fill={innerColor} />
          <circle cx={166} cy={302} r={5} fill={innerColor} />
          <path d="M96 300 C106 306 116 308 126 306 L126 380 L96 380 Z" fill={outfitShade} opacity={0.35} />
        </g>
      )
    case 'blazer':
      return (
        <g>
          {base}
          <path d="M132 192 L150 240 L168 192 C162 189 156 188 150 188 C144 188 138 189 132 192 Z" fill={innerColor} />
          <path d="M150 240 L150 380 L124 380 L128 250 Z" fill={innerColor} />
          <path d="M150 240 L150 380 L176 380 L172 250 Z" fill={innerColor} />
          <path d="M128 192 L150 244 L118 292 L104 214 Z" fill={outfitShade} />
          <path d="M172 192 L150 244 L182 292 L196 214 Z" fill={outfitShade} />
          <path d="M144 244 L156 244 L164 282 L150 292 L136 282 Z" fill="#a33b4c" />
          <path d="M120 200 C130 212 170 212 180 200 C170 194 160 190 150 190 C140 190 130 194 120 200 Z" fill={skin} opacity={0.85} />
        </g>
      )
    case 'dress':
      return (
        <g>
          {base}
          <path d="M118 198 L150 250 L182 198 C170 190 160 187 150 187 C140 187 130 190 118 198 Z" fill={skin} />
          <path d="M118 198 L150 250 L182 198" fill="none" stroke={outfitShade} strokeWidth={3} />
          <path d="M104 226 C120 234 180 234 196 226 L200 246 C178 256 122 256 100 246 Z" fill={outfitShade} opacity={0.5} />
          <ellipse cx={150} cy={252} rx={12} ry={9} fill={innerColor} />
          <path d="M150 244 L142 236 M150 244 L158 236" stroke={innerColor} strokeWidth={4} strokeLinecap="round" />
        </g>
      )
    case 'hanfu':
      return (
        <g>
          {base}
          <path d="M150 190 L106 214 L98 208 C118 196 130 188 150 188 Z" fill={innerColor} />
          <path d="M120 196 L150 262 L124 276 L96 216 Z" fill={innerColor} />
          <path d="M180 196 L150 262 L176 276 L204 216 Z" fill={outfitShade} />
          <path d="M120 196 L150 262 L136 268 L108 206 Z" fill={outfitShade} opacity={0.4} />
          <path d="M96 288 C122 300 178 300 204 288 L208 316 C178 330 122 330 92 316 Z" fill="#b8484f" />
          <path d="M96 288 C122 300 178 300 204 288" fill="none" stroke="#8f3239" strokeWidth={2.5} />
          <path d="M150 316 L150 380" stroke="#e8d7a8" strokeWidth={7} />
          <path d="M124 200 C134 212 166 212 176 200 C166 194 158 191 150 191 C142 191 134 194 124 200 Z" fill={skin} opacity={0.85} />
        </g>
      )
    case 'sporty':
      return (
        <g>
          {base}
          <path d="M118 198 C130 214 170 214 182 198 C170 190 160 187 150 187 C140 187 130 190 118 198 Z" fill={skin} />
          <path d="M116 196 C128 214 172 214 184 196" fill="none" stroke={innerColor} strokeWidth={6} />
          <path d="M62 244 C82 258 96 300 100 380 L74 380 C70 306 60 268 50 254 Z" fill={innerColor} opacity={0.85} />
          <path d="M238 244 C218 258 204 300 200 380 L226 380 C230 306 240 268 250 254 Z" fill={innerColor} opacity={0.85} />
          <path d="M150 214 L150 380" stroke={outfitShade} strokeWidth={3} opacity={0.6} />
        </g>
      )
    case 'sweater':
      return (
        <g>
          {base}
          <path
            d="M124 190 C118 200 118 212 124 220 C136 228 164 228 176 220 C182 212 182 200 176 190 C168 187 158 186 150 186 C142 186 132 187 124 190 Z"
            fill={outfitShade}
          />
          <path d="M130 194 C126 202 128 210 134 214 C144 219 156 219 166 214 C172 210 174 202 170 194 C164 191 156 190 150 190 C144 190 136 191 130 194 Z" fill={skin} opacity={0.55} />
          <path d="M112 240 L112 380 M150 240 L150 380 M188 240 L188 380" stroke={outfitShade} strokeWidth={2} opacity={0.4} />
          <path d="M44 344 L256 344" stroke={outfitShade} strokeWidth={3} opacity={0.35} />
        </g>
      )
    case 'jacket':
      return (
        <g>
          {base}
          <path d="M128 192 L150 234 L172 192 C164 189 156 188 150 188 C144 188 136 189 128 192 Z" fill={innerColor} />
          <path d="M150 234 L134 380 L166 380 Z" fill={innerColor} />
          <path d="M126 192 L146 240 L112 300 L100 212 Z" fill={outfitShade} />
          <path d="M174 192 L154 240 L188 300 L200 212 Z" fill={outfitShade} />
          <path d="M100 212 L112 300" stroke={outfitColor} strokeWidth={7} strokeLinecap="round" />
          <path d="M200 212 L188 300" stroke={outfitColor} strokeWidth={7} strokeLinecap="round" />
          <path d="M118 200 C128 212 172 212 182 200 C172 194 160 190 150 190 C140 190 128 194 118 200 Z" fill={skin} opacity={0.85} />
        </g>
      )
    case 'apron':
      return (
        <g>
          <path d={BODY_PATH} fill={innerColor} />
          <path
            d="M150 188 C130 188 120 196 98 208 C86 214 76 222 68 234 C84 238 100 232 112 222 C124 212 138 206 150 206 C162 206 176 212 188 222 C200 232 216 238 232 234 C224 222 214 214 202 208 C180 196 170 188 150 188 Z"
            fill="#00000018"
          />
          <path d="M110 236 C126 226 174 226 190 236 C200 268 202 330 200 380 L100 380 C98 330 100 268 110 236 Z" fill={outfitColor} />
          <path d="M110 236 C126 226 174 226 190 236 L188 254 C172 246 128 246 112 254 Z" fill={outfitShade} />
          <path d="M126 214 L136 236 M174 214 L164 236" stroke={outfitColor} strokeWidth={7} strokeLinecap="round" />
          <path d="M104 318 L196 318" stroke={outfitShade} strokeWidth={5} />
          <rect x={124} y={330} width={52} height={34} rx={5} fill={outfitShade} opacity={0.55} />
          <path d="M120 200 C130 214 170 214 180 200 C170 193 160 190 150 190 C140 190 130 193 120 200 Z" fill={skin} />
        </g>
      )
    case 'tee':
    default:
      return (
        <g>
          {base}
          <path d="M122 198 C132 214 168 214 178 198 C168 191 159 188 150 188 C141 188 132 191 122 198 Z" fill={skin} />
          <path d="M120 196 C131 214 169 214 180 196" fill="none" stroke={outfitShade} strokeWidth={4} />
        </g>
      )
  }
}

// ---------------------------------------------------------------------------
// 装飾
// ---------------------------------------------------------------------------

function Accessories({ spec }: { spec: PortraitSpec }) {
  return (
    <g>
      {spec.glasses && (
        <g fill="none" stroke="#3b3b45" strokeWidth={3} opacity={0.92}>
          <rect x={109} y={102} width={36} height={30} rx={9} fill="#ffffff" fillOpacity={0.14} />
          <rect x={155} y={102} width={36} height={30} rx={9} fill="#ffffff" fillOpacity={0.14} />
          <path d="M145 114 L155 114" />
          <path d="M109 112 L98 108" />
          <path d="M191 112 L202 108" />
        </g>
      )}
      {spec.earring && (
        <g>
          <circle cx={98} cy={132} r={4.5} fill="#f0c36b" />
          <circle cx={202} cy={132} r={4.5} fill="#f0c36b" />
        </g>
      )}
      {spec.hairPin && (
        <g>
          <rect x={176} y={54} width={26} height={7} rx={3.5} fill={spec.hairPin} transform="rotate(-18 189 57)" />
          <circle cx={175} cy={62} r={5.5} fill={spec.hairPin} />
        </g>
      )}
      {spec.freckles && (
        <g fill={spec.skinShade} opacity={0.7}>
          <circle cx={121} cy={137} r={1.7} />
          <circle cx={128} cy={141} r={1.5} />
          <circle cx={116} cy={143} r={1.4} />
          <circle cx={179} cy={137} r={1.7} />
          <circle cx={172} cy={141} r={1.5} />
          <circle cx={184} cy={143} r={1.4} />
        </g>
      )}
    </g>
  )
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

export type PortraitCrop = 'bust' | 'face'

interface CharacterPortraitProps {
  spec: PortraitSpec
  expression?: Expression
  crop?: PortraitCrop
  /** 話している間だけ口元をアニメーションさせる */
  talking?: boolean
  /** 待機モーション（呼吸・まばたき）を有効にする */
  animate?: boolean
  className?: string
  title?: string
}

const VIEWBOX: Record<PortraitCrop, string> = {
  bust: '0 0 300 380',
  face: '70 4 160 160',
}

export function CharacterPortrait({
  spec,
  expression = 'neutral',
  crop = 'bust',
  talking = false,
  animate = true,
  className = '',
  title,
}: CharacterPortraitProps) {
  const uid = useId().replace(/:/g, '')
  const face = EXPRESSION_FACES[expression] ?? EXPRESSION_FACES.neutral
  const lash = spec.hairShade
  const lipDark = '#8f3f4c'
  const lip = '#c96b78'
  const backPaths = BACK_HAIR_PATHS[spec.backHair]
  const blushOpacity = face.blush * 0.55

  return (
    <svg
      viewBox={VIEWBOX[crop]}
      className={className}
      role="img"
      aria-label={title || 'キャラクターの立ち絵'}
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <radialGradient id={`blush-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f4707f" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#f4707f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`hairSheen-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={spec.hairLight} stopOpacity="0.75" />
          <stop offset="100%" stopColor={spec.hairLight} stopOpacity="0" />
        </linearGradient>
      </defs>

      <g className={animate ? 'pt-breathe' : undefined}>
        {/* 後ろ髪（頭部を覆うシルエット） */}
        <path d={backPaths[0]} fill={spec.hairShade} />

        {/* 体・服 */}
        <Outfit spec={spec} />

        {/* 束ねた髪（ポニーテール・ツインテール・三つ編み）は肩より手前に描く */}
        {backPaths.length > 1 && (
          <g fill={spec.hairShade}>
            {backPaths.slice(1).map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        )}

        {/* 首 */}
        <path d={NECK_PATH} fill={spec.skin} />
        <path d={NECK_SHADOW_PATH} fill={spec.skinShade} opacity={0.65} />

        {/* 頭部（表情に合わせてわずかに傾ける） */}
        <g
          className="pt-head"
          style={{ transform: `rotate(${face.tilt}deg)`, transformOrigin: '150px 180px' }}
        >
          <path d={EAR_LEFT_PATH} fill={spec.skin} />
          <path d={EAR_RIGHT_PATH} fill={spec.skin} />
          <path d={FACE_PATH} fill={spec.skin} />
          <path
            d="M100 106 C100 143 121 176 150 182 C143 174 130 150 128 106 Z"
            fill={spec.skinShade}
            opacity={0.28}
          />

          {/* 頬の赤み */}
          {face.blush > 0 && (
            <g opacity={blushOpacity}>
              <ellipse cx={118} cy={140} rx={16} ry={9} fill={`url(#blush-${uid})`} />
              <ellipse cx={182} cy={140} rx={16} ry={9} fill={`url(#blush-${uid})`} />
            </g>
          )}

          {/* 眉 */}
          <g fill="none" stroke={spec.hairShade} strokeWidth={4.6} strokeLinecap="round">
            <g transform={`translate(${FACE_CX + EYE_DX} ${BROW_Y})`}>
              <path d={BROW_PATHS[face.brow]} />
            </g>
            <g transform={`translate(${FACE_CX - EYE_DX} ${BROW_Y}) scale(-1 1)`}>
              <path d={BROW_PATHS[face.brow]} />
            </g>
          </g>

          {/* 目 */}
          <g>
            <g transform={`translate(${FACE_CX + EYE_DX} ${EYE_Y})`}>
              <g className={animate && BLINKABLE.has(face.eye) ? 'pt-eye-open' : undefined}>
                <Eye shape={face.eye} color={spec.eye} lash={lash} skin={spec.skin} inner={1} />
              </g>
              {animate && BLINKABLE.has(face.eye) && (
                <g className="pt-eye-closed">
                  <ClosedEye lash={lash} />
                </g>
              )}
            </g>
            <g transform={`translate(${FACE_CX - EYE_DX} ${EYE_Y}) scale(-1 1)`}>
              <g className={animate && BLINKABLE.has(face.eye) ? 'pt-eye-open' : undefined}>
                <Eye shape={face.eye} color={spec.eye} lash={lash} skin={spec.skin} inner={-1} />
              </g>
              {animate && BLINKABLE.has(face.eye) && (
                <g className="pt-eye-closed">
                  <ClosedEye lash={lash} />
                </g>
              )}
            </g>
          </g>

          {/* 鼻 */}
          <path
            d="M148 130 C146 137 147 140 152 141"
            fill="none"
            stroke={spec.skinShade}
            strokeWidth={2.4}
            strokeLinecap="round"
            opacity={0.9}
          />

          {/* 口 */}
          <g
            transform={`translate(${FACE_CX} ${MOUTH_Y})`}
            className={talking ? 'pt-talk' : undefined}
            style={{ transformOrigin: `${FACE_CX}px ${MOUTH_Y}px` }}
          >
            <Mouth shape={face.mouth} lip={lip} dark={lipDark} />
          </g>

          {/* 前髪 */}
          <g fill={spec.hair}>
            <path d={FRONT_HAIR_PATHS[spec.frontHair]} />
            {spec.sideLock && (
              <>
                <path d={SIDE_LOCK_LEFT} />
                <path d={SIDE_LOCK_RIGHT} />
              </>
            )}
          </g>
          <path d={FRONT_HAIR_PATHS[spec.frontHair]} fill={`url(#hairSheen-${uid})`} />
          <path
            d="M112 56 C124 44 142 40 158 44 C144 46 128 52 118 64 Z"
            fill={spec.hairLight}
            opacity={0.5}
          />

          {/* 装飾・エフェクト */}
          <Accessories spec={spec} />
          <Effect id={face.effect} />
        </g>
      </g>
    </svg>
  )
}
