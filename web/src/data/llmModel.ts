/**
 * 会話用 LLM のモデル。
 *
 * 利用者には選ばせず DeepSeek V4.1 Flash に固定する。
 * 別のモデルを試すのは開発者モードの「テストモード」からだけで、その上書きは
 * 通常の設定とは別のキーに置く（storage.ts の loadDevLlmModel）。
 * 副作用を持たない純粋関数だけを置く（web/test から単体で読めるようにするため）。
 */

/** 会話画面が使う既定の LLM。 */
export const DEFAULT_LLM_MODEL = 'deepseek/deepseek-v4.1-flash'

/** テストモードで選べる候補。自由入力もできるので、ここは目安の一覧。 */
export const PRESET_LLM_MODELS = [
  { id: DEFAULT_LLM_MODEL, name: 'DeepSeek V4.1 Flash', tag: '既定・中国語ネイティブ', desc: '出力単価が安く、スキーマ指定に対応して返答が崩れない' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: '比較基準', desc: '実績のある比較基準。単価は高め' },
  { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', tag: '速度優先', desc: 'さらに安く速い。返答の厚みは落ちる' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', tag: '定番・高精度', desc: '指示遵守力が高く安定した構造化JSON生成' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', tag: '中国語ニュアンス特化', desc: 'ネイティブらしい自然な中国語口語表現' },
] as const

/**
 * 実際に送るモデルを決める。
 * 開発者の上書きが空・空白・既定と同じなら固定値を返し、「上書き中」とは扱わない。
 */
export function resolveLlmModel(devOverride: string | null | undefined): { model: string; isOverridden: boolean } {
  const trimmed = (devOverride ?? '').trim()
  if (!trimmed || trimmed === DEFAULT_LLM_MODEL) return { model: DEFAULT_LLM_MODEL, isOverridden: false }
  return { model: trimmed, isOverridden: true }
}
