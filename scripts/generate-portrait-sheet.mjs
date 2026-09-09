/*
 * 立ち絵の表情シート（5列×2行＝10コマ）を OpenRouter 経由で生成する。
 *
 *   OPENROUTER_API_KEY=sk-or-v1-... \
 *     node scripts/generate-portrait-sheet.mjs --id pt-nuan --out tmp/sheet-nuan.png
 *
 * 出力したシートは scripts/sheet-to-portraits.mjs に渡して10枚へ切り分ける。
 * 手順の全体は docs/表情差分の追加手順.md を参照。
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** 4K（5504×3072）を出せるのは preview 系のみ。無印は image_size:'4K' で 400 を返す。 */
const MODEL = 'google/gemini-3-pro-image-preview'

/**
 * 元イラストと同一人物・同一画風で10表情を描かせるプロンプト。
 *
 * コマの構図（腰まで写すか胸から上か）は指示しても従わない。強く「引いて」と
 * 書くとかえって寄った上に頭頂が切れるため、フレーミングは生成結果を受け入れ、
 * sheet-to-portraits.mjs 側の頭サイズ正規化に任せる。
 */
const PROMPT = `Using the attached character illustration as the strict identity reference, draw ONE image that is a neat 5-columns x 2-rows contact sheet of the SAME character showing 10 different facial expressions.

ABSOLUTE REQUIREMENTS
- Identity lock: exactly the same face, eye shape and colour, eyebrows, nose, mouth shape, hairstyle, hair colour, hair ornaments, accessories, glasses (if any), skin tone, outfit and outfit colours as the reference. Do not redesign anything.
- Same art style, line weight and cel-shaded anime illustration rendering as the reference.
- Background: FLAT PURE CHROMA GREEN (#00B140) filling every cell edge to edge. No gradients, no shadows on the background, no props, no scenery, no text, no labels, no panel borders, no white gutters between cells.
- Framing lock: in EVERY one of the 10 cells the character is drawn waist-up, facing the viewer, centred horizontally, at the SAME scale, with the top of the hair at the same height and the body cropped at the same waist height. The head must occupy the same size in all 10 cells.
- Cells are laid out edge to edge in a strict 5 x 2 grid, equal size, no separators.

THE 10 EXPRESSIONS, in reading order (left to right, top row then bottom row)
1. neutral - calm, relaxed, mouth closed, looking at the viewer
2. smile - gentle closed-mouth smile, softened eyes
3. joy - bright open happy smile, eyes sparkling, slight head tilt
4. laugh - laughing with eyes closed in happy arcs, open mouth, one hand near the cheek
5. shy - blushing, eyes glancing away, shoulders drawn in slightly
6. surprised - wide open eyes, raised eyebrows, small open mouth
7. sad - downcast eyes, lowered eyebrows, small frown
8. angry - furrowed brows, pouting, cheeks puffed slightly
9. thinking - eyes looking up to the side, finger touching the chin
10. wink - one eye closed in a playful wink, cheerful smile, small peace sign near the face

Draw only the contact sheet. No captions, no numbers, no watermark.`

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`引数の書式が不正です: ${argv[i]}`)
    args[argv[i].slice(2)] = argv[i + 1]
  }
  return args
}

async function main() {
  const { id, out } = parseArgs(process.argv.slice(2))
  if (!id || !out) {
    throw new Error('使い方: --id <pt-xxx> --out <出力先のPNG>')
  }
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('環境変数 OPENROUTER_API_KEY を設定してください')

  const refPath = path.join('web', 'public', 'portraits', `${id}.jpg`)
  const reference = (await readFile(refPath)).toString('base64')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      modalities: ['image', 'text'],
      image_config: { aspect_ratio: '16:9', image_size: '4K' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${reference}` } },
          ],
        },
      ],
    }),
  })

  const json = await res.json()
  if (!res.ok || json.error) {
    throw new Error(`生成に失敗しました (HTTP ${res.status}): ${JSON.stringify(json.error ?? json)}`)
  }

  // 応答には低解像度プレビューと本命が入る。最後の1枚（5504×3072）だけを使う。
  const images = json.choices?.[0]?.message?.images ?? []
  if (!images.length) throw new Error('画像が返りませんでした')
  const body = Buffer.from((images.at(-1).image_url?.url ?? '').split(',')[1], 'base64')
  await writeFile(out, body)

  console.log(
    `${id}: $${json.usage.cost.toFixed(3)} / ${(body.length / 1024 / 1024).toFixed(1)}MB -> ${out}\n` +
      `次: node scripts/sheet-to-portraits.mjs --id ${id} --sheet ${out} ` +
      `--ref web/public/portraits/pt-shixun-neutral.webp\n` +
      `（シートは 5504×3072 になる。1376×768 ならプレビュー画像を掴んでいる）`
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
