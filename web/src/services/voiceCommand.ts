export interface VoiceSendCommandResult {
  hasSendCommand: boolean
  content: string
}

export interface ParseVoiceSendCommandOptions {
  /**
   * 送信の合図を別の経路（ブラウザ認識のプレビュー）で既に聞き取っているとき、
   * 文字起こし側の末尾に残った同音の書き間違いまで合図として剥がす。
   * 合図そのものの検出には使わない（普通の語を誤って剥がさないため）。
   */
  lenient?: boolean
}

const TRAILING_PUNCTUATION = String.raw`[\s。．.!！?？、,，]*`

const STRICT_COMMAND_WORDS = {
  'zh-CN': String.raw`(?:发送|發送|送信)`,
  'ja-JP': String.raw`(?:送信|そうしん|送って)`,
} as const

/** 一括STTが「发送」「送信」をどう書き起こしても剥がせるよう、同音・近音を広めに集める。 */
const LENIENT_COMMAND_WORDS = {
  'zh-CN': String.raw`(?:发送|發送|发颂|发宋|法送|發颂|发松|發松|送信|fa\s*song)`,
  'ja-JP': String.raw`(?:送信|そうしん|ソウシン|送って|そして|送新|創新)`,
} as const

const COMMAND_SUFFIX = {
  'zh-CN': String.raw`(?:吧|一下|して|します)?`,
  'ja-JP': String.raw`(?:して|します|ください)?`,
} as const

/**
 * 発話末尾の明示的な送信コマンドだけを検出する。
 * 無音時間は送信条件にしないため、考え込んでいる途中の誤送信を防げる。
 */
export function parseVoiceSendCommand(
  transcript: string,
  lang: 'zh-CN' | 'ja-JP',
  options: ParseVoiceSendCommandOptions = {}
): VoiceSendCommandResult {
  const trimmed = transcript.trim()
  // 「送信」だけでも送れるようにする。認識ゆれ（送信して／そうしん 等）も同じ合図として扱う。
  const words = options.lenient ? LENIENT_COMMAND_WORDS[lang] : STRICT_COMMAND_WORDS[lang]
  const command = new RegExp(`${words}${COMMAND_SUFFIX[lang]}${TRAILING_PUNCTUATION}$`, 'iu')
  const match = command.exec(trimmed)

  if (!match || match.index === undefined) {
    return { hasSendCommand: false, content: trimmed }
  }

  return {
    hasSendCommand: true,
    content: trimmed.slice(0, match.index).trim(),
  }
}
