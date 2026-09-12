import { useState } from 'react'
import { DEFAULT_LLM_MODEL, PRESET_LLM_MODELS, resolveLlmModel } from '../data/llmModel'
import { FIXED_TTS_MODEL } from '../data/fishVoice'

/**
 * テストモード（開発者モード）。
 *
 * 利用者には固定している会話モデルを、開発者だけがここで差し替える。
 * 上書き中は通常画面のヘッダーに「テストモード中」が出て、戻し忘れに気付ける。
 * 音声モデルは Fish Audio に固定で、ここでも変えない（比較は TTS 比較タブで行う）。
 */

interface Props {
  /** いま保存されている会話モデルの上書き。無ければ null。 */
  devLlmModel: string | null
  /** 空文字で固定値に戻す。 */
  onChangeDevLlmModel: (model: string) => void
  /** このブラウザに保存されている声の上書きの件数。 */
  voiceOverrideCount: number
  /** 全員の声の上書きを捨ててプリセットに戻す。消した件数を返す。 */
  onResetAllVoices: () => number
}

export function DevTestModePane({ devLlmModel, onChangeDevLlmModel, voiceOverrideCount, onResetAllVoices }: Props) {
  const resolved = resolveLlmModel(devLlmModel)
  const [custom, setCustom] = useState(resolved.isOverridden ? resolved.model : '')
  const [message, setMessage] = useState('')

  const apply = (model: string) => {
    onChangeDevLlmModel(model)
    setCustom(resolveLlmModel(model).isOverridden ? model.trim() : '')
    setMessage(model.trim() && model.trim() !== DEFAULT_LLM_MODEL ? `会話モデルを ${model.trim()} に上書きしました。` : '会話モデルを固定値に戻しました。')
  }

  return (
    <div className={'dev-test-mode'}>
      <section className={'dev-test-section'}>
        <h2>いまの状態</h2>
        <dl>
          <dt>会話モデル</dt>
          <dd>
            {resolved.isOverridden ? <em data-kind={'override'}>上書き中</em> : <em data-kind={'fixed'}>固定</em>}
            <code>{resolved.model}</code>
          </dd>
          <dt>音声モデル</dt>
          <dd>
            <em data-kind={'fixed'}>固定</em>
            <code>{FIXED_TTS_MODEL}</code>
          </dd>
          <dt>声の上書き</dt>
          <dd>{voiceOverrideCount > 0 ? `${voiceOverrideCount}人分がこのブラウザに保存されています` : 'なし（全員プリセットの声）'}</dd>
        </dl>
        {message ? <p role={'status'} className={'dev-test-message'}>{message}</p> : null}
      </section>

      <section className={'dev-test-section'}>
        <h2>会話モデル（利用者には出さない）</h2>
        <p className={'dev-test-help'}>
          上書きすると、この端末の会話だけがそのモデルで動く。テストが終わったら「固定値に戻す」を押す。
        </p>
        <div className={'dev-test-models'}>
          {PRESET_LLM_MODELS.map((model) => (
            <button
              key={model.id}
              type={'button'}
              data-selected={resolved.model === model.id}
              onClick={() => apply(model.id)}
            >
              <strong>{model.name}</strong>
              <em>{model.tag}</em>
              <small>{model.desc}</small>
              <code>{model.id}</code>
            </button>
          ))}
        </div>
        <div className={'dev-test-custom'}>
          <label htmlFor={'dev-test-custom-model'}>自由入力</label>
          <input
            id={'dev-test-custom-model'}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={'例: openai/gpt-4o または deepseek/deepseek-chat'}
            spellCheck={false}
          />
          <button type={'button'} onClick={() => apply(custom)} disabled={!custom.trim()}>
            このモデルにする
          </button>
          <button type={'button'} onClick={() => apply('')} disabled={!resolved.isOverridden}>
            固定値に戻す
          </button>
        </div>
      </section>

      <section className={'dev-test-section'}>
        <h2>声の上書き</h2>
        <p className={'dev-test-help'}>
          声の管理や声設定で保存した話者ID・調整値は、このブラウザにだけ残る。プリセット（presetFriends.ts）の値で
          確認し直したいときに全員ぶんを捨てる。利用者が変えた「声の高さ」はここでは消えない。
        </p>
        <button
          type={'button'}
          className={'dev-test-danger'}
          disabled={voiceOverrideCount === 0}
          onClick={() => {
            if (
              !confirm(
                `${voiceOverrideCount}人分の声の設定をプリセットの値に戻します。\nこのブラウザで保存した話者ID・調整値はすべて消え、元に戻せません。\n続けますか？`
              )
            ) {
              return
            }
            const count = onResetAllVoices()
            setMessage(`${count}人分の声の設定をプリセットに戻しました。`)
          }}
        >
          全員の声をプリセットに戻す（{voiceOverrideCount}人分）
        </button>
      </section>
    </div>
  )
}
