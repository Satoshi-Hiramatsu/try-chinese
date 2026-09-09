export interface VoiceSendCommandResult {
  hasSendCommand: boolean
  content: string
}

const TRAILING_PUNCTUATION = String.raw`[\s。．.!！?？、,，]*`

/**
 * 発話末尾の明示的な送信コマンドだけを検出する。
 * 無音時間は送信条件にしないため、考え込んでいる途中の誤送信を防げる。
 */
export function parseVoiceSendCommand(
  transcript: string,
  lang: 'zh-CN' | 'ja-JP'
): VoiceSendCommandResult {
  const trimmed = transcript.trim()
  const command = lang === 'zh-CN'
    ? new RegExp(`(?:发送|發送)(?:吧|一下)?${TRAILING_PUNCTUATION}$`, 'u')
    : new RegExp(`(?:送って|送信して)${TRAILING_PUNCTUATION}$`, 'u')
  const match = command.exec(trimmed)

  if (!match || match.index === undefined) {
    return { hasSendCommand: false, content: trimmed }
  }

  return {
    hasSendCommand: true,
    content: trimmed.slice(0, match.index).trim(),
  }
}
