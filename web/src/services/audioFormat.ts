/**
 * TTSレスポンスを <audio> で再生できる形式へ整える。
 *
 * Gemini TTS など一部モデルは mp3 を受け付けず PCM のみを返す。
 * PCM はヘッダーを持たない生データでブラウザが再生できないため、
 * 受信後に WAV ヘッダーを付けて再生可能にする。
 */

export interface PcmAudioFormat {
  sampleRate: number
  bitsPerSample: number
  channels: number
}

export const DEFAULT_PCM_FORMAT: PcmAudioFormat = { sampleRate: 24000, bitsPerSample: 16, channels: 1 }

/** Content-Type から PCM かどうかを判定する。`audio/pcm`, `audio/L16` などを想定する。 */
export function isPcmContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  return /(^|\/|[;+\s])(pcm|l16|x-pcm|raw)\b/i.test(contentType)
}

/** レスポンスヘッダーから PCM のフォーマットを読む。欠けている値は既定値で補う。 */
export function readPcmFormat(headers: Headers): PcmAudioFormat {
  const read = (name: string, fallback: number) => {
    const parsed = Number.parseInt(headers.get(name) || '', 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }
  return {
    sampleRate: read('X-TTS-Sample-Rate', DEFAULT_PCM_FORMAT.sampleRate),
    bitsPerSample: read('X-TTS-Bit-Depth', DEFAULT_PCM_FORMAT.bitsPerSample),
    channels: read('X-TTS-Channels', DEFAULT_PCM_FORMAT.channels),
  }
}

/** PCM データの先頭に付ける 44 バイトの WAV(RIFF) ヘッダーを組み立てる。 */
export function createWavHeader(dataByteLength: number, format: PcmAudioFormat): ArrayBuffer {
  const { sampleRate, bitsPerSample, channels } = format
  const blockAlign = (channels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataByteLength, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // fmtチャンクのサイズ
  view.setUint16(20, 1, true) // PCM(非圧縮)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataByteLength, true)
  return header
}

/** TypedArray のビュー範囲だけを ArrayBuffer として取り出す。Blob に渡す型を揃えるために使う。 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** PCM データを WAV の Blob に包む。 */
export function pcmToWavBlob(pcm: Uint8Array, format: PcmAudioFormat = DEFAULT_PCM_FORMAT): Blob {
  return new Blob([createWavHeader(pcm.byteLength, format), toArrayBuffer(pcm)], { type: 'audio/wav' })
}

/**
 * 受信済みバイト列を再生可能な Blob にする。
 * PCM の場合のみ WAV へ変換し、それ以外は Content-Type のまま扱う。
 */
export function createPlayableAudioBlob(
  bytes: Uint8Array,
  contentType: string | null | undefined,
  format: PcmAudioFormat = DEFAULT_PCM_FORMAT
): Blob {
  if (isPcmContentType(contentType)) return pcmToWavBlob(bytes, format)
  return new Blob([toArrayBuffer(bytes)], { type: contentType || 'audio/mpeg' })
}

/** Response をそのまま再生可能な Blob に変換する。ストリーミング計測が不要な場面で使う。 */
export async function responseToPlayableBlob(response: Response): Promise<Blob> {
  const contentType = response.headers.get('Content-Type')
  if (!isPcmContentType(contentType)) return await response.blob()
  const bytes = new Uint8Array(await response.arrayBuffer())
  return pcmToWavBlob(bytes, readPcmFormat(response.headers))
}
