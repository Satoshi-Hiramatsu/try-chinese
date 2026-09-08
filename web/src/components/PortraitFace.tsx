import type { Expression } from '../types'
import type { PortraitSpec } from '../data/portraits'
import { getPortraitImage } from '../data/portraits'
import { CharacterPortrait } from './CharacterPortrait'

interface PortraitFaceProps {
  spec: PortraitSpec
  /** SVG 立ち絵にフォールバックしたときの表情 */
  expression?: Expression
  title?: string
}

/**
 * 正方形の枠に顔まわりだけを収めたサムネイル。
 * イラスト立ち絵があれば顔の部分を切り出し、無ければ SVG 立ち絵で描く。
 */
export function PortraitFace({ spec, expression = 'smile', title }: PortraitFaceProps) {
  const image = getPortraitImage(spec.id)

  if (!image) {
    return (
      <CharacterPortrait
        spec={spec}
        expression={expression}
        crop="face"
        animate={false}
        className="w-full h-full"
        title={title}
      />
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <img src={image} alt={title || ''} className="pt-face" draggable={false} />
    </div>
  )
}
