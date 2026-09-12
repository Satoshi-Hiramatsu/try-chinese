import { markApiKeyExhausted, loadUsableApiKey } from './openRouterKey'
import { blobToBase64, type RecordingResult } from './recorder'

export interface TranscribeRecordingOptions {
  language: 'zh-CN' | 'ja-JP'
  signal?: AbortSignal
}

interface TranscriptionPayload {
  text?: unknown
  error?: unknown
}

async function readTranscriptionError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as TranscriptionPayload
    if (typeof payload.error === 'string' && payload.error.trim() !== '') return payload.error
  } catch {
    // JSONでないエラーはHTTPステータスだけを表示する。
  }
  return `STT API エラー (${response.status})`
}

/**
 * 録音済みの一発話を一度だけ文字起こしする。
 *
 * ブラウザの SpeechRecognition イベントは再開時に過去の結果を再掲することがあるため、
 * 会話へ送るテキストの正本には使わない。録音Blobとこの一括応答だけを正とする。
 */
export async function transcribeRecording(
  recording: RecordingResult,
  options: TranscribeRecordingOptions
): Promise<string> {
  if (recording.blob.size === 0) return ''

  const apiKey = loadUsableApiKey()
  if (!apiKey) {
    throw new Error('OpenRouter APIキーを確認してから音声入力をお使いください。')
  }

  const audio = await blobToBase64(recording.blob)
  const response = await fetch('/api/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      audio,
      format: recording.format,
      language: options.language === 'zh-CN' ? 'zh' : 'ja',
      responseFormat: 'json',
    }),
    signal: options.signal,
  })

  if (response.status === 402) markApiKeyExhausted()
  if (!response.ok) throw new Error(await readTranscriptionError(response))

  const payload = (await response.json()) as TranscriptionPayload
  if (typeof payload.text !== 'string') {
    throw new Error('文字起こし結果が返されませんでした。')
  }
  return payload.text.trim()
}
