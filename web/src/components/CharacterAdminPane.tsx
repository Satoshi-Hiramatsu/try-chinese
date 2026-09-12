/**
 * キャラクターモード（開発者モードの「キャラクター」タブ）。
 *
 * 20人のプリセットとカスタム友達を1画面に並べ、
 * 立ち絵（表情差分の揃い具合・シーン背景・立ち絵パラメータ）、
 * 声（割り当てモデル・話者・調整値の試聴）、
 * プロフィール（名前・性格・趣味・口調・最初のメッセージ）を確認して直せる。
 *
 * プリセットのプロフィール変更は localStorage に上書きとして残り、
 * 「コードとして書き出し」で presetFriends.ts へ持ち帰る（声設定と同じ流儀）。
 */

import { useEffect, useMemo, useState } from 'react'
import type { Expression, Friend } from '../types'
import { EXPRESSIONS } from '../types'
import { PRESET_FRIENDS } from '../data/presetFriends'
import {
  getPortrait,
  getPortraitImage,
  getPortraitLayer,
  getSceneImage,
  hasPortraitExpressions,
  isPortraitLocked,
  resolvePortrait,
} from '../data/portraits'
import { diffProfile, formatProfileExport, pickProfile, type FriendProfile } from '../data/friendProfile'
import { describeTuning } from '../data/ttsVoiceTuning'
import { CharacterPortrait, EXPRESSION_LABELS } from './CharacterPortrait'
import { FriendAvatar } from './FriendAvatar'
import { speakChinese, stopSpeaking } from '../services/speech'
import '../styles/characterAdmin.css'

interface Props {
  friends: readonly Friend[]
  currentFriend: Friend
  /** プロフィールを保存する。プリセットは上書きとして、カスタムは本体を更新する。 */
  onSaveProfile: (friendId: string, profile: FriendProfile) => void
  /** プリセットの上書きを捨てて presetFriends.ts の値に戻す。 */
  onResetProfile: (friendId: string) => void
  /** 声質カスタマイズのモーダルを開く。 */
  onEditVoice: (friend: Friend) => void
  /** 声の管理タブへ移る。 */
  onOpenVoiceAdmin: () => void
  /** 会話画面の相手をこの友達に切り替える。 */
  onSelectFriend: (friend: Friend) => void
}

type FilterKey = 'all' | 'female' | 'male' | 'locked' | 'custom'

const FILTER_LABELS: Record<FilterKey, string> = {
  all: '全員',
  female: '女性',
  male: '男性',
  locked: '準備中',
  custom: 'カスタム',
}

const PRESET_IDS = new Set(PRESET_FRIENDS.map((f) => f.id))

function isPreset(friend: Friend): boolean {
  return !!friend.id && PRESET_IDS.has(friend.id)
}

function shortName(friend: Friend): string {
  return friend.name.replace(/\s*\(.*?\)/g, '')
}

/** フォームの下書き。hobbies は読点区切りの文字列として持つ。 */
interface Draft {
  name: string
  personality: string
  hobbies: string
  tone: string
  zh: string
  ja: string
  pinyin: string
}

function toDraft(friend: Friend): Draft {
  return {
    name: friend.name,
    personality: friend.personality,
    hobbies: friend.hobbies.join('、'),
    tone: friend.tone ?? '',
    zh: friend.initialMessage?.zh ?? '',
    ja: friend.initialMessage?.ja ?? '',
    pinyin: friend.initialMessage?.pinyin ?? '',
  }
}

function fromDraft(draft: Draft, base: Friend): FriendProfile {
  const hobbies = draft.hobbies
    .split(/[、,，\n]/)
    .map((h) => h.trim())
    .filter(Boolean)
  const hasMessage = draft.zh.trim() || draft.ja.trim() || draft.pinyin.trim()
  return {
    name: draft.name.trim() || base.name,
    personality: draft.personality.trim(),
    hobbies,
    tone: draft.tone.trim() || undefined,
    initialMessage: hasMessage
      ? {
          zh: draft.zh.trim(),
          ja: draft.ja.trim(),
          pinyin: draft.pinyin.trim(),
          // 語彙は画面から編集しない。元の値をそのまま引き継ぐ。
          vocabulary: base.initialMessage?.vocabulary,
        }
      : undefined,
  }
}

export function CharacterAdminPane({
  friends,
  currentFriend,
  onSaveProfile,
  onResetProfile,
  onEditVoice,
  onOpenVoiceAdmin,
  onSelectFriend,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | undefined>(currentFriend.id)
  const [expression, setExpression] = useState<Expression>('smile')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const presetById = useMemo(() => new Map(PRESET_FRIENDS.map((f) => [f.id, f])), [])

  const visibleFriends = useMemo(() => {
    if (filter === 'female') return friends.filter((f) => f.voice?.gender !== 'male')
    if (filter === 'male') return friends.filter((f) => f.voice?.gender === 'male')
    if (filter === 'locked') return friends.filter((f) => isPortraitLocked(f.portraitId))
    if (filter === 'custom') return friends.filter((f) => !isPreset(f))
    return friends
  }, [filter, friends])

  const selected = friends.find((f) => f.id === selectedId) ?? friends[0]

  // 選択が変わったらフォームを組み直す。保存後は friends が入れ替わるのでその値で作り直す。
  useEffect(() => {
    setDraft(selected ? toDraft(selected) : null)
    setMessage(null)
  }, [selected])

  useEffect(() => () => stopSpeaking(), [])

  const exportText = useMemo(
    () => (isExportOpen ? formatProfileExport(friends, PRESET_FRIENDS, new Date().toISOString()) : ''),
    [friends, isExportOpen],
  )

  const overriddenCount = friends.filter((f) => {
    const preset = f.id ? presetById.get(f.id) : undefined
    return preset ? diffProfile(pickProfile(f), pickProfile(preset)).length > 0 : false
  }).length
  const lockedCount = friends.filter((f) => isPortraitLocked(f.portraitId)).length

  if (!selected || !draft) {
    return <div className={'dev-console-placeholder'}>友達がいません。</div>
  }

  const spec = getPortrait(selected.portraitId) ?? resolvePortrait(selected)
  const portraitId = selected.portraitId
  const ready = hasPortraitExpressions(portraitId)
  const locked = isPortraitLocked(portraitId)
  const backdrop = getSceneImage(spec.scene)
  const original = getPortraitImage(portraitId)
  const preset = selected.id ? presetById.get(selected.id) : undefined
  const changedKeys = preset ? diffProfile(pickProfile(selected), pickProfile(preset)) : []
  const draftDirty = JSON.stringify(fromDraft(draft, selected)) !== JSON.stringify(pickProfile(selected))

  const play = () => {
    stopSpeaking()
    setIsPlaying(true)
    const text = selected.initialMessage?.zh || `你好！我是${shortName(selected)}。很高兴和你用中文聊天！`
    speakChinese(text, selected.voice, {
      onEnd: () => setIsPlaying(false),
      onError: (error) => {
        setIsPlaying(false)
        setMessage(error instanceof Error ? error.message : '再生に失敗しました。')
      },
    })
  }

  const stop = () => {
    stopSpeaking()
    setIsPlaying(false)
  }

  const save = () => {
    if (!selected.id) return
    onSaveProfile(selected.id, fromDraft(draft, selected))
    setMessage(isPreset(selected) ? 'プロフィールを上書き保存しました（このブラウザのみ）。' : 'カスタム友達を更新しました。')
  }

  const reset = () => {
    if (!selected.id) return
    onResetProfile(selected.id)
    setMessage('presetFriends.ts の値に戻しました。')
  }

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText)
      setMessage('プロフィールのコードをコピーしました。')
    } catch {
      setMessage('コピーできませんでした。下の欄を選択して手動でコピーしてください。')
    }
  }

  const update = (key: keyof Draft, value: string) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))

  return (
    <div className={'char-admin'}>
      {/* 左: 一覧 */}
      <aside className={'char-admin-list'}>
        <div className={'char-admin-filters'}>
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <button key={key} type={'button'} data-active={filter === key} onClick={() => setFilter(key)}>
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
        <p className={'char-admin-summary'}>
          {friends.length}人 / 準備中 {lockedCount} / プロフィール上書き {overriddenCount}
        </p>
        <ul>
          {visibleFriends.map((friend) => {
            const friendLocked = isPortraitLocked(friend.portraitId)
            const friendPreset = friend.id ? presetById.get(friend.id) : undefined
            const overridden = friendPreset ? diffProfile(pickProfile(friend), pickProfile(friendPreset)).length > 0 : false
            return (
              <li key={friend.id ?? friend.name}>
                <button
                  type={'button'}
                  data-selected={friend.id === selected.id}
                  onClick={() => setSelectedId(friend.id)}
                >
                  <FriendAvatar friend={friend} size={'sm'} />
                  <span className={'char-admin-list-name'}>
                    <strong>{shortName(friend)}</strong>
                    <small>
                      {friend.portraitId ?? 'SVG'} · {friend.voice?.voiceModel || '話者なし'}
                    </small>
                  </span>
                  <span className={'char-admin-badges'}>
                    {friend.id === currentFriend.id ? <em data-kind={'current'}>会話中</em> : null}
                    {!isPreset(friend) ? <em data-kind={'custom'}>カスタム</em> : null}
                    {friendLocked ? <em data-kind={'locked'}>準備中</em> : null}
                    {overridden ? <em data-kind={'override'}>上書き</em> : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <button
          type={'button'}
          className={'char-admin-export-toggle'}
          data-active={isExportOpen}
          onClick={() => setIsExportOpen((v) => !v)}
        >
          プロフィール上書きをコードとして書き出し
        </button>
      </aside>

      {/* 右: 詳細 */}
      <section className={'char-admin-detail'}>
        <header className={'char-admin-head'}>
          <FriendAvatar friend={selected} size={'lg'} expression={expression} />
          <div className={'char-admin-head-text'}>
            <h2>{selected.name}</h2>
            <p>
              <code>{selected.id}</code> · 立ち絵 <code>{portraitId ?? '（SVG 自動割当）'}</code> · シーン <code>{spec.scene}</code> ·{' '}
              {spec.gender === 'male' ? '男性' : '女性'}
            </p>
          </div>
          <div className={'char-admin-head-actions'}>
            {selected.id !== currentFriend.id ? (
              <button type={'button'} onClick={() => onSelectFriend(selected)}>
                この友達と会話する
              </button>
            ) : null}
          </div>
        </header>

        {message ? (
          <p role={'status'} className={'char-admin-message'}>
            {message}
          </p>
        ) : null}

        {isExportOpen ? (
          <div className={'char-admin-export'}>
            <div>
              <label htmlFor={'char-admin-export-text'}>プリセットと異なるプロフィール（presetFriends.ts へ転記する形式）:</label>
              <button type={'button'} onClick={copyExport}>
                クリップボードにコピー
              </button>
            </div>
            <textarea
              id={'char-admin-export-text'}
              readOnly
              value={exportText}
              spellCheck={false}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        ) : null}

        {/* 立ち絵 */}
        <h3 className={'char-admin-section-title'}>
          立ち絵
          {ready ? <em data-kind={'ok'}>表情差分 10/10</em> : locked ? <em data-kind={'locked'}>表情差分なし（準備中・選択不可）</em> : <em data-kind={'svg'}>SVG 立ち絵</em>}
        </h3>
        <div className={'char-admin-portrait'}>
          <div className={'char-admin-stage'}>
            {backdrop ? <img src={backdrop} alt={''} className={'char-admin-stage-bg'} /> : null}
            {ready ? (
              <img src={getPortraitLayer(portraitId, expression) ?? ''} alt={`${selected.name} ${expression}`} className={'char-admin-stage-layer'} />
            ) : (
              <CharacterPortrait spec={spec} expression={expression} crop={'bust'} animate={false} className={'char-admin-stage-layer'} />
            )}
          </div>
          <div className={'char-admin-portrait-side'}>
            <div className={'char-admin-expressions'}>
              {EXPRESSIONS.map((item) => (
                <button key={item} type={'button'} data-active={item === expression} onClick={() => setExpression(item)} title={item}>
                  <span className={'char-admin-expressions-thumb'}>
                    {ready ? (
                      <img src={getPortraitLayer(portraitId, item) ?? ''} alt={item} loading={'lazy'} />
                    ) : (
                      <CharacterPortrait spec={spec} expression={item} crop={'face'} animate={false} />
                    )}
                  </span>
                  <span>{EXPRESSION_LABELS[item]}</span>
                </button>
              ))}
            </div>
            <dl className={'char-admin-spec'}>
              <dt>元イラスト</dt>
              <dd>
                {original ? (
                  <a href={original} target={'_blank'} rel={'noreferrer'}>
                    <img src={original} alt={'元イラスト'} />
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt>髪</dt>
              <dd>
                <i style={{ background: spec.hair }} /> {spec.backHair} / {spec.frontHair}
                {spec.sideLock ? ' / サイドロック' : ''}
              </dd>
              <dt>瞳・肌</dt>
              <dd>
                <i style={{ background: spec.eye }} /> <i style={{ background: spec.skin }} />
              </dd>
              <dt>服</dt>
              <dd>
                <i style={{ background: spec.outfitColor }} /> {spec.outfit}
              </dd>
              <dt>装飾</dt>
              <dd>
                {[spec.glasses ? '眼鏡' : '', spec.earring ? 'イヤリング' : '', spec.hairPin ? 'ヘアピン' : '', spec.freckles ? 'そばかす' : '']
                  .filter(Boolean)
                  .join(' / ') || 'なし'}
              </dd>
              {locked ? (
                <>
                  <dt>解放手順</dt>
                  <dd>
                    <code>node scripts/generate-portrait-expressions.mjs --id {portraitId}</code> → docs/表情差分の追加手順.md
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
        </div>

        {/* 声 */}
        <h3 className={'char-admin-section-title'}>声</h3>
        <div className={'char-admin-voice'}>
          <dl>
            <dt>話者ID</dt>
            <dd>{selected.voice?.voiceModel || '未設定'}</dd>
            <dt>速度 / 高さ</dt>
            <dd>
              {selected.voice?.rate ?? '—'} / {selected.voice?.pitch ?? '—'}
            </dd>
            <dt>性別</dt>
            <dd>{selected.voice?.gender ?? '—'}</dd>
            <dt>調整値</dt>
            <dd>{describeTuning(selected.voice?.voiceTuning) || 'なし'}</dd>
          </dl>
          <div className={'char-admin-voice-actions'}>
            {isPlaying ? (
              <button type={'button'} onClick={stop}>
                停止
              </button>
            ) : (
              <button type={'button'} onClick={play} data-primary={true}>
                最初のメッセージを試聴
              </button>
            )}
            <button type={'button'} onClick={() => onEditVoice(selected)}>
              声質を編集
            </button>
            <button type={'button'} onClick={onOpenVoiceAdmin}>声の管理へ</button>
          </div>
        </div>

        {/* プロフィール */}
        <h3 className={'char-admin-section-title'}>
          プロフィール
          {changedKeys.length > 0 ? <em data-kind={'override'}>上書き中: {changedKeys.join(', ')}</em> : null}
        </h3>
        <div className={'char-admin-form'}>
          <label>
            名前
            <input value={draft.name} onChange={(e) => update('name', e.target.value)} />
          </label>
          <label>
            趣味（読点区切り）
            <input value={draft.hobbies} onChange={(e) => update('hobbies', e.target.value)} />
          </label>
          <label className={'char-admin-form-wide'}>
            性格
            <textarea rows={2} value={draft.personality} onChange={(e) => update('personality', e.target.value)} />
          </label>
          <label className={'char-admin-form-wide'}>
            口調
            <input value={draft.tone} onChange={(e) => update('tone', e.target.value)} />
          </label>
          <label className={'char-admin-form-wide'}>
            最初のメッセージ（中国語）
            <textarea rows={2} value={draft.zh} onChange={(e) => update('zh', e.target.value)} />
          </label>
          <label className={'char-admin-form-wide'}>
            最初のメッセージ（ピンイン）
            <textarea rows={2} value={draft.pinyin} onChange={(e) => update('pinyin', e.target.value)} />
          </label>
          <label className={'char-admin-form-wide'}>
            最初のメッセージ（日本語）
            <textarea rows={2} value={draft.ja} onChange={(e) => update('ja', e.target.value)} />
          </label>
          <div className={'char-admin-form-actions'}>
            <button type={'button'} data-primary={true} disabled={!draftDirty || !selected.id} onClick={save}>
              保存
            </button>
            <button type={'button'} disabled={!draftDirty} onClick={() => setDraft(toDraft(selected))}>
              入力を破棄
            </button>
            {isPreset(selected) && changedKeys.length > 0 ? (
              <button type={'button'} onClick={reset}>
                プリセットの値に戻す
              </button>
            ) : null}
            <small>
              {isPreset(selected)
                ? 'プリセットの変更はこのブラウザにだけ保存されます。コードに戻すには左下の書き出しを使います。'
                : 'カスタム友達はそのまま保存されます。'}
            </small>
          </div>
        </div>
      </section>
    </div>
  )
}
