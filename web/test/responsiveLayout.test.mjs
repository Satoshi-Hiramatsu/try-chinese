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
  assert.match(css, /\.vn-stage\s*\{\s*grid-template-columns:\s*minmax\(0, 44%\)/)
  assert.match(css, /\.chat-input-shell textarea\s*\{[^}]*max-height:/s)
  assert.match(css, /\.chat-input-shell button\s*\{[^}]*min-height:\s*2\.5rem/s)
})

test('補助操作は自動非表示でもフォーカス可能なまま残らない', () => {
  assert.match(app, /setTimeout\(\(\) => setAreAuxControlsVisible\(false\), 4000\)/)
  assert.match(css, /\.aux-controls-hidden \.vn-controls\s*\{[^}]*visibility:\s*hidden/s)
  assert.match(css, /\.aux-controls-hidden \.vn-controls\s*\{[^}]*pointer-events:\s*none/s)
})
