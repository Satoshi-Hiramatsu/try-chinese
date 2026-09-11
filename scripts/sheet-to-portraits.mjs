/*
 * 表情シート（5列×2行＝10コマ）を、透過・位置合わせ済みの立ち絵10枚に切り出す。
 *
 *   node scripts/sheet-to-portraits.mjs --id pt-meiling \
 *     --sheet tmp/sheet-meiling.png --ref tmp/meiling-cutout.png
 *
 * シート側のコマは生成のたびに頭の位置と大きさが数%ずれるため、
 * アルファマスクから「頭頂 Y・頭の幅・頭の中心 X」を測り、
 * 参照画像（既存立ち絵の背景を抜いたもの）と同じ枠に揃えてから書き出す。
 * これにより 10 表情を切り替えても顔が動かず、顔アイコンの切り抜き位置も従来のまま使える。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/** 出力サイズ。既存立ち絵（3:4・720×960）に合わせる。 */
const OUT_W = 720
const OUT_H = 960

/** シートのコマ並び（左上から右へ、次に下段）。types.ts の Expression と対応する。 */
export const SHEET_EXPRESSIONS = [
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

const COLS = 5
const ROWS = 2

/** 背景色との距離がこれ以下なら完全な背景とみなす。 */
const KEY_LO = 34
/** 背景色との距離がこれ以上ならキャラクター本体とみなす。間は半透明で繋ぐ。 */
const KEY_HI = 92

/**
 * 背景色を画面端から実測し、その色からの距離で透過させる。
 *
 * 塗りつぶし探索ではなく色距離で判定するのは、髪と肩に囲まれて外周と繋がらない
 * 背景のくぼみが取り残されるのを防ぐため。背景はキャラクターが着ない彩度の
 * クロマキーグリーンなので、服や瞳の緑を巻き込むことはない。
 */
function chromaKey(data, w, h) {
  const n = w * h

  // 画面端から、最も緑に寄った画素を背景色の代表として拾う。
  let br = 0
  let bg = 0
  let bb = 0
  let bestScore = -1e9
  const sample = (i) => {
    const o = i * 4
    const score = data[o + 1] - Math.max(data[o], data[o + 2])
    if (score > bestScore) {
      bestScore = score
      br = data[o]
      bg = data[o + 1]
      bb = data[o + 2]
    }
  }
  for (let x = 0; x < w; x += 1) {
    sample(x)
    sample((h - 1) * w + x)
  }
  for (let y = 0; y < h; y += 1) {
    sample(y * w)
    sample(y * w + w - 1)
  }

  let removed = 0
  for (let i = 0; i < n; i += 1) {
    const o = i * 4
    const dr = data[o] - br
    const dg = data[o + 1] - bg
    const db = data[o + 2] - bb
    const d = Math.sqrt(dr * dr + dg * dg + db * db)
    if (d >= KEY_HI) continue
    const t = (d - KEY_LO) / (KEY_HI - KEY_LO)
    const alpha = Math.max(0, Math.min(255, Math.round(t * 255)))
    data[o + 3] = alpha
    if (alpha < 255) removed += 1
  }

  // 縁に乗った緑かぶりを落とす。半透明画素とその周囲だけを対象にするため、
  // 服や小物の緑は変色しない。
  const near = new Uint8Array(n)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] === 255) continue
      for (let dy = -2; dy <= 2; dy += 1) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -2; dx <= 2; dx += 1) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          near[yy * w + xx] = 1
        }
      }
    }
  }
  for (let i = 0; i < n; i += 1) {
    if (!near[i]) continue
    const o = i * 4
    const cap = Math.max(data[o], data[o + 2])
    if (data[o + 1] > cap) data[o + 1] = cap
  }

  return removed / n
}

/**
 * 不透明画素の最大連結成分だけを残す。
 * 隣のコマから食い込んだ体の切れ端が縁に残るのを防ぐ。
 */
function keepLargestBlob(data, w, h) {
  const n = w * h
  const label = new Int32Array(n).fill(-1)
  const queue = new Int32Array(n)
  let best = -1
  let bestSize = 0
  let current = 0

  const solid = (i) => data[i * 4 + 3] > 128

  for (let seed = 0; seed < n; seed += 1) {
    if (label[seed] !== -1 || !solid(seed)) continue
    let qh = 0
    let qt = 0
    queue[qt++] = seed
    label[seed] = current
    let size = 0
    while (qh < qt) {
      const i = queue[qh++]
      size += 1
      const x = i % w
      const y = (i - x) / w
      const neighbours = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        y > 0 ? i - w : -1,
        y < h - 1 ? i + w : -1,
      ]
      for (const j of neighbours) {
        if (j < 0 || label[j] !== -1 || !solid(j)) continue
        label[j] = current
        queue[qt++] = j
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = current
    }
    current += 1
  }

  for (let i = 0; i < n; i += 1) {
    if (label[i] !== best) data[i * 4 + 3] = 0
  }
}

/**
 * アルファマスクから頭の位置と大きさを測る。
 *
 * 立ち絵の枠の取り方（シートのコマと既存立ち絵で画角が違う）に左右されないよう、
 * 「頭頂から髪の幅の 0.85 倍だけ下」までを頭部とみなす帯を反復で収束させる。
 * 頬に添えた手や肩は帯より下に来るため、計測値を膨らませない。
 */
function headMetrics(data, w, h) {
  const rowExtent = (y) => {
    let minX = w
    let maxX = -1
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] <= 128) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
    return { minX, maxX, width: maxX - minX + 1 }
  }

  let topY = -1
  for (let y = 0; y < h; y += 1) {
    if (rowExtent(y).width >= 4) {
      topY = y
      break
    }
  }
  if (topY < 0) throw new Error('不透明な画素が見つかりません（クロマキーが効きすぎている可能性があります）')

  const bandExtent = (depth) => {
    let minX = w
    let maxX = -1
    const bottom = Math.min(topY + Math.round(depth), h - 1)
    for (let y = topY; y <= bottom; y += 1) {
      const row = rowExtent(y)
      if (row.maxX < 0) continue
      if (row.minX < minX) minX = row.minX
      if (row.maxX > maxX) maxX = row.maxX
    }
    return { minX, maxX, width: maxX - minX + 1 }
  }

  let head = bandExtent(h * 0.1)
  for (let i = 0; i < 3; i += 1) head = bandExtent(head.width * 0.85)

  let bottomY = topY
  for (let y = h - 1; y > topY; y -= 1) {
    if (rowExtent(y).width >= 4) {
      bottomY = y
      break
    }
  }

  return { topY, bottomY, headW: head.width, headCx: (head.minX + head.maxX) / 2 }
}

/**
 * 参照枠に合わせて拡大縮小・平行移動しながら OUT_W×OUT_H に描き直す。
 * アルファを乗算した色で補間するため、輪郭に背景色がにじまない。
 */
function reframe(src, sw, sh, m, ref, scale, outH) {
  const out = Buffer.alloc(OUT_W * outH * 4)

  for (let y = 0; y < outH; y += 1) {
    const sy = (y - ref.topY) / scale + m.topY
    for (let x = 0; x < OUT_W; x += 1) {
      const sx = (x - ref.headCx) / scale + m.headCx
      const o = (y * OUT_W + x) * 4
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) continue

      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(x0 + 1, sw - 1)
      const y1 = Math.min(y0 + 1, sh - 1)
      const fx = sx - x0
      const fy = sy - y0

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const corners = [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x1, y0, fx * (1 - fy)],
        [x0, y1, (1 - fx) * fy],
        [x1, y1, fx * fy],
      ]
      for (const [cx, cy, wgt] of corners) {
        const so = (cy * sw + cx) * 4
        const sa = src[so + 3] / 255
        r += src[so] * sa * wgt
        g += src[so + 1] * sa * wgt
        b += src[so + 2] * sa * wgt
        a += sa * wgt
      }

      if (a <= 0) continue
      out[o] = Math.round(Math.min(255, r / a))
      out[o + 1] = Math.round(Math.min(255, g / a))
      out[o + 2] = Math.round(Math.min(255, b / a))
      out[o + 3] = Math.round(Math.min(255, a * 255))
    }
  }

  return out
}

async function rawRgba(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`引数の書式が不正です: ${argv[i]}`)
    args[argv[i].slice(2)] = argv[i + 1]
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { id, sheet, ref } = args
  if (!id || !sheet || !ref) {
    throw new Error(
      '使い方: --id <pt-xxx> --sheet <シート画像> --ref <参照の透過立ち絵> [--out <出力先>] [--contact <確認用シート>] [--inset <px>]',
    )
  }
  const outDir = args.out || 'web/public/portraits'
  await mkdir(outDir, { recursive: true })

  const reference = await rawRgba(await readFile(ref))
  const refRaw = headMetrics(reference.data, reference.w, reference.h)
  // 参照画像が OUT_W×OUT_H でなくても同じ枠に揃うよう、出力サイズ基準に正規化する。
  const rx = OUT_W / reference.w
  const ry = OUT_H / reference.h
  const refFrame = { topY: refRaw.topY * ry, headW: refRaw.headW * rx, headCx: refRaw.headCx * rx }

  const sheetBytes = await readFile(sheet)
  const meta = await sharp(sheetBytes).metadata()
  const bound = (i, total, size) => Math.round((i * size) / total)
  // 生成されたシートはコマの境目に細い枠線が入ることがある。
  // 枠線が残るとクロマキーの起点が作れないため、コマの外周を少しだけ削って取り出す。
  const inset = args.inset ? Number(args.inset) : Math.round((meta.width / COLS) * 0.015)

  const panels = []
  for (let index = 0; index < SHEET_EXPRESSIONS.length; index += 1) {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const left = bound(col, COLS, meta.width) + inset
    const top = bound(row, ROWS, meta.height) + inset
    const width = bound(col + 1, COLS, meta.width) - left - inset
    const height = bound(row + 1, ROWS, meta.height) - top - inset

    const cell = await sharp(sheetBytes)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer()

    const ratio = chromaKey(cell, width, height)
    if (ratio < 0.05) {
      throw new Error(
        `${SHEET_EXPRESSIONS[index]} コマの背景を抜けませんでした（除去率 ${(ratio * 100).toFixed(1)}%）。` +
          'シートの背景がグリーンか、--inset の値を確認してください。',
      )
    }
    keepLargestBlob(cell, width, height)
    panels.push({ cell, width, height, metrics: headMetrics(cell, width, height) })
  }

  // 拡大率はコマごとの計測誤差を持ち込まないよう、10コマの中央値から1つだけ決める。
  // 位置合わせ（平行移動）だけはコマごとに行う。
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b)
    return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2
  }
  const medianHeadW = median(panels.map((p) => p.metrics.headW))
  const scale = refFrame.headW / medianHeadW

  // 出力の高さは、体が枠の下端に必ず届く位置で切る。
  // シートのコマは参照画像より腰の入り方が浅いため、3:4 に決め打ちすると
  // 胴体の切り口が枠の内側に浮いてしまう。最も体の短いコマに高さを合わせ、
  // それより長いコマは枠の外へ逃がす（切り口は画面外に隠れる）。
  const bodyHeights = panels.map((p) => (p.metrics.bottomY - p.metrics.topY) * scale)
  const outH = Math.max(
    Math.round(OUT_H * 0.6),
    Math.min(OUT_H, Math.floor(refFrame.topY + Math.min(...bodyHeights))),
  )

  const report = []
  for (let index = 0; index < panels.length; index += 1) {
    const { cell, width, height, metrics } = panels[index]
    const framed = reframe(cell, width, height, metrics, refFrame, scale, outH)
    const name = `${id}-${SHEET_EXPRESSIONS[index]}.webp`
    const buffer = await sharp(framed, { raw: { width: OUT_W, height: outH, channels: 4 } })
      .webp({ quality: 82, effort: 6, alphaQuality: 90 })
      .toBuffer()
    await writeFile(path.join(outDir, name), buffer)
    report.push({ name, headW: metrics.headW, topY: metrics.topY, kb: Math.round(buffer.length / 1024) })
  }

  // 透過の抜け残りと位置ずれを一目で確認するためのシート。
  // 背景をマゼンタで塗るので、抜き残した背景がそのまま目立つ。
  if (args.contact) {
    const cell = 240
    const cellH = Math.round((cell * outH) / OUT_W)
    const tiles = await Promise.all(
      SHEET_EXPRESSIONS.map((expression) =>
        sharp(path.join(outDir, `${id}-${expression}.webp`)).resize(cell, cellH).png().toBuffer(),
      ),
    )
    await sharp({
      create: {
        width: cell * COLS,
        height: cellH * ROWS,
        channels: 4,
        background: { r: 255, g: 0, b: 255, alpha: 1 },
      },
    })
      .composite(
        tiles.map((input, i) => ({ input, left: (i % COLS) * cell, top: Math.floor(i / COLS) * cellH })),
      )
      .png()
      .toFile(args.contact)
    console.log(`確認用シート: ${args.contact}`)
  }

  const widths = report.map((r) => r.headW)
  const spread = ((Math.max(...widths) - Math.min(...widths)) / medianHeadW) * 100
  console.log(
    `参照枠: 頭頂Y=${refFrame.topY.toFixed(0)} 頭幅=${refFrame.headW.toFixed(0)} 中心X=${refFrame.headCx.toFixed(0)} / 内側マージン=${inset}px`,
  )
  console.log(
    `コマ間の頭幅: ${Math.min(...widths)}〜${Math.max(...widths)}px（ばらつき ${spread.toFixed(1)}%・拡大率 ${scale.toFixed(3)} で統一）`,
  )
  console.log(`出力サイズ: ${OUT_W}×${outH}`)
  for (const r of report) console.log(`  ${r.name}  頭頂Y=${r.topY}  頭幅=${r.headW}  ${r.kb}KB`)
}

// generate-portrait-expressions.mjs から SHEET_EXPRESSIONS を import できるよう、直接実行時だけ動かす。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
