/**
 * 立ち絵カタログ（開発用プレビュー）
 *
 * `npm run dev:web` 起動後に http://localhost:5173/preview.html で開ける。
 * vite の build 入力は index.html のみのため、本番バンドルには含まれない。
 *
 * URL パラメータ:
 *   ?view=portraits   … 20体の立ち絵一覧（既定）
 *   ?view=expressions … 表情10パターンの一覧
 *   ?view=icons       … 顔アイコン（切り出し）一覧
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { PORTRAITS } from './data/portraits'
import { PRESET_FRIENDS } from './data/presetFriends'
import { CharacterPortrait, EXPRESSION_LABELS } from './components/CharacterPortrait'
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
          note="肌・髪型・髪色・瞳・服装・装飾・背景シーンの組み合わせがすべて異なる"
        >
          <div className="grid grid-cols-5 gap-3">
            {list.map((spec) => (
              <Card key={spec.id} label={NAME_BY_PORTRAIT.get(spec.id) || spec.id}>
                <CharacterPortrait spec={spec} expression="smile" crop="bust" animate={false} className="w-full" />
              </Card>
            ))}
          </div>
        </Section>
      ))}
    </>
  )
}

function Expressions() {
  const samples = ['pt-meiling', 'pt-wanghao', 'pt-zihan', 'pt-lijun']

  return (
    <>
      {samples.map((id, index) => (
        <Section
          key={id}
          title={NAME_BY_PORTRAIT.get(id) || id}
          note={
            index === 0
              ? '会話内容に応じて LLM が指定した表情に切り替わる（指定がない場合は返答テキストから推定）'
              : undefined
          }
        >
          <div className="grid grid-cols-10 gap-2">
            {EXPRESSIONS.map((expression) => (
              <Card key={expression} label={EXPRESSION_LABELS[expression]}>
                <CharacterPortrait
                  spec={PORTRAITS[id]}
                  expression={expression}
                  crop="bust"
                  animate={false}
                  className="w-full"
                />
              </Card>
            ))}
          </div>
        </Section>
      ))}
    </>
  )
}

function Icons() {
  return (
    <Section title="顔アイコン" note="立ち絵と同じSVGの顔部分を切り出して生成する">
      <div className="grid grid-cols-10 gap-2">
        {PORTRAIT_LIST.map((spec) => (
          <Card key={spec.id} label={NAME_BY_PORTRAIT.get(spec.id) || spec.id}>
            <CharacterPortrait spec={spec} expression="smile" crop="face" animate={false} className="w-full" />
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
