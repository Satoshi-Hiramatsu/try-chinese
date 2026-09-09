import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

/**
 * 立ち絵（Portrait）とプリセット Friend の整合性テスト。
 *
 * - 同じ顔グラフィックのキャラクターが存在しないこと
 * - 男女それぞれ10人ずつ揃っていること
 * - 表情が10パターン定義され、テキストから推定できること
 */

const EXPRESSIONS = [
  'neutral',
  'smile',
  'joy',
  'laugh',
  'shy',
  'surprised',
  'sad',
  'angry',
  'thinking',
  'wink',
]

function load(relPath, requireImpl = () => ({})) {
  const source = ts.transpileModule(
    readFileSync(new URL(relPath, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText
  const exports = {}
  vm.runInNewContext(source, { exports, module: { exports }, console, require: requireImpl })
  return exports
}

const {
  PORTRAITS,
  PORTRAIT_EXPRESSION_IDS,
  SCENE_IMAGE_IDS,
  getPortraitLayer,
  getSceneImage,
  isPortraitLocked,
} = load('../src/data/portraits.ts')
const { PRESET_FRIENDS } = load('../src/data/presetFriends.ts')
const { BACK_HAIR_PATHS, FRONT_HAIR_PATHS } = load('../src/data/portraitParts.ts')
const { inferExpression, resolveExpression } = load('../src/services/expression.ts', () => ({
  isExpression: (v) => EXPRESSIONS.includes(v),
}))

const portraitList = Object.values(PORTRAITS)

test('立ち絵は20体あり、男女それぞれ10体ずつ定義されている', () => {
  assert.equal(portraitList.length, 20)
  assert.equal(portraitList.filter((p) => p.gender === 'female').length, 10)
  assert.equal(portraitList.filter((p) => p.gender === 'male').length, 10)
})

test('同じ顔グラフィックの立ち絵が存在しない', () => {
  // 顔の印象を決めるパラメータの組み合わせが一意であることを確認する
  const faceKeys = portraitList.map((p) =>
    [p.skin, p.hair, p.eye, p.backHair, p.frontHair, p.glasses ? 'g' : '', p.hairPin || ''].join('|')
  )
  assert.equal(new Set(faceKeys).size, portraitList.length)

  // 服装・シーンまで含めた全身のシルエットも重複しない
  const fullKeys = portraitList.map((p) =>
    [p.skin, p.hair, p.eye, p.backHair, p.frontHair, p.outfit, p.outfitColor, p.scene].join('|')
  )
  assert.equal(new Set(fullKeys).size, portraitList.length)
})

test('立ち絵が参照する髪型パスがすべて定義されている', () => {
  for (const p of portraitList) {
    assert.ok(BACK_HAIR_PATHS[p.backHair], `後ろ髪が未定義: ${p.backHair}`)
    assert.ok(FRONT_HAIR_PATHS[p.frontHair], `前髪が未定義: ${p.frontHair}`)
  }
})

test('立ち絵の色指定がすべて有効な16進カラーである', () => {
  const hex = /^#[0-9a-fA-F]{6}$/
  for (const p of portraitList) {
    for (const key of ['skin', 'skinShade', 'hair', 'hairShade', 'hairLight', 'eye', 'outfitColor', 'outfitShade', 'innerColor']) {
      assert.match(p[key], hex, `${p.id} の ${key} が不正: ${p[key]}`)
    }
    if (p.hairPin) assert.match(p.hairPin, hex, `${p.id} の hairPin が不正`)
  }
})

test('表情差分を持つ立ち絵は、10表情ぶんの透過画像がすべて揃っている', () => {
  for (const id of PORTRAIT_EXPRESSION_IDS) {
    assert.ok(PORTRAITS[id], `未定義の立ち絵に表情差分が指定されている: ${id}`)
    for (const expression of EXPRESSIONS) {
      const url = getPortraitLayer(id, expression)
      assert.equal(url, `/portraits/${id}-${expression}.webp`)
      assert.ok(
        existsSync(new URL(`../public${url}`, import.meta.url)),
        `表情差分の画像が見つからない: ${url}`
      )
    }
  }
})

test('表情差分を持たない立ち絵は透過画像を要求しない', () => {
  for (const id of Object.keys(PORTRAITS)) {
    if (PORTRAIT_EXPRESSION_IDS.has(id)) continue
    assert.equal(getPortraitLayer(id, 'smile'), null, `${id} が表情差分を返している`)
  }
})

test('シーン背景イラストは、宣言されたシーンぶんの画像が揃っている', () => {
  const scenes = new Set(Object.values(PORTRAITS).map((p) => p.scene))
  for (const scene of SCENE_IMAGE_IDS) {
    assert.ok(scenes.has(scene), `どの立ち絵も使っていないシーン: ${scene}`)
    const url = getSceneImage(scene)
    assert.equal(url, `/scenes/${scene}.webp`)
    assert.ok(
      existsSync(new URL(`../public${url}`, import.meta.url)),
      `シーン背景の画像が見つからない: ${url}`
    )
  }
  for (const scene of scenes) {
    if (!SCENE_IMAGE_IDS.has(scene)) assert.equal(getSceneImage(scene), null)
  }
})

test('表情差分の画像が揃っている立ち絵は、すべて有効になっている', () => {
  // 10枚を生成したのに PORTRAIT_EXPRESSION_IDS へ入れ忘れる、という取りこぼしを検出する。
  for (const id of Object.keys(PORTRAITS)) {
    if (PORTRAIT_EXPRESSION_IDS.has(id)) continue
    const complete = EXPRESSIONS.every((expression) =>
      existsSync(new URL(`../public/portraits/${id}-${expression}.webp`, import.meta.url))
    )
    assert.ok(!complete, `${id} は10表情が揃っている。PORTRAIT_EXPRESSION_IDS へ追加すること`)
  }
})

test('表情差分が無い立ち絵はロックされ、揃った立ち絵は解放される', () => {
  for (const id of Object.keys(PORTRAITS)) {
    assert.equal(
      isPortraitLocked(id),
      !PORTRAIT_EXPRESSION_IDS.has(id),
      `${id} のロック状態が表情差分の有無と食い違っている`
    )
  }
  // 未定義のIDやカスタム友達の未設定立ち絵をロック扱いにしない
  assert.equal(isPortraitLocked(undefined), false)
  assert.equal(isPortraitLocked('pt-unknown'), false)
})

test('初期表示の友達はロックされていない', () => {
  // App が既定で選ぶ friend-meiling が選べないと、起動直後に会話できなくなる。
  const first = PRESET_FRIENDS[0]
  assert.equal(first.id, 'friend-meiling')
  assert.equal(isPortraitLocked(first.portraitId), false)
})

test('シーン背景が未生成でも、透過立ち絵の背後は必ず埋まる', () => {
  // 透過立ち絵は背景を持たないので、シーン背景イラストが無い場合は
  // SVG の SceneBackdrop へフォールバックする。どちらも無いと背後が空になる。
  const backdropScenes = new Set(
    readFileSync(new URL('../src/components/SceneBackdrop.tsx', import.meta.url), 'utf8')
      .matchAll(/case '([a-z]+)':/g)
      .map((m) => m[1])
  )
  for (const id of PORTRAIT_EXPRESSION_IDS) {
    const { scene } = PORTRAITS[id]
    assert.ok(
      SCENE_IMAGE_IDS.has(scene) || backdropScenes.has(scene),
      `${id} のシーン（${scene}）に背景イラストも SceneBackdrop も無い`
    )
  }
})

test('プリセットの友達は男女それぞれ10人ずついる', () => {
  assert.equal(PRESET_FRIENDS.length, 20)
  assert.equal(PRESET_FRIENDS.filter((f) => f.voice.gender === 'female').length, 10)
  assert.equal(PRESET_FRIENDS.filter((f) => f.voice.gender === 'male').length, 10)
})

test('友達ごとに固有の立ち絵が割り当てられている', () => {
  const ids = PRESET_FRIENDS.map((f) => f.portraitId)
  assert.equal(new Set(ids).size, PRESET_FRIENDS.length)
  for (const f of PRESET_FRIENDS) {
    const spec = PORTRAITS[f.portraitId]
    assert.ok(spec, `${f.name} の立ち絵が見つからない: ${f.portraitId}`)
    assert.equal(spec.gender, f.voice.gender, `${f.name} の立ち絵と声の性別が一致しない`)
  }
})

test('友達のIDと名前が重複していない', () => {
  assert.equal(new Set(PRESET_FRIENDS.map((f) => f.id)).size, PRESET_FRIENDS.length)
  assert.equal(new Set(PRESET_FRIENDS.map((f) => f.name)).size, PRESET_FRIENDS.length)
})

test('返答テキストから表情を推定できる', () => {
  assert.equal(inferExpression('哈哈，你说得对！'), 'laugh')
  assert.equal(inferExpression('对不起，我今天不能去。'), 'sad')
  assert.equal(inferExpression('真的吗？我不敢相信！'), 'surprised')
  assert.equal(inferExpression('太好了，我很期待！'), 'joy')
  assert.equal(inferExpression('嗯…让我想想。'), 'thinking')
  assert.equal(inferExpression('你过奖了，我还在学。'), 'shy')
  assert.equal(inferExpression('今天天气不错。'), 'neutral')
  assert.equal(inferExpression('你喜欢什么颜色？'), 'smile')
})

test('推定結果は必ず定義済みの10パターンに収まる', () => {
  const samples = ['你好', '哈哈！', '？', '生气了', '哇！', '', '我们走吧。']
  for (const zh of samples) {
    assert.ok(EXPRESSIONS.includes(inferExpression(zh)), `未定義の表情: ${zh}`)
  }
})

test('APIが返した表情は優先され、不正値はテキスト推定にフォールバックする', () => {
  assert.equal(resolveExpression('angry', '你好。'), 'angry')
  assert.equal(resolveExpression('excited', '哈哈，真有意思！'), 'laugh')
  assert.equal(resolveExpression(undefined, '太好了！'), 'joy')
})
