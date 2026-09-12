import type { Voice } from '../types'
import { canonicalVoiceModelId, readBinding } from '../data/voiceAssignment'

/**
 * 無料モード（使える OpenRouter API キーが無いとき）の音声の決め方。
 *
 * 保存された声設定は書き換えず、再生の直前にここで差し替える。
 * キーを入れた瞬間に作り込んだ有料側の声へ戻り、消せばまた無料側に戻る。
 *
 * 副作用を持たない純粋関数だけを置く（web/test から単体で読めるようにするため）。
 */

/** キー無しでも所有者キーの代行で鳴らせる無料の音声モデル。 */
export const FREE_TTS_MODEL = 'fish-audio/s2.1-pro-free:free'

/** 有料版と無料版をまとめた代表ID。voiceByModel はこのIDで引く。 */
const FISH_CANONICAL_MODEL = canonicalVoiceModelId(FREE_TTS_MODEL)

export interface FreeModeContext {
  /** 送ってよいキーがある（有効、または未確認で前回無効ではない）。 */
  hasApiKey: boolean
  /** 設定画面で選んだ既定の読み上げエンジン。友達の声に指定が無いときに使う。 */
  globalProvider: 'browser' | 'openrouter'
  /** 設定画面で選んだ既定の音声モデル。友達の声に指定が無いときに使う。 */
  globalModel: string
}

/**
 * 実際に読み上げに使う Voice を決める。
 *
 * 判定順:
 * 1. キーがある → そのまま
 * 2. ブラウザ音声 → そのまま（キーは要らない）
 * 3. 選択中が Fish 系で話者IDがある → 無料版に差し替え（話者・調整値は同じ）
 * 4. voiceByModel に Fish の話者を覚えている → それで無料版に切り替え
 * 5. どれでもない（Fish の話者を持たない友達、Kokoro/Qwen 固定）→ ブラウザ音声に落とす
 */
export function resolveEffectiveVoice(voice: Voice | undefined, context: FreeModeContext): Voice | undefined {
  if (context.hasApiKey) return voice

  const provider = voice?.ttsProvider || context.globalProvider
  if (provider === 'browser') return voice

  const model = voice?.ttsModel || context.globalModel
  if (canonicalVoiceModelId(model) === FISH_CANONICAL_MODEL && voice?.voiceModel) {
    return { ...voice, ttsProvider: 'openrouter', ttsModel: FREE_TTS_MODEL }
  }

  const remembered = readBinding(voice, FREE_TTS_MODEL)
  if (voice && remembered?.voiceModel) {
    return {
      ...voice,
      ttsProvider: 'openrouter',
      ttsModel: FREE_TTS_MODEL,
      voiceModel: remembered.voiceModel,
      voiceTuning: remembered.voiceTuning,
    }
  }

  const base: Voice = voice ?? { quality: 'standard', gender: 'female' }
  return { ...base, ttsProvider: 'browser' }
}

/** 無料モードでその友達が AI 音声（無料版 Fish）で鳴るか。画面の注記に使う。 */
export function canSpeakWithFreeModel(voice: Voice | undefined, context: Omit<FreeModeContext, 'hasApiKey'>): boolean {
  const effective = resolveEffectiveVoice(voice, { ...context, hasApiKey: false })
  return effective?.ttsProvider === 'openrouter' && effective.ttsModel === FREE_TTS_MODEL
}
