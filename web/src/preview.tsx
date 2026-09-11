/**
 * 立ち絵カタログ（開発用プレビュー）
 *
 * `npm run dev:web` 起動後に http://localhost:5173/preview.html で開ける。
 * vite の build 入力は index.html のみのため、本番バンドルには含まれない。
 *
 * URL パラメータ:
 *   ?view=portraits   … 20体のイラスト立ち絵一覧（既定）
 *   ?view=expressions … 表情10パターンの一覧
 *   ?view=icons       … 顔アイコン（切り出し）一覧
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {
  PORTRAITS,
  PORTRAIT_EXPRESSION_IDS,
  getPortraitImage,
  getPortraitLayer,
  getSceneImage,
  hasPortraitExpressions,
} from './data/portraits'
import { PRESET_FRIENDS } from './data/presetFriends'
import { CharacterPortrait, EXPRESSION_LABELS } from './components/CharacterPortrait'
import { PortraitFace } from './components/PortraitFace'
import { EXPRESSIONS } from './types'

const PORTRAIT_LIST = Object.values(PORTRAITS)

/** 立ち絵IDから、その立ち絵を使っている Friend の表示名を引く */
const NAME_BY_PORTRAIT = new Map(
  PRESET_FRIENDS.filter((f) => f.portraitId).map((f) => [f.portraitId as string, f.name])
)

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 bg-white rounded-2xl border border-rose-100 shadow-xs overflow-hidden">
      <div className="bg-gradient-to-b from-rose-50/70 to-amber-50/50">{children}</div>
      <figcaption className="text-[11px] text-stone-600 text-center py-1.5 px-1 truncate">
        {label}
      </figcaption>
    </figure>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-stone-900 m-0 mb-1">{title}</h2>
      {note && <p className="text-xs text-stone-500 m-0 mb-3">{note}</p>}
      {children}
    </section>
  )
}

function Portraits() {
  const female = PORTRAIT_LIST.filter((p) => p.gender === 'female')
  const male = PORTRAIT_LIST.filter((p) => p.gender === 'male')

  return (
    <>
      {[
        { title: `女性 ${female.length} 人`, list: female },
        { title: `男性 ${male.length} 人`, list: male },
      ].map(({ title, list }) => (
        <Section
          key={title}
          title={title}
          note="趣味・職業・居住地に合わせて描き起こしたイラスト立ち絵"
        >
          <div className="grid grid-cols-5 gap-3">
            {list.map((spec) => {
              const image = getPortraitImage(spec.id)
              return (
                <Card key={spec.id} label={NAME_BY_PORTRAIT.get(spec.id) || spec.id}>
                  {image ? (
                    <img src={image} alt={spec.id} className="w-full block" />
                  ) : (
                    <CharacterPortrait spec={spec} expression="smile" crop="bust" animate={false} className="w-full" />
                  )}
                </Card>
              )
            })}
          </div>
        </Section>
      ))}
    </>
  )
}

function Expressions() {
  // 表情差分を持つ立ち絵をすべて並べ、未対応の立ち絵が残っていれば1体だけ添えて対比する。
  const locked = PORTRAIT_LIST.find((spec) => !hasPortraitExpressions(spec.id))
  const samples = [...PORTRAIT_EXPRESSION_IDS, ...(locked ? [locked.id] : [])]

  return (
    <>
      {samples.map((id) => {
        const spec = PORTRAITS[id]
        const backdrop = getSceneImage(spec.scene)
        return (
          <Section
            key={id}
            title={NAME_BY_PORTRAIT.get(id) || id}
            note={
              hasPortraitExpressions(id)
                ? '背景と分離した透過イラスト。背景は同じまま、キャラクターだけが切り替わる'
                : 'まだ表情差分を持たない立ち絵。カスタム友達と同じくSVG立ち絵で描画する'
            }
          >
            <div className="grid grid-cols-10 gap-2">
              {EXPRESSIONS.map((expression) => (
                <Card key={expression} label={EXPRESSION_LABELS[expression]}>
                  {hasPortraitExpressions(id) ? (
                    <div className="relative aspect-3/4">
                      {backdrop && (
                        <img src={backdrop} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      <img
                        src={getPortraitLayer(id, expression) || ''}
                        alt={`${id} ${expression}`}
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <CharacterPortrait
                      spec={spec}
                      expression={expression}
                      crop="bust"
                      animate={false}
                      className="w-full"
                    />
                  )}
                </Card>
              ))}
            </div>
          </Section>
        )
      })}
    </>
  )
}

function Icons() {
  return (
    <Section title="顔アイコン" note="立ち絵の顔部分を切り出して生成する">
      <div className="grid grid-cols-10 gap-2">
        {PORTRAIT_LIST.map((spec) => (
          <Card key={spec.id} label={NAME_BY_PORTRAIT.get(spec.id) || spec.id}>
            <div className="aspect-square">
              <PortraitFace spec={spec} title={spec.id} />
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}

function Preview() {
  const view = new URLSearchParams(location.search).get('view') || 'portraits'

  return (
    <main
      id="preview-root"
      className="min-h-screen bg-gradient-to-br from-amber-50/60 via-rose-50/40 to-orange-50/50 p-6 font-sans text-stone-800"
    >
      {view === 'expressions' ? <Expressions /> : view === 'icons' ? <Icons /> : <Portraits />}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
)
