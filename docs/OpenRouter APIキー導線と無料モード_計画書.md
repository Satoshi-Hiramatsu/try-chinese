# OpenRouter APIキー導線と無料モード 計画書

- 対象プロジェクト: しゃべチャイナ
- 対象画面: `web/src/components/TitleScreen.tsx` / 新規「APIキー」モーダル / `SettingsModal.tsx` / `Header.tsx`
- 関連ファイル: `web/src/services/speech.ts`, `web/src/services/storage.ts`, `web/src/data/voiceAssignment.ts`, `web/src/data/presetFriends.ts`, `worker/src/routes/tts.ts`, `worker/src/routes/chat.ts`, `worker/src/index.ts`
- 文書版: v0.3（T-85〜T-91 実装済み。無料 LLM は Nemotron 3 Super (free) → Nex N2.5 Pro (free) に決定）
- 作成日: 2026-09-12

---

## 1. 目的

1. タイトル画面から OpenRouter API キーを入力できるようにする（設定画面の奥まで潜らなくてよい）
2. 入力したキーが**有効か**と**残額の目安**を、利用者の画面で見えるようにする
3. キーが未入力のときは、各キャラクターの音声モデルを自動で `fish-audio/s2.1-pro-free:free` に切り替え、**キー無しでも会話と音声が動く**状態（以下「無料モード」）にする

---

## 2. 現状の整理

### 2-1. キーの入力と保持

- キーは `localStorage` に保存（[storage.ts:50-67](../web/src/services/storage.ts#L50-L67) `loadApiKey` / `saveApiKey`）
- 入力欄は [SettingsModal.tsx](../web/src/components/SettingsModal.tsx) のセクション1にのみあり、タイトル画面からは「せってい」→ 一番上の欄、という導線
- 有効性の確認は行っておらず、キーが間違っていても会話を送るまで分からない
- [Header.tsx:79](../web/src/components/Header.tsx#L79) に緑の点（`hasApiKey`）があるだけで、「入っている」以上の情報は出ない

### 2-2. キーが無いときの挙動

- 会話（`/api/chat`）: [chat.ts:39-48](../worker/src/routes/chat.ts#L39-L48) はヘッダー → body → **Worker 環境変数** の順にキーを探し、どれも無ければ 401
- 音声（`speakChinese`）: [speech.ts:414-427](../web/src/services/speech.ts#L414-L427) はプロバイダが `openrouter` でキーが無いと **エラーを出して終わり**（ブラウザ音声へは落ちない）
- 本番 Worker の secret は **未設定**（`npx wrangler secret list` → `[]`）。つまり現在の本番はキー未入力だと何も動かない

### 2-3. 音声モデルの割り当て

- 作業中の [presetFriends.ts](../web/src/data/presetFriends.ts)（未コミット）でプリセット20人を `fish-audio/s2.1-pro`（有料）へ切替中。Kokoro の話者は `voiceByModel` に退避
- [voiceAssignment.ts:20-28](../web/src/data/voiceAssignment.ts#L20-L28) の別名グループにより、`fish-audio/s2.1-pro` と `fish-audio/s2.1-pro-free:free` は**同じ reference_id・同じ調整値**で動く。無料モードへの切替に追加の声設定は要らない
- Worker は Fish Audio に話者IDを必須としている（[tts.ts:64](../worker/src/routes/tts.ts#L64) `VOICE_REQUIRED_MODELS`）。Fish の話者を持たないカスタム友達は Fish free に切り替えても鳴らない

### 2-4. OpenRouter 側で取れる情報

| エンドポイント | 認証 | 取れるもの |
| --- | --- | --- |
| `GET https://openrouter.ai/api/v1/key` | 通常キーで可 | `label`, `usage`（累計使用額 USD）, `usage_daily/weekly/monthly`, `limit`（キーの上限。無制限なら null）, `limit_remaining`（上限までの残り。無制限なら null）, `is_free_tier` |
| `GET https://openrouter.ai/api/v1/credits` | **管理キー必須** | `total_credits`, `total_usage` → アカウント残高 |

→ 通常キーでは**アカウント残高そのものは取れない**。「残高切れ」は実際のリクエストが OpenRouter から **402** で返ってきたときに初めて分かる。

---

## 3. 前提と決定事項（確定）

### D1. Worker に所有者の「Free専用キー」を置く【確定】

- 所有者が **無料モデル専用の OpenRouter キー**を別途作成済み。これを Worker の secret `OPENROUTER_API_KEY` に置き、利用者キーが無いリクエストはこれで代行する
- 投入手順: 本番 `npx wrangler secret put OPENROUTER_API_KEY`、ローカル `worker/.dev.vars`（どちらも `.gitignore` 済み）。**キーの値は計画書・README・コード・コミットに一切書かない**
- このキーは無料モデル以外に使わせない。Worker 側で `:free` 以外を弾くガード（D2）を **secret 投入より先に**入れる

### D2. 利用者キーが無いときは `:free` モデルだけ【確定（D1 の帰結）】

| 経路 | 扱い |
| --- | --- |
| `/api/tts` | モデルIDが `:free` で終わるものだけ通す。それ以外は 402 |
| `/api/chat` | リクエスト側のモデル指定を無視し、Worker の env `OPENROUTER_FREE_MODEL` に固定する。未設定なら 402 |
| `/api/stt` | `:free` のみ。無ければ 402（画面はブラウザ音声認識のまま） |
| `/api/openrouter/key`（新設） | 利用者キーの検査専用。所有者キーへのフォールバックはしない |

無料 LLM の選定は **T-88 の冒頭でスパイク**する（無料モデルの顔ぶれは頻繁に変わるため、この文書には固定しない）。条件は次の3つ。

1. `response_format: json_schema` か、少なくとも JSON 出力の指示に安定して従う（[llm.ts](../worker/src/lib/llm.ts) の返答検査を通ること）
2. 中国語の会話品質が HSK 1〜3 の相手として破綻しない
3. レート制限が「1人が普通に会話する」速度に耐える

候補は `openrouter.ai/models?q=free` から LLM 検証モード（`LlmDebugPane`）で3〜4件比較して決め、`OPENROUTER_FREE_MODEL` に入れる。合格が無ければ、キー無しの会話は「無料モードでは会話にキーが必要です」を出して止める（音声だけ無料で鳴っても意味がないため、その場合は D1 自体を見直す）。

### D3. 残高は出さない。「有効 / 無効 / 切れている」の3値【確定】

- **有効**: `/api/v1/key` が 200
- **無効**: `/api/v1/key` が 401（キーの文字列が間違い・削除済み）
- **切れている**: 会話または音声のリクエストが OpenRouter から **402** で返った。または `/api/v1/key` の `limit_remaining` が 0 以下
- 金額（`usage` / `limit_remaining`）は表示しない。取れた値は状態オブジェクトに残しておくが画面には出さない（後で出したくなったときの余地）

「切れている」の検知は Worker が上流の 402 をそのまま 402 で返し、フロントが受け取った時点でキー状態を `exhausted` に更新する。再確認（モーダルの「確認」ボタン、または次回起動）で `/api/v1/key` が 200 なら `valid` に戻すが、実際のリクエストが再び 402 なら即 `exhausted` に戻る。

---

## 4. 機能仕様

### 4-1. タイトル画面のメニュー項目

[TitleScreen.tsx:150-178](../web/src/components/TitleScreen.tsx#L150-L178) の `menuItems` に「APIキー」を追加する。初回起動（`isFirstLaunch`）でも出す（「はじめる」の下）。

| 状態 | ラベル | note |
| --- | --- | --- |
| 未入力 | APIキー | `未設定 · 無料モードで動きます` |
| 確認中 | APIキー | `確認中…` |
| 有効 | APIキー | `有効 · AI音声で話せます` |
| 無効 | APIキー | `無効なキーです · タップして確認` |
| 切れている | APIキー | `残高切れ · 無料モードで動きます` |
| 通信失敗 | APIキー | `確認できませんでした · 前回: 有効` |

`note` は既存の `title-menu-note` で表示し、状態ごとの色分けは薄い emerald / rose の点を1つ付ける程度にとどめる。

### 4-2. APIキーモーダル（新規 `ApiKeyModal.tsx`）

タイトル画面・設定画面のどちらからも開ける小さなモーダル。

- 入力欄（`type=password`、目のアイコンで表示切替、`sk-or-v1-` の形式チェック）
- 「キーを確認」ボタン → `/api/openrouter/key` を叩き、結果を下に表示（有効 / 無効 / 切れている / 通信失敗、キーの label）
- 「キーを取得する」外部リンク（`https://openrouter.ai/settings/keys`）
- 「保存」= `saveApiKey` + 状態更新。保存時にも自動で確認する
- 「キーを削除」（無料モードに戻す）
- 未入力のまま閉じても問題ないことを本文で伝える（「キーが無くても無料の音声で話せます」）

設定画面のセクション1は、この入力部分を共通コンポーネント `ApiKeyField` に切り出して差し替える（二重実装を避ける）。

### 4-3. キー状態サービス（新規 `web/src/services/openRouterKey.ts`）

```ts
export type ApiKeyStatus =
  | { state: 'none' }                         // 未入力
  | { state: 'checking' }
  | { state: 'valid'; label?: string; checkedAt: number }
  | { state: 'invalid'; checkedAt: number }        // /api/v1/key が 401
  | { state: 'exhausted'; checkedAt: number }      // 会話・音声が 402、または limit_remaining <= 0
  | { state: 'unreachable'; last?: ApiKeyStatus; checkedAt: number }

export async function checkApiKey(apiKey: string): Promise<ApiKeyStatus>
export function loadCachedKeyStatus(): ApiKeyStatus | null   // localStorage、表示の初期値用
export function formatKeyStatusNote(status: ApiKeyStatus): string  // 4-1 の note 文言
export function markKeyExhausted(): void   // 会話・音声の 402 を受けたときに App から呼ぶ
```

- 検査タイミング: 起動時（キーがあれば1回）、保存時、モーダルの「確認」ボタン。会話のたびには叩かない。402 は会話・音声の応答から拾う
- 結果は `localStorage`（`STORAGE_KEYS.API_KEY_STATUS`）に `checkedAt` 付きで残し、次回起動時の初期表示に使う。キー本体は既存どおり
- キーが変わったらキャッシュを捨てる

### 4-4. Worker ルート `GET /api/openrouter/key`（新規 `worker/src/routes/openRouterKey.ts`）

- ヘッダー `x-api-key` のキーだけを使う（env へのフォールバックなし）。無ければ 400
- `https://openrouter.ai/api/v1/key` を叩き、`{ valid, label, limitRemaining }` だけを返す。OpenRouter の 401 は `{ valid: false }` の 200 で返す（フロントで「無効」表示にするため）
- OpenRouter に届かない／5xx は 502 で返す（フロントは `unreachable`）
- タイムアウト 8 秒。レスポンスはキャッシュしない（`Cache-Control: no-store`）
- `worker/src/index.ts` にマウント。CORS は既存の `/api/*` 設定に乗る

### 4-5. 無料モード（キー未入力時の音声切替）

保存データは書き換えず、**再生時に解決する**。キーを入れた瞬間に有料側へ戻り、消せば無料側に戻る。

新規 `web/src/services/freeMode.ts`（副作用なしの純関数。`web/test` から読めるように）:

```ts
export const FREE_TTS_MODEL = 'fish-audio/s2.1-pro-free:free'

/** キーが無いときに実際に使う Voice を決める。キーがあれば voice をそのまま返す。 */
export function resolveEffectiveVoice(voice: Voice | undefined, hasApiKey: boolean, globalProvider, globalModel): Voice | undefined
```

`hasApiKey` は「キー状態が `valid` または `unreachable`（前回有効）」の意味。`invalid` / `exhausted` は無料モード扱いにし、Worker にもキーを送らない。

判定順:

1. `hasApiKey` → そのまま
2. プロバイダが `browser` → そのまま
3. 選択中モデルが Fish 系（`canonicalVoiceModelId` が `fish-audio/s2.1-pro`）→ `ttsModel` を `FREE_TTS_MODEL` に差し替え（話者・調整値は同じ）
4. `voiceByModel` に Fish の割り当てがある → `switchVoiceModel(voice, FREE_TTS_MODEL)` で復元
5. どれでもない（Fish の話者が無いカスタム友達、Kokoro/Qwen 固定）→ `ttsProvider: 'browser'` に落とす

適用箇所:

- [speech.ts `speakChinese`](../web/src/services/speech.ts#L406) の冒頭で `voice = resolveEffectiveVoice(...)` を通し、`hasApiKey` 無しでも `openrouter` 経路へ進めるようにする（現在の「キーが必要です」エラーは撤去）。`fetchSegmentAudioUrl` はキー無しなら `x-api-key` を付けずに送る
- [api.ts `requestChat`](../web/src/services/api.ts#L54) は既にキー無しで送れる。変更なし（Worker 側のガードが効く）
- Worker `/api/tts`: 利用者キーが無く env キーで代行するとき、モデルが `:free` でなければ 402 `{ error: 'このモデルには OpenRouter API キーが必要です。' }`
- Worker `/api/chat`: 利用者キーが無いときはモデルを `OPENROUTER_FREE_MODEL` に固定（D2）
- Worker 共通: 上流の 402 はそのまま 402 で返す。フロントは 402 を受けたら `markKeyExhausted()` を呼び、その場でメッセージ（「キーの残高が切れています。無料モードに切り替えました」）を出して無料モードで送り直す

### 4-6. 無料モードの見せ方

- Header の緑の点を状態バッジに置き換える: 未入力=`無料モード`（グレー）、有効=`AI音声`（emerald）、無効=`キー無効`（rose）、切れている=`残高切れ`（amber）。タップで ApiKeyModal
- VoiceSettingsModal / VoiceAdminDashboard: キー未入力時は「いまは無料モードのため Fish Audio S2.1 Pro (Free) で再生されます」の一文を出す。保存値は変えない
- SettingsModal: TTS モデル一覧の Fish free 行に「キー未入力時はこれに自動で切り替わります」を付記
- 無料モードで鳴らせない友達（4-5 の 5）はブラウザ音声で鳴る。エラーは出さない

---

## 5. データ・型の変更

- `web/src/types.ts`: `ApiKeyStatus` は `services/openRouterKey.ts` 側に置き、`types.ts` には足さない（画面と API の間だけの型）
- `web/src/services/storage.ts`: `STORAGE_KEYS.API_KEY_STATUS` と `loadApiKeyStatus` / `saveApiKeyStatus` / `clearApiKeyStatus` を追加
- `worker/src/routes/tts.ts` / `chat.ts`: `resolveApiKey` の戻りを `{ key, source: 'user' | 'env' }` にして、`source === 'env'` のときだけガードを掛ける
- `wrangler.jsonc`: `vars.OPENROUTER_FREE_MODEL` を追加（秘密ではないので平文でよい）。secret は CLI で投入

---

## 6. タスク分割（1タスク＝1コミット）

| # | 内容 | 主な変更 | 依存 |
| --- | --- | --- | --- |
| T-85 | Worker: `/api/openrouter/key` ルートとテスト | `worker/src/routes/openRouterKey.ts`, `index.ts`, `worker/test/openRouterKey.spec.ts` | なし |
| T-86 | Web: キー状態サービスとキャッシュ、起動時・保存時の検査 | `services/openRouterKey.ts`, `storage.ts`, `App.tsx` | T-85 |
| T-87 | Web: `ApiKeyModal` と `ApiKeyField`、タイトル画面メニュー、Header バッジ、SettingsModal の差し替え | `components/ApiKeyModal.tsx`, `TitleScreen.tsx`, `Header.tsx`, `SettingsModal.tsx`, `App.tsx` | T-86 |
| T-88 | 無料 LLM のスパイク（D2）→ Worker: 所有者キー代行時のガード（`:free` 限定・LLM を `OPENROUTER_FREE_MODEL` に固定）とテスト。完了後に secret 投入 | `routes/tts.ts`, `routes/chat.ts`, `routes/stt.ts`, `wrangler.jsonc`, `worker/test/*.spec.ts` | なし |
| T-89 | Web: 無料モードの音声解決 `resolveEffectiveVoice` と `speakChinese` への適用、402 → `exhausted` の反映、テスト | `services/freeMode.ts`, `speech.ts`, `api.ts`, `App.tsx`, `web/test/freeMode.test.mjs` | T-86, T-88 |
| T-90 | Web: 無料モードの表示（VoiceSettingsModal / VoiceAdminDashboard / SettingsModal の注記） | 各コンポーネント | T-89 |
| T-91 | README / CHANGELOG 更新、本番 secret 投入手順の追記 | `README.md`, `CHANGELOG.md` | T-90 |

作業中の `presetFriends.ts`（Fish S2.1 Pro への切替）は本計画より先に単独でコミットする。T-89 はその状態を前提にする。

---

## 7. テスト

### Worker（vitest）

- `/api/openrouter/key`: キー無し → 400、上流 401 → `{ valid: false }`、上流 200 → `{ valid: true, label, limitRemaining }`、上流不達 → 502
- `/api/tts`: 利用者キー無し＋`:free` → 通る、利用者キー無し＋有料モデル → 402、利用者キーあり＋有料モデル → 通る
- `/api/chat`: 利用者キー無し → モデルが `OPENROUTER_FREE_MODEL` 固定になる、env 未設定 → 402
- 上流 402 → そのまま 402 で返る（chat / tts）

### Web（node:test）

- `resolveEffectiveVoice`: 4-5 の判定 5 通り（キーあり / browser / Fish 有料→free / voiceByModel から復元 / 落とし先 browser）
- `formatKeyStatusNote`: 状態ごとの文言
- `speech.test.mjs` 既存ケースが壊れていないこと

### 手動確認

1. キー未入力で起動 → タイトルに「未設定 · 無料モード」→ 会話 → Fish free で鳴る（Network タブで `model` を確認）
2. 無効なキーを保存 → 「無効なキーです」→ 会話は無料モードのまま動く（無効キーは Worker に送らない）
3. 有効なキーを保存 → 「有効」が出る → 有料 Fish で鳴る
4. キーを削除 → 無料モードへ戻る
5. Fish の話者を持たないカスタム友達 → ブラウザ音声で鳴り、エラーが出ない
6. 機内モードで「確認」→ `確認できませんでした · 前回: 有効`
7. 上限 $0 のキーを保存 → 会話で 402 → 「残高切れ · 無料モード」に変わり、無料モードで会話が続く

---

## 8. リスクと未決事項

- **所有者の費用**: 所有者キーは Free 専用なので費用は出ないが、無料モデルのレート制限は所有者キー単位で共有される。URL を知る人が増えれば無料モードが詰まる。必要になったら簡単な合言葉（Worker の env と照合）を足す
- **無料 LLM の品質**: D2 のスパイクで合格が出ない可能性がある。その場合の扱いは D2 に記載
- **Fish free の混雑**: 無料枠は遅延・失敗が増えることがある。失敗時は現状どおりエラー表示（ブラウザ音声への自動再試行は入れない。声が変わると混乱するため）
- **無効キーの扱い**: 無効と判定したキーは Worker に送らず無料モードで動かす（4-5 の `hasApiKey` は「有効なキーがある」の意味にする）。判定が `unreachable` のときは送る
- **`/api/v1/key` の応答形式**: 旧パス `/api/v1/auth/key` と同じ内容。実装時に実キーで一度叩いて項目名を確認する
- **「切れている」の検知が遅い**: `/api/v1/key` では残高切れは分からず、最初の会話で 402 を受けて初めて分かる。フロントは 402 を受けたその場で無料モードに切り替えて送り直すので、利用者が見るのは通知1つだけで済むようにする

---

## 9. 影響ファイル一覧

**新規**
- `web/src/components/ApiKeyModal.tsx`（`ApiKeyField` を同ファイルに同居）
- `web/src/services/openRouterKey.ts`
- `web/src/services/freeMode.ts`
- `web/test/freeMode.test.mjs`
- `worker/src/routes/openRouterKey.ts`
- `worker/test/openRouterKey.spec.ts`

**変更**
- `web/src/components/TitleScreen.tsx` — メニュー項目追加、`keyStatus` prop
- `web/src/components/Header.tsx` — 緑の点を状態バッジへ
- `web/src/components/SettingsModal.tsx` — セクション1を `ApiKeyField` へ、Fish free 行の注記
- `web/src/components/VoiceSettingsModal.tsx`, `VoiceAdminDashboard.tsx` — 無料モードの注記
- `web/src/App.tsx` — `keyStatus` state、起動時検査、モーダル開閉
- `web/src/services/speech.ts` — `resolveEffectiveVoice` 適用、キー無し送信
- `web/src/services/storage.ts` — 状態キャッシュ
- `worker/src/index.ts` — ルート追加
- `worker/src/routes/tts.ts`, `chat.ts`, `stt.ts` — 代行時ガード
- `README.md`, `CHANGELOG.md`
