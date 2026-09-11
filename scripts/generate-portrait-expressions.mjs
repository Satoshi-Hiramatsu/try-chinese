/*
 * 立ち絵の表情差分10枚を Codex CLI の組み込み画像生成（image_gen）で作り、
 * 5列×2行のシート（約 5430×2896）に合成する。
 *
 *   node scripts/generate-portrait-expressions.mjs --id pt-nuan
 *     → tmp/expr-pt-nuan/{sheet.png, <expression>.png, <expression>.log}
 *     （途中で止まっても同じコマンドで再開できる。生成済みの表情は飛ばす）
 *   node scripts/generate-portrait-expressions.mjs --id pt-nuan --compose-only true
 *     → <expression>.png を差し替えたあと、sheet.png の合成だけをやり直す
 *
 * 出来上がった sheet.png は scripts/sheet-to-portraits.mjs に渡して10枚へ切り分ける。
 * 手順の全体は docs/表情差分の追加手順.md を参照。
 *
 * OpenRouter 版（generate-portrait-sheet.mjs）との違い:
 * - 課金は ChatGPT アカウントのプラン枠。OpenRouter のクレジットは使わない。
 * - Codex の image_gen は出力サイズを指定できず、1枚 1000px 前後しか出ない。
 *   シート1枚に10コマ詰めると1コマ 330px で使い物にならないため、
 *   まず低解像度のシートを1枚作って「表情の並び・画風・構図」の参照にし、
 *   そのうえで1表情ずつ個別に生成して、最後にこちらでシートへ合成する。
 * - Codex の Windows サンドボックスはファイルを読めない（deny-read ACLs）ので、
 *   参照画像は `-i` で添付し、生成物は ~/.codex/generated_images から拾う。
 */
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { SHEET_EXPRESSIONS } from './sheet-to-portraits.mjs'

const COLS = 5
const ROWS = 2

/** 各表情の指示。シートのプロンプト（generate-portrait-sheet.mjs）と同じ内容。 */
const EXPRESSION_PROMPTS = {
  neutral: 'calm and relaxed, mouth closed, no smile, looking straight at the viewer, arms relaxed at the sides',
  smile: 'gentle closed-mouth smile, softened eyes, arms relaxed at the sides',
  joy: 'bright open happy smile, eyes sparkling, slight head tilt',
  laugh: 'laughing with eyes closed in happy arcs, open mouth, one hand near the cheek',
  shy: 'blushing, eyes glancing away, shoulders drawn in slightly',
  surprised: 'wide open eyes, raised eyebrows, small open mouth',
  sad: 'downcast eyes, lowered eyebrows, small frown',
  angry: 'furrowed brows, pouting, cheeks puffed slightly',
  thinking: 'eyes looking up to the side, finger touching the chin',
  wink: 'one eye closed in a playful wink, cheerful smile, small peace sign near the face (hand fully inside the frame)',
}

/**
 * Codex への作業指示。
 * Windows サンドボックスではファイルが読めないため、添付画像をパスで参照させると必ず失敗する。
 * 「会話に添付済みの画像をそのまま使う」ことを明示し、失敗時もパス経由へ逃げないよう釘を刺す。
 */
const AGENT_RULES =
  'The reference images are ALREADY attached to this conversation and visible to you. ' +
  'Pass them to image_gen as the images in context; NEVER reference them by file path and never try to read any file. ' +
  'If image_gen reports a filesystem or sandbox error, retry once using only the images visible in the conversation. ' +
  'No file operations, no shell commands, no skill documents. ' +
  'Report only the absolute path of the generated file and its size (width x height).'

/** 参照用シート（低解像度）のプロンプト。 */
const SHEET_PROMPT = `Using the attached character illustration as the strict identity reference, draw ONE image that is a neat 5-columns x 2-rows contact sheet of the SAME character showing 10 different facial expressions. Landscape orientation.

ABSOLUTE REQUIREMENTS
- Identity lock: exactly the same face, eye shape and colour, eyebrows, nose, mouth shape, hairstyle, hair colour, hair ornaments, accessories, glasses (if any), skin tone, outfit and outfit colours as the reference. Do not redesign anything.
- Same art style, line weight and cel-shaded anime illustration rendering as the reference.
- Background: FLAT PURE CHROMA GREEN (#00B140) filling every cell edge to edge. No gradients, no shadows, no props, no scenery, no text, no labels, no panel borders, no white gutters between cells.
- Framing lock: in EVERY one of the 10 cells the character is drawn waist-up, facing the viewer, centred horizontally, at the SAME scale, with the top of the hair at the same height. The head must occupy the same size in all 10 cells.
- Cells are laid out edge to edge in a strict 5 x 2 grid, equal size, no separators.

THE 10 EXPRESSIONS, in reading order (left to right, top row then bottom row)
${SHEET_EXPRESSIONS.map((e, i) => `${i + 1}. ${e} - ${EXPRESSION_PROMPTS[e]}`).join('\n')}

Draw only the contact sheet. No captions, no numbers, no watermark.

${AGENT_RULES}`


function singlePrompt(expression) {
  return `Two images are attached: Image 1 is the original character illustration (identity reference). Image 2 is a 5x2 contact sheet of the same character with 10 expressions (style and framing reference).

Using the built-in image_gen tool, generate exactly ONE portrait-orientation image (tallest resolution the tool allows, aspect 3:4 or 2:3) of the SAME character.

- Identity lock: exactly the same face, eye shape and colour, eyebrows, hairstyle, hair colour, hair ornaments, accessories, glasses (if any), outfit and outfit colours and skin tone as Image 1 and Image 2. Do not redesign anything.
- Same cel-shaded anime illustration style and line weight as Image 2.
- Expression: ${expression.toUpperCase()} - ${EXPRESSION_PROMPTS[expression]}
- Framing: waist-up, facing the viewer, centred, head fully inside the frame with a little space above the hair. Same scale and head size as the cells of Image 2.
- Background: FLAT PURE CHROMA GREEN (#00B140) edge to edge. No gradient, no shadow, no props, no text.

${AGENT_RULES}`
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`引数の書式が不正です: ${argv[i]}`)
    args[argv[i].slice(2)] = argv[i + 1]
  }
  return args
}

const GENERATED_DIR = path.join(os.homedir(), '.codex', 'generated_images')

/**
 * そのセッションが ~/.codex/generated_images/<session id>/ に書いた最新の PNG。
 * 並列実行中に他の表情の生成物を掴まないよう、セッション ID で絞る。
 */
async function newestGeneratedInSession(sessionId) {
  if (!sessionId) return null
  const dir = path.join(GENERATED_DIR, sessionId)
  let best = null
  for (const file of await readdir(dir).catch(() => [])) {
    if (!file.endsWith('.png')) continue
    const full = path.join(dir, file)
    const { mtimeMs } = await stat(full)
    if (!best || mtimeMs > best.mtimeMs) best = { full, mtimeMs }
  }
  return best?.full ?? null
}

/**
 * Codex に画像を添付してプロンプトを投げ、生成された PNG のパスを返す。
 * Codex の報告文からパスを拾い、拾えなければそのセッションの最新ファイルにフォールバックする。
 */
async function runCodex(prompt, images, logPath) {
  const args = ['exec', '--skip-git-repo-check', '-s', 'read-only']
  for (const image of images) args.push('-i', image)
  args.push('-')

  // Windows では codex が .cmd シムなので shell 経由で起動する。引数は自前で引用符を付ける。
  const command = ['codex', ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')
  const output = await new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, windowsHide: true })
    const chunks = []
    child.stdout.on('data', (c) => chunks.push(c))
    child.stderr.on('data', (c) => chunks.push(c))
    child.on('error', reject)
    child.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')))
    child.stdin.end(prompt)
  })
  await writeFile(logPath, output)

  const reported = [...output.matchAll(/[A-Za-z]:[^\s"']*generated_images[^\s"']*\.png/g)].at(-1)?.[0]
  const sessionId = output.match(/^session id: (\S+)/m)?.[1]
  return {
    found: reported ?? (await newestGeneratedInSession(sessionId)),
    usageLimit: /usage_limit_reached|hit your usage limit/.test(output),
  }
}

/** Codex 側の一時的な失敗（サンドボックス・ネットワーク）に備え、数回まで投げ直す。 */
async function runCodexWithRetry(prompt, images, logPath, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { found, usageLimit } = await runCodex(
      prompt,
      images,
      attempt === 1 ? logPath : logPath.replace(/\.log$/, `-retry${attempt}.log`),
    )
    if (found) return found
    // 利用上限は待つしかない。投げ直しても増えないので即座に止める。
    if (usageLimit) throw new Error(`Codex の利用上限に達しました。リセット後に同じコマンドで再開してください。ログ: ${logPath}`)
    console.log(`  再試行 ${attempt}/${attempts - 1}: ${path.basename(logPath, '.log')}`)
  }
  throw new Error(`生成物が見つかりません。ログ: ${logPath}`)
}

/** 10枚を最小サイズに揃えて中央クロップし、5×2 のシートへ合成する。 */
async function composeSheet(dir, out) {
  const files = SHEET_EXPRESSIONS.map((e) => path.join(dir, `${e}.png`))
  const metas = await Promise.all(files.map((f) => sharp(f).metadata()))
  const cw = Math.min(...metas.map((m) => m.width))
  const ch = Math.min(...metas.map((m) => m.height))
  const cells = await Promise.all(
    files.map(async (file, i) => ({
      input: await sharp(file)
        .extract({ left: Math.floor((metas[i].width - cw) / 2), top: 0, width: cw, height: ch })
        .png()
        .toBuffer(),
      left: (i % COLS) * cw,
      top: Math.floor(i / COLS) * ch,
    })),
  )
  await sharp({ create: { width: cw * COLS, height: ch * ROWS, channels: 3, background: '#00B140' } })
    .composite(cells)
    .png()
    .toFile(out)
  return { width: cw * COLS, height: ch * ROWS, cw, ch }
}

async function mapLimit(items, limit, fn) {
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    }),
  )
  return results
}

/** 既に生成済みのファイルがあれば true。中断からの再開に使う。 */
async function exists(file) {
  return stat(file).then(() => true, () => false)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { id } = args
  if (!id) {
    throw new Error('使い方: --id <pt-xxx> [--out <出力ディレクトリ>] [--parallel <同時実行数>] [--compose-only true]')
  }
  const outDir = args.out || path.join('tmp', `expr-${id}`)
  const parallel = Number(args.parallel || 3)
  await mkdir(outDir, { recursive: true })
  const sheet = path.join(outDir, 'sheet.png')
  const finish = async () => {
    const { width, height, cw, ch } = await composeSheet(outDir, sheet)
    console.log(
      `${id}: ${sheet} (${width}×${height}, 1コマ ${cw}×${ch})
` +
        `次: node scripts/sheet-to-portraits.mjs --id ${id} --sheet ${sheet} ` +
        `--ref web/public/portraits/pt-shixun-neutral.webp --contact ${path.join(outDir, 'contact.png')}`,
    )
  }

  // 気に入らない表情だけ <expression>.png を差し替えたあと、合成だけをやり直す。
  if (args['compose-only'] === 'true') {
    await finish()
    return
  }

  // Codex は -i で添付したファイルだけ読める。ASCII のみの一時パスに複製して渡す。
  const scratch = path.join(os.tmpdir(), `shabe-china-${id}`)
  await mkdir(scratch, { recursive: true })
  const ref = path.join(scratch, 'ref.jpg')
  await copyFile(path.join('web', 'public', 'portraits', `${id}.jpg`), ref)

  // 参照シート・各表情とも、既にあるものは作り直さない（利用上限などで中断したあと再開できるように）。
  const sheetRef = path.join(scratch, 'sheet.png')
  const savedSheet = path.join(outDir, 'reference-sheet.png')
  if (await exists(savedSheet)) {
    console.log(`${id}: 参照シートは生成済み（${savedSheet}）`)
    await copyFile(savedSheet, sheetRef)
  } else {
    console.log(`${id}: 参照シートを生成中…`)
    const sheetSrc = await runCodexWithRetry(SHEET_PROMPT, [ref], path.join(outDir, 'reference-sheet.log'))
    await copyFile(sheetSrc, sheetRef)
    await copyFile(sheetSrc, savedSheet)
  }

  await mapLimit(SHEET_EXPRESSIONS, parallel, async (expression) => {
    const target = path.join(outDir, `${expression}.png`)
    if (await exists(target)) {
      console.log(`  ${expression}: 生成済み`)
      return
    }
    const src = await runCodexWithRetry(singlePrompt(expression), [ref, sheetRef], path.join(outDir, `${expression}.log`))
    await copyFile(src, target)
    const { width, height } = await sharp(src).metadata()
    console.log(`  ${expression}: ${width}×${height}`)
  })

  await finish()
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
