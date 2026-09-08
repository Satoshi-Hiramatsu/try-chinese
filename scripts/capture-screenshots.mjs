#!/usr/bin/env node
/**
 * README 用スクリーンショットの再取得スクリプト。
 *
 * `.github/readme-showcase.json` の定義どおりに画面を開いて撮影する。
 * playwright はドキュメント用の一時的なツールのため package.json には登録しない。
 * 実行前に一度だけ次を流す:
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *
 * 開発サーバー（npm run dev:web -- --port 5177 --strictPort）を起動したうえで:
 *
 *   node scripts/capture-screenshots.mjs           # 全件を撮影
 *   node scripts/capture-screenshots.mjs desktop-novel expressions
 *
 * 一時ファイルに撮影してから既存ファイルを置き換えるため、
 * 途中で失敗しても追跡済みのスクリーンショットを壊さない。
 */

import { readFile, mkdir, rename, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error(
    [
      'playwright が見つかりません。次を実行してから再試行してください:',
      '  npm install --no-save playwright',
      '  npx playwright install chromium',
    ].join('\n')
  )
  process.exit(1)
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = join(ROOT, '.github', 'readme-showcase.json')

/** アニメーション・キャレットを止めて、撮影ごとの差分を減らす */
const FREEZE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
  * { caret-color: transparent !important; }
`

async function waitForServer(url, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // サーバー起動待ち
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`開発サーバーが応答しません: ${url}\n先に \`npm run dev:web -- --port 5177 --strictPort\` を起動してください。`)
}

async function runStep(page, step) {
  switch (step.action) {
    case 'setLocalStorage':
      // ページ遷移前に addInitScript で流し込むため、ここでは何もしない
      return
    case 'click':
      await page.getByRole('button', { name: step.target, exact: true }).first().click()
      return
    case 'select':
      await page.getByLabel(step.target).selectOption(String(step.value))
      return
    case 'wait':
      await page.waitForTimeout(step.milliseconds ?? 300)
      return
    default:
      throw new Error(`未知のステップ: ${JSON.stringify(step)}`)
  }
}

async function capture(browser, shot, tempDir) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })

  const seed = (shot.steps || []).find((s) => s.action === 'setLocalStorage')
  if (seed) {
    await context.addInitScript((entries) => {
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
    }, seed.value)
  }

  const page = await context.newPage()
  await page.goto(shot.url, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: FREEZE_CSS })
  if (shot.waitFor) await page.waitForSelector(shot.waitFor, { state: 'visible' })
  await page.evaluate(() => document.fonts.ready)

  for (const step of shot.steps || []) await runStep(page, step)

  // レイアウト確定を待ってから撮影する
  await page.waitForTimeout(700)

  const temp = join(tempDir, `${shot.id}.png`)
  await page.screenshot({ path: temp, fullPage: Boolean(shot.fullPage) })
  await context.close()

  const dest = join(ROOT, ...shot.path.split('/'))
  await mkdir(dirname(dest), { recursive: true })
  await rename(temp, dest)
  return dest
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const only = process.argv.slice(2)
  const shots = only.length
    ? manifest.screenshots.filter((s) => only.includes(s.id))
    : manifest.screenshots

  if (!shots.length) {
    throw new Error(`撮影対象がありません。指定可能なID: ${manifest.screenshots.map((s) => s.id).join(', ')}`)
  }

  await waitForServer(manifest.start.readyUrl, manifest.start.timeoutSeconds ?? 60)

  const tempDir = join(tmpdir(), `shabe-china-shots-${process.pid}`)
  await mkdir(tempDir, { recursive: true })

  const browser = await chromium.launch()
  try {
    for (const shot of shots) {
      const dest = await capture(browser, shot, tempDir)
      console.log(`✓ ${shot.id} → ${dest}`)
    }
  } finally {
    await browser.close()
    if (existsSync(tempDir)) await rm(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
