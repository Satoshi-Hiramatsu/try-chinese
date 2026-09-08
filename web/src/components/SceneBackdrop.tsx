import type { SceneId } from '../data/portraits'

/**
 * ノベルステージの背景。
 * 画像アセットを使わず、シーンごとの抽象シェイプをSVGで描く。
 * 立ち絵を邪魔しないよう、コントラストは低めに抑えている。
 */

interface SceneBackdropProps {
  scene: SceneId
  className?: string
}

function Layers({ scene }: { scene: SceneId }) {
  switch (scene) {
    case 'city':
      return (
        <g>
          <g fill="#ffffff" opacity={0.5}>
            <ellipse cx={180} cy={90} rx={130} ry={38} />
            <ellipse cx={700} cy={70} rx={160} ry={34} />
          </g>
          <g fill="#8fa4bd" opacity={0.4}>
            <rect x={40} y={230} width={90} height={220} />
            <rect x={150} y={180} width={70} height={270} />
            <rect x={240} y={260} width={100} height={190} />
            <rect x={600} y={200} width={80} height={250} />
            <rect x={700} y={250} width={110} height={200} />
            <rect x={830} y={165} width={70} height={285} />
          </g>
          <g fill="#ffffff" opacity={0.35}>
            <rect x={58} y={252} width={16} height={20} />
            <rect x={94} y={252} width={16} height={20} />
            <rect x={58} y={296} width={16} height={20} />
            <rect x={94} y={296} width={16} height={20} />
            <rect x={168} y={210} width={14} height={18} />
            <rect x={196} y={210} width={14} height={18} />
            <rect x={720} y={280} width={16} height={20} />
            <rect x={758} y={280} width={16} height={20} />
            <rect x={848} y={196} width={14} height={18} />
          </g>
        </g>
      )
    case 'cafe':
      return (
        <g>
          <rect x={0} y={300} width={960} height={150} fill="#c9a578" opacity={0.45} />
          <g fill="#b08a5e" opacity={0.4}>
            <rect x={70} y={120} width={200} height={14} rx={7} />
            <rect x={70} y={200} width={200} height={14} rx={7} />
            <circle cx={110} cy={100} r={18} />
            <circle cx={160} cy={104} r={14} />
            <circle cx={205} cy={98} r={20} />
            <rect x={96} y={176} width={22} height={26} rx={3} />
            <rect x={132} y={170} width={18} height={32} rx={3} />
            <rect x={166} y={178} width={24} height={24} rx={3} />
          </g>
          <g fill="#8a6a46" opacity={0.32}>
            <path d="M700 300 L700 220 C700 200 716 186 736 186 C756 186 772 200 772 220 L772 300 Z" />
            <ellipse cx={736} cy={186} rx={36} ry={9} />
            <path d="M772 226 C796 226 800 254 776 258" fill="none" stroke="#8a6a46" strokeWidth={9} />
          </g>
        </g>
      )
    case 'studio':
      return (
        <g>
          <g fill="#b3aad8" opacity={0.4}>
            <rect x={60} y={90} width={150} height={190} rx={6} />
            <rect x={230} y={130} width={110} height={150} rx={6} />
            <rect x={640} y={110} width={170} height={170} rx={6} />
          </g>
          <g fill="#ffffff" opacity={0.45}>
            <rect x={76} y={106} width={118} height={158} rx={4} />
            <rect x={246} y={146} width={78} height={118} rx={4} />
            <rect x={656} y={126} width={138} height={138} rx={4} />
          </g>
          <g fill="#9c92c8" opacity={0.5}>
            <circle cx={135} cy={170} r={30} />
            <path d="M96 250 L140 196 L184 250 Z" />
            <path d="M676 250 L716 200 L756 250 Z" />
            <circle cx={288} cy={192} r={22} />
          </g>
          <rect x={0} y={330} width={960} height={120} fill="#a89ed0" opacity={0.28} />
        </g>
      )
    case 'park':
      return (
        <g>
          <g fill="#8bb582" opacity={0.45}>
            <circle cx={130} cy={190} r={80} />
            <circle cx={196} cy={220} r={58} />
            <circle cx={72} cy={228} r={54} />
            <circle cx={790} cy={200} r={72} />
            <circle cx={848} cy={232} r={50} />
          </g>
          <g fill="#7a6047" opacity={0.45}>
            <rect x={122} y={250} width={20} height={110} rx={6} />
            <rect x={782} y={258} width={18} height={100} rx={6} />
          </g>
          <path d="M0 356 C240 330 720 330 960 356 L960 450 L0 450 Z" fill="#7fae76" opacity={0.4} />
        </g>
      )
    case 'night':
      return (
        <g>
          <g fill="#ffffff" opacity={0.75}>
            <circle cx={140} cy={70} r={2.4} />
            <circle cx={260} cy={44} r={1.8} />
            <circle cx={360} cy={96} r={2.2} />
            <circle cx={620} cy={58} r={2} />
            <circle cx={760} cy={92} r={2.6} />
            <circle cx={880} cy={48} r={1.8} />
            <circle cx={470} cy={40} r={1.6} />
          </g>
          <circle cx={800} cy={110} r={44} fill="#f5eec9" opacity={0.5} />
          <g fill="#1d203a" opacity={0.55}>
            <rect x={0} y={250} width={110} height={200} />
            <rect x={120} y={200} width={80} height={250} />
            <rect x={210} y={280} width={130} height={170} />
            <rect x={620} y={230} width={100} height={220} />
            <rect x={730} y={290} width={90} height={160} />
            <rect x={840} y={210} width={120} height={240} />
          </g>
          <g fill="#ffd98a" opacity={0.6}>
            <rect x={22} y={276} width={12} height={16} />
            <rect x={58} y={276} width={12} height={16} />
            <rect x={22} y={318} width={12} height={16} />
            <rect x={140} y={228} width={12} height={16} />
            <rect x={172} y={266} width={12} height={16} />
            <rect x={646} y={258} width={12} height={16} />
            <rect x={686} y={302} width={12} height={16} />
            <rect x={866} y={240} width={12} height={16} />
            <rect x={906} y={284} width={12} height={16} />
          </g>
        </g>
      )
    case 'teahouse':
      return (
        <g>
          <g stroke="#a98d5c" strokeWidth={7} opacity={0.4} fill="none">
            <path d="M0 120 L960 120" />
            <path d="M120 120 L120 450" />
            <path d="M840 120 L840 450" />
          </g>
          <g fill="#c3aa7a" opacity={0.35}>
            <path d="M0 60 L960 60 L960 120 L0 120 Z" />
            <path d="M300 120 L300 300 L660 300 L660 120 Z" opacity={0.35} />
          </g>
          <g fill="#9a7f52" opacity={0.4}>
            <path d="M700 320 C700 300 716 288 736 288 C756 288 772 300 772 320 L772 344 L700 344 Z" />
            <path d="M772 300 C792 298 796 322 774 326" fill="none" stroke="#9a7f52" strokeWidth={8} />
            <ellipse cx={736} cy={286} rx={40} ry={10} />
          </g>
          <path d="M0 380 L960 380 L960 450 L0 450 Z" fill="#b59a68" opacity={0.35} />
        </g>
      )
    case 'kitchen':
      return (
        <g>
          <rect x={0} y={310} width={960} height={140} fill="#d9a58f" opacity={0.4} />
          <g fill="#c98f76" opacity={0.42}>
            <rect x={60} y={110} width={230} height={16} rx={8} />
            <circle cx={100} cy={90} r={16} />
            <circle cx={146} cy={92} r={13} />
            <circle cx={190} cy={88} r={18} />
            <rect x={640} y={110} width={230} height={16} rx={8} />
            <path d="M700 60 L700 108 M740 56 L740 108 M780 62 L780 108" stroke="#c98f76" strokeWidth={9} />
          </g>
          <g fill="#b57a62" opacity={0.4}>
            <ellipse cx={200} cy={300} rx={70} ry={18} />
            <path d="M136 300 L136 260 C136 244 164 236 200 236 C236 236 264 244 264 260 L264 300 Z" />
          </g>
          <g stroke="#ffffff" strokeWidth={6} strokeLinecap="round" opacity={0.4} fill="none">
            <path d="M180 220 C192 204 172 194 184 178" />
            <path d="M218 224 C230 208 210 198 222 182" />
          </g>
        </g>
      )
    case 'campus':
      return (
        <g>
          <g fill="#a8bdd6" opacity={0.42}>
            <rect x={40} y={150} width={330} height={210} rx={6} />
            <rect x={590} y={170} width={330} height={190} rx={6} />
            <path d="M20 150 L205 74 L390 150 Z" />
          </g>
          <g fill="#ffffff" opacity={0.5}>
            <rect x={70} y={182} width={44} height={54} rx={3} />
            <rect x={134} y={182} width={44} height={54} rx={3} />
            <rect x={198} y={182} width={44} height={54} rx={3} />
            <rect x={262} y={182} width={44} height={54} rx={3} />
            <rect x={70} y={260} width={44} height={54} rx={3} />
            <rect x={134} y={260} width={44} height={54} rx={3} />
            <rect x={620} y={200} width={44} height={50} rx={3} />
            <rect x={684} y={200} width={44} height={50} rx={3} />
            <rect x={748} y={200} width={44} height={50} rx={3} />
          </g>
          <path d="M0 366 L960 366 L960 450 L0 450 Z" fill="#9fb6d0" opacity={0.32} />
        </g>
      )
    case 'gym':
      return (
        <g>
          <rect x={0} y={330} width={960} height={120} fill="#8fbdbd" opacity={0.35} />
          <g stroke="#7fb0b0" strokeWidth={8} opacity={0.4} fill="none">
            <path d="M0 150 L960 150" />
            <path d="M0 230 L960 230" />
          </g>
          <g fill="#6ca4a4" opacity={0.4}>
            <rect x={80} y={262} width={26} height={68} rx={8} />
            <rect x={124} y={278} width={22} height={52} rx={7} />
            <rect x={164} y={290} width={18} height={40} rx={6} />
            <circle cx={780} cy={286} r={26} />
            <circle cx={848} cy={286} r={26} />
            <rect x={780} y={278} width={68} height={16} rx={8} />
          </g>
        </g>
      )
    case 'travel':
    default:
      return (
        <g>
          <g fill="#d8b986" opacity={0.45}>
            <path d="M0 300 C160 210 300 320 460 268 C620 216 800 320 960 260 L960 450 L0 450 Z" />
          </g>
          <g fill="#c7a36c" opacity={0.4}>
            <path d="M120 300 L230 150 L340 300 Z" />
            <path d="M320 300 L430 190 L540 300 Z" />
            <path d="M620 300 L740 160 L860 300 Z" />
          </g>
          <circle cx={790} cy={100} r={46} fill="#f6dfa4" opacity={0.6} />
          <g fill="#ffffff" opacity={0.5}>
            <ellipse cx={220} cy={90} rx={90} ry={24} />
            <ellipse cx={520} cy={70} rx={70} ry={20} />
          </g>
        </g>
      )
  }
}

export function SceneBackdrop({ scene, className = '' }: SceneBackdropProps) {
  return (
    <svg
      viewBox="0 0 960 450"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full ${className}`}
    >
      <g className="scene-layer">
        <Layers scene={scene} />
      </g>
    </svg>
  )
}
