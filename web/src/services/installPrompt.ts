import { useSyncExternalStore } from 'react'

/**
 * PWA の「アプリとして追加」を画面内から起動するための薄い層。
 *
 * Chromium 系は条件（HTTPS・manifest・Service Worker）を満たすと `beforeinstallprompt`
 * を投げてくる。これは React がマウントされる前に飛んでくることがあるので、
 * このモジュールの読み込み時点でリスナーを登録して保持しておく（main.tsx で import）。
 *
 * iOS / macOS Safari にはこのイベントが無く、共有メニューから手で追加するしかない。
 * その場合は `mode: 'ios-guide'` を返し、UI 側で手順を案内する。
 */

/** lib.dom に無いので自前で宣言する（Chromium 独自 API） */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallMode =
  /** 画面内のボタンからブラウザ純正のインストールダイアログを出せる */
  | 'prompt'
  /** Safari。「共有 → ホーム画面に追加」の手順を案内する */
  | 'ios-guide'
  /** すでにアプリとして起動している、または非対応ブラウザ */
  | 'unavailable'

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari は display-mode を返さず navigator.standalone で判定する
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ はデスクトップ UA を名乗るのでタッチ対応 Mac も含める
  const isIosDevice = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const isSafariEngine = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return isIosDevice && isSafariEngine
}

if (typeof window !== 'undefined') {
  installed = isStandalone()
  window.addEventListener('beforeinstallprompt', (event) => {
    // ブラウザ既定のミニバーは抑止して、タイトル画面のメニューから出す
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    notify()
  })
}

function getInstallMode(): InstallMode {
  if (installed) return 'unavailable'
  if (deferredPrompt) return 'prompt'
  if (isIosSafari()) return 'ios-guide'
  return 'unavailable'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 保持している `beforeinstallprompt` を発火させる。
 * 一度使ったイベントは再利用できないので、結果に関わらず捨てる。
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferredPrompt
  if (!event) return 'unavailable'
  deferredPrompt = null
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  return outcome
}

/** 現在の環境でどうインストール導線を出すべきかを返す */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, getInstallMode, () => 'unavailable')
}
