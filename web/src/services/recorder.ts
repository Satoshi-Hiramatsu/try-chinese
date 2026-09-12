/**
 * マイク録音。開発者モードのSTT比較と、本体の音声入力で共用する。
 *
 * Web Speech API と違い、録音そのものは文字起こしを行わない。
 * 発話が終わったかどうかは音量で判断するため、録音中の音量も併せて配る。
 *
 * DOM に触れない判定部分は純粋関数として切り出す（web/test から読むため）。
 */

/** 上流（OpenRouter の文字起こしAPI）が受け付ける形式に対応する MediaRecorder の候補。 */
const PREFERRED_MIME_TYPES: readonly string[] = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

/**
 * MIME タイプから、文字起こしAPIへ渡す形式名を取り出す。
 * `audio/webm;codecs=opus` → `webm`
 */
export function audioFormatFromMimeType(mimeType: string): string {
  const bare = mimeType.split(';')[0].trim().toLowerCase()
  const withoutPrefix = bare.replace(/^audio\//, '')
  // mp4 コンテナは m4a として扱われることが多いが、上流は mp4 も受け付ける。
  return withoutPrefix === 'x-m4a' ? 'm4a' : withoutPrefix
}

/**
 * 使える MIME タイプを選ぶ。
 * 対応判定は呼び出し側から差し込めるようにして、ブラウザなしでも試せるようにする。
 */
export function pickRecordingMimeType(
  isSupported: (mimeType: string) => boolean,
  candidates: readonly string[] = PREFERRED_MIME_TYPES
): string | undefined {
  return candidates.find((mimeType) => isSupported(mimeType))
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

/** 時間領域の波形から実効値(RMS)を出す。0〜1におおよそ収まる。 */
export function calculateRmsLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let total = 0
  for (let index = 0; index < samples.length; index += 1) {
    // AnalyserNode の byte 波形は 128 が無音の中心。
    const centered = (samples[index] - 128) / 128
    total += centered * centered
  }
  return Math.sqrt(total / samples.length)
}

export interface RecordingResult {
  blob: Blob
  /** 文字起こしAPIへ渡す形式名（webm など）。 */
  format: string
  mimeType: string
  durationMs: number
}

export interface RecorderController {
  /** 録音しているマイクの音声トラック。同じ音を別の消費者（ブラウザ認識）にも渡すために公開する。 */
  audioTrack: MediaStreamTrack | undefined
  /** 録音を締めて結果を返す。既に停止していれば同じ結果を返す。 */
  stop: () => Promise<RecordingResult>
  /** 結果を捨てて停止する。マイクも解放する。 */
  cancel: () => void
}

export interface StartRecordingOptions {
  /** 録音中の音量。0〜1程度。無音判定と音量メーターに使う。 */
  onLevel?: (level: number) => void
  /** 音量を配る間隔。 */
  levelIntervalMs?: number
}

const DEFAULT_LEVEL_INTERVAL_MS = 100

/**
 * 録音を開始する。マイク許可が下りるまで待つため await が要る。
 *
 * 停止したときに初めて Blob が確定するので、結果は stop() の戻り値で受け取る。
 */
export async function startRecording(options: StartRecordingOptions = {}): Promise<RecorderController> {
  if (!isRecordingSupported()) {
    throw new Error('お使いのブラウザは録音に対応していません。')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type))
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  const startedAt = Date.now()

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }

  // 音量の監視。録音本体とは独立して回し、停止時にまとめて畳む。
  let audioContext: AudioContext | undefined
  let levelTimer: ReturnType<typeof setInterval> | undefined
  if (options.onLevel) {
    try {
      audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      audioContext.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        options.onLevel?.(calculateRmsLevel(samples))
      }, options.levelIntervalMs ?? DEFAULT_LEVEL_INTERVAL_MS)
    } catch {
      // 音量が取れなくても録音自体は続ける。
    }
  }

  const release = () => {
    if (levelTimer) clearInterval(levelTimer)
    levelTimer = undefined
    void audioContext?.close().catch(() => {})
    audioContext = undefined
    stream.getTracks().forEach((track) => track.stop())
  }

  let settled: Promise<RecordingResult> | undefined

  const stop = (): Promise<RecordingResult> => {
    if (settled) return settled
    settled = new Promise<RecordingResult>((resolve) => {
      recorder.onstop = () => {
        release()
        const type = recorder.mimeType || mimeType || 'audio/webm'
        resolve({
          blob: new Blob(chunks, { type }),
          format: audioFormatFromMimeType(type),
          mimeType: type,
          durationMs: Date.now() - startedAt,
        })
      }
      if (recorder.state === 'inactive') recorder.onstop?.(new Event('stop'))
      else recorder.stop()
    })
    return settled
  }

  recorder.start()

  return {
    audioTrack: stream.getAudioTracks()[0],
    stop,
    cancel: () => {
      release()
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        // 既に停止しているだけなので無視する。
      }
    },
  }
}

/**
 * Blob を Base64 にする。data URI の接頭辞は含めない。
 * 文字起こしAPIは生のバイト列を符号化した文字列を求めるため。
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  // 一度に渡すと引数が多すぎて落ちるため、小分けにして連結する。
  const chunkSize = 0x8000
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}
