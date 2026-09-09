import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const header = readFileSync(new URL('../src/components/Header.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')

test('PWAとsafe-areaに対応したviewport設定を維持する', () => {
  assert.match(html, /viewport-fit=cover/)
  assert.match(html, /apple-mobile-web-app-capable/)
  assert.match(viteConfig, /display:\s*'standalone'/)
  assert.match(css, /env\(safe-area-inset-(?:top|right|bottom|left)\)/)
})

test('スマートフォンでは必須ヘッダー操作とその他メニューを分離する', () => {
  assert.match(header, /className="hsk-selector/)
  assert.match(header, /aria-controls="header-more-menu"/)
  assert.match(header, />その他</)
  assert.doesNotMatch(header, /overflow-x-auto/)
})

test('横画面は立ち絵を優先し入力欄を画面内に保つ', () => {
  assert.match(css, /orientation:\s*landscape/)
  assert.match(css, /--vn-figure-w:\s*44%/)
  assert.match(css, /\.chat-input-shell textarea\s*\{[^}]*max-height:/s)
  assert.match(css, /\.chat-input-shell button\s*\{[^}]*min-height:\s*2\.5rem/s)
})

test('補助操作は自動非表示でもフォーカス可能なまま残らない', () => {
  assert.match(app, /AUX_CONTROLS_HIDE_DELAY_MS = 4000/)
  assert.match(app, /setAreAuxControlsVisible\(false\)/)
  assert.match(css, /\.aux-controls-hidden \.vn-controls\s*\{[^}]*visibility:\s*hidden/s)
  assert.match(css, /\.aux-controls-hidden \.vn-controls\s*\{[^}]*pointer-events:\s*none/s)
})

test('横画面はヘッダーを畳みブラウザのアドレスバーも隠す', () => {
  // ヘッダーごと畳んで、縦の高さを立ち絵に譲る
  assert.match(css, /\.aux-controls-hidden \.app-header\s*\{[^}]*height:\s*0/s)
  assert.match(css, /\.aux-controls-hidden \.app-header\s*\{[^}]*visibility:\s*hidden/s)
  // 「その他」メニューを開いている間は畳まない
  assert.match(app, /getElementById\('header-more-menu'\)/)
  // 最初のタップで全画面へ入り、アドレスバーを畳む（解除手段はヘッダーに残す）
  assert.match(app, /requestImmersiveFullscreen\(\)/)
  assert.match(app, /documentElement\.requestFullscreen\(\)/)
  assert.match(app, /pointer: coarse\) and \(orientation: landscape\)/)
  assert.match(header, /全画面を終了/)
})

test('横画面の立ち絵は画面下端まで届き入力欄と重ならない', () => {
  // ステージを全面に敷き、入力欄だけを右カラムの下端へ重ねる
  assert.match(app, /app-main-novel/)
  assert.match(css, /\.app-main-novel > \.vn-stage\s*\{[^}]*grid-area:\s*1 \/ 1 \/ 2 \/ 3/s)
  assert.match(css, /\.app-main-novel > \.chat-input-wrap\s*\{[^}]*grid-area:\s*1 \/ 2 \/ 2 \/ 3/s)
  // 立ち絵カラムは行を分けないので上下いっぱいに伸びる
  assert.match(css, /\.app-main-novel \.vn-stage\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\)/s)
  assert.match(css, /\.app-main-novel \.vn-figure\s*\{[^}]*grid-column:\s*1/s)
  // テキスト枠は入力欄の実測高さぶんだけ下を空ける
  assert.match(css, /\.app-main-novel \.vn-dialogue\s*\{[^}]*var\(--vn-input-h/s)
  assert.match(app, /setProperty\('--vn-input-h'/)
})
