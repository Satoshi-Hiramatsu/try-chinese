/**
 * ピンインの生成。
 *
 * 以前は LLM に返答と一緒に作らせていたが、
 * 声調記号付きピンインはモデルによって当たり外れが大きく、
 * 特に多音字（还 hái/huán、了 le/liǎo、行 xíng/háng）で揺れた。
 * 学習アプリの土台がモデルの機嫌に左右される状態だったため、
 * 辞書ベースの生成へ移した。
 *
 * 生成が即座に終わるので LLM の出力トークンが約35%減り、
 * その分だけ返答が早く返る。
 *
 * 辞書は数百KBあり初期表示には要らないため、動的importで別チャンクにする。
 * 起動直後に prefetchPinyin() を呼んで温めておけば、最初の返答には間に合う。
 */

type PinyinFn = (text: string, options: { nonZh: 'consecutive' }) => string

/** 読み込み中・読み込み済みの辞書。二重取得を避けるため Promise を保持する。 */
let libraryRequest: Promise<PinyinFn | undefined> | undefined

async function loadLibrary(): Promise<PinyinFn | undefined> {
  if (!libraryRequest) {
    libraryRequest = import('pinyin-pro')
      .then((module) => module.pinyin as PinyinFn)
      .catch(() => {
        // 取得に失敗しても会話は続ける。ピンインが出ないだけにする。
        // 次の機会に再取得できるよう、失敗した Promise は捨てる。
        libraryRequest = undefined
        return undefined
      })
  }
  return await libraryRequest
}

/** 辞書を先読みする。起動直後に呼んで、最初の返答までに間に合わせる。 */
export function prefetchPinyin(): void {
  void loadLibrary()
}

/** 漢字を1文字でも含むか。含まない文字列にピンインを付けても意味がない。 */
export function containsChinese(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text)
}

/**
 * 中国語テキストのピンインを返す。
 *
 * 記号や英数字は音節に分解せず、そのまま残す（nonZh: 'consecutive'）。
 * 分解すると「2026」が「2 0 2 6」になり、読みとしても表示としても壊れる。
 *
 * 辞書ベースなので多音字は語単位の一致で決まる。辞書に無い組み合わせ
 * （例: 还钱）では第一候補に倒れるが、揺れないぶん LLM 生成より扱いやすい。
 */
export async function toPinyin(text: string): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed || !containsChinese(trimmed)) return ''
  const pinyin = await loadLibrary()
  if (!pinyin) return ''
  try {
    return pinyin(trimmed, { nonZh: 'consecutive' }).trim()
  } catch {
    return ''
  }
}

/**
 * ピンインが空のときだけ生成して補う。
 *
 * 保存済みの会話履歴やプリセットの初期メッセージには既にピンインがある。
 * それらを作り直さないことで、過去の表示を変えずに移行できる。
 */
export async function fillPinyin(text: string, existing?: string): Promise<string> {
  if (existing && existing.trim() !== '') return existing
  return await toPinyin(text)
}
