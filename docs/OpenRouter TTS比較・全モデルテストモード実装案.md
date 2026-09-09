# OpenRouter TTS比較・全モデルテストモード実装案

## 目的

OpenRouterで利用できるTTSモデルを、同じテキスト・同じキャラクター条件で比較試聴する。

比較対象は `web/src/data/openRouterTtsModels.ts` に集約し、料金、応答速度、音声品質、キャラクター性、日中の発音を同じ画面で確認できるようにする。

## 対象モデル

| モデルID | 主な用途 |
|---|---|
| `hexgrad/kokoro-82m` | 現行ベースライン・低コスト |
| `fish-audio/s2.1-pro-free:free` | 無料の比較試験 |
| `fish-audio/s2-pro` | 感情表現・音声クローン比較 |
| `qwen/qwen-audio-3.0-tts-flash` | Qwen系の高速比較 |
| `qwen/qwen-audio-3.0-tts-plus` | Qwen系の品質比較 |
| `google/gemini-3.1-flash-tts-preview` | 多話者・音声タグ比較 |
| `minimax/speech-2.8-turbo` | 低遅延・多ボイス比較 |
| `microsoft/mai-voice-2` | Microsoft系の表現力・音声プロンプト比較 |

モデル追加時は、モデル一覧を直接コンポーネントへ追加せず、データファイルへ追加する。

## デバッグモードの起動方法案

### 案A: 設定画面から起動

1. 設定モーダルを開く
2. 「音声設定」を開く
3. `TTS比較テスト` ボタンを押す
4. 開発環境またはURLパラメータ `?ttsDebug=1` の場合だけ表示する

本番ユーザーへ誤って公開しないため、初期案では開発環境限定とする。

### 案B: URLパラメータ

```text
http://localhost:5173/?ttsDebug=1
```

URLパラメータは表示の有効化だけに使い、APIキーやテスト結果はURLへ保存しない。

## テスト画面の構成

### 上部：共通入力

- テスト言語：`中国語` / `日本語` / `日中混合`
- テストテキスト
- 話者・キャラクター
- 速度
- ピッチ
- 感情指示または音声タグ
- キャッシュを無視するチェックボックス
- 全モデル一括実行ボタン
- 全停止ボタン

### 初期テキスト

```text
中国語:
你好，今天过得怎么样？学习中文很有意思，对吧？

日本語:
こんにちは。今日はどうだった？中国語の勉強は楽しいよね。

日中混合:
你好。今日は元気？中国語の発音を一緒に練習しよう。
```

### モデルカード

各モデルを1枚のカードとして表示する。

- モデル名
- プロバイダ
- 料金単位と料金
- 利用可能な声・機能
- リクエスト開始時刻
- 最初のレスポンス受信時刻
- 再生開始時刻
- 全文受信完了時刻
- 音声長
- HTTPステータス
- エラー内容
- 再生ボタン
- 再試行ボタン
- 評価（発音、自然さ、キャラクター性、日中一貫性）
- メモ

## 計測する時間

テスト結果には、最低限以下を保存する。

```ts
interface TtsDebugTiming {
  requestStartedAt: number
  responseHeadersAt?: number
  firstChunkAt?: number
  playbackStartedAt?: number
  responseCompletedAt?: number
  playbackEndedAt?: number
}
```

算出値：

- `requestToHeadersMs`
- `requestToFirstChunkMs`
- `requestToPlaybackMs`
- `requestToCompleteMs`
- `audioDurationMs`

注意点として、現在の `speech.ts` は `res.blob()` 完了後に `Audio.play()` を呼ぶため、ストリーミング対応モデルでも現状は全文取得後に再生される。最初の音声を早く聞かせるには、Workerのストリーム転送とフロントエンドのチャンク再生を別タスクで実装する。

## 実行モード

### 1. 単体テスト

選択した1モデルだけを実行する。

用途：

- モデルID・voice IDの確認
- APIエラー確認
- 料金や文字数の確認
- 音声品質の確認

### 2. 全モデル比較

同じテキストを全候補へ送信する。

仕様：

- 同時実行数は初期値2〜3
- 全モデルを一斉送信しない
- 1モデル失敗で全体を中断しない
- 進捗を `完了数 / 対象数` で表示
- 失敗モデルは再試行可能
- 実行前に推定課金額を表示
- 無料モデルもレート制限の可能性を表示

### 3. 日中キャラクター比較

同一キャラクターについて、次の3通りを生成する。

1. 中国語のみ
2. 日本語のみ
3. 日中混合

確認項目：

- 性別が変わらないか
- 年齢感が変わらないか
- 声の明るさが変わらないか
- 日本語で不自然な中国語アクセントが出ないか
- 中国語の声調が崩れないか

### 4. ストリーミング比較

対応モデルだけを対象とする。

- チャンク受信時刻を記録
- 最初のチャンクを受信した時点で表示
- 現行のBlob再生とストリーミング再生を別結果として表示
- ストリーミング非対応モデルは「未対応」と表示

## 結果の保存

### 保存場所

IndexedDBの既存ストレージへ追加する。

```ts
interface TtsDebugRun {
  id: string
  createdAt: string
  inputText: string
  language: 'zh' | 'ja' | 'mixed'
  voiceId?: string
  speed: number
  pitch?: number
  modelIds: string[]
  results: TtsDebugResult[]
}

interface TtsDebugResult {
  modelId: string
  voiceId?: string
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled'
  timing: TtsDebugTiming
  metrics: {
    requestToHeadersMs?: number
    requestToFirstChunkMs?: number
    requestToPlaybackMs?: number
    requestToCompleteMs?: number
    audioDurationMs?: number
    inputCharacterCount: number
    estimatedCostUsd?: number
  }
  audioCacheKey?: string
  errorMessage?: string
  ratings?: {
    pronunciation?: number
    naturalness?: number
    characterConsistency?: number
    jaZhConsistency?: number
  }
  memo?: string
}
```

音声バイナリ本体をIndexedDBへ無期限保存しない。既存の音声キャッシュ方針に合わせ、テスト結果にはキャッシュキーと計測値だけを保存し、音声URLはセッション内の一時値として扱う。

## 料金見積もり

モデルごとに `billingUnit` が異なるため、共通の単純な文字数比較にしない。

- `character`：入力文字数 × 料金
- `utf8-byte`：UTF-8バイト数 × 料金
- `audio-token`：プロバイダが返す使用量を表示。事前見積もりは「算出不可」と表示

特にFish Audio S2 ProはUTF-8バイト課金のため、日本語・中国語では文字数だけの見積もりを表示しない。

## UIの安全策

- APIキーは既存のIndexedDB設定から読み込む
- APIキーをテスト結果、ログ、URL、画面キャプチャに表示しない
- 1回の全モデル比較に上限文字数を設定する
- 初期上限は1,000文字
- 上限超過時は実行前にブロックする
- 実行前に推定費用と対象モデル数を確認表示する
- 実行中にページを閉じても再試行できるよう、完了結果を順次保存する
- 無料モデルでも無制限実行できる表示にしない

## 実装ファイル案

```text
web/src/data/openRouterTtsModels.ts
web/src/types.ts
web/src/services/speech.ts
web/src/services/ttsDebug.ts
web/src/components/TtsDebugModal.tsx
web/src/components/TtsDebugResultCard.tsx
web/src/services/storage.ts
test/ttsDebug.test.mjs
```

### `ttsDebug.ts` の責務

- 入力テキストの文字数・UTF-8バイト数計算
- モデル別の料金見積もり
- `/api/tts`へのリクエスト
- Timing計測
- キャンセル処理
- 結果の整形
- 音声キャッシュとの連携

### `TtsDebugModal.tsx` の責務

- テスト入力
- 対象モデル選択
- 一括実行・停止
- 進捗表示
- 結果カード表示
- 評価入力
- 結果のJSON/CSVコピー

## 実装順序

1. `openRouterTtsModels.ts` のデータと型を追加する
2. モデルごとの料金見積もり関数を追加する
3. 1モデルを実行する `ttsDebug.ts` を追加する
4. Timing計測のテストを追加する
5. 1モデル用の結果カードを追加する
6. 全モデルの逐次・並列実行を追加する
7. 停止・再試行・失敗継続を追加する
8. IndexedDBへの結果保存を追加する
9. 設定画面からデバッグモードを開けるようにする
10. ストリーミング比較を追加する
11. 実機で速度・音質を比較する

## テスト項目

### 自動テスト

- モデルIDが重複していない
- 全モデルに必須メタデータがある
- 文字数課金の見積もりが正しい
- UTF-8バイト課金の見積もりが正しい
- 音声トークン課金を推定値として表示しない
- 1モデル失敗後も他モデルが継続する
- 全停止で未開始・実行中リクエストがキャンセルされる
- APIキーが結果オブジェクトへ入らない
- 1,000文字の上限を超える入力を拒否する
- 結果保存後に音声バイナリを永続保存しない

### 手動テスト

- 中国語短文
- 日本語短文
- 日中混合文
- 長文
- 空文字
- 記号・数字・URLを含む文
- 同一モデルの連続実行
- APIキーなし
- 残高不足
- 429レート制限
- モデル未提供
- モバイル回線
- iOS Safari / Android Chrome / Desktop Chrome

## 合格基準

- 全対象モデルを1画面で選択できる
- 1モデルの失敗が他モデルのテストを中断しない
- リクエスト開始、最初の応答、再生開始、完了を別々に表示できる
- APIキーが画面・ログ・保存データへ漏れない
- 課金単位の違いを表示上で明確に区別できる
- テスト結果を再読込後も確認できる
- `npm test` と `npm run build` が成功する
- 通常の読み上げ、キャッシュ、停止処理を壊さない

## 参照情報

料金・提供状況・性能値は変更されるため、以下は比較データの出典であり、固定仕様ではない。

- [OpenRouter Kokoro 82M](https://openrouter.ai/hexgrad/kokoro-82m/providers)
- [OpenRouter Fish Audio S2 Pro](https://openrouter.ai/fish-audio/s2-pro)
- [OpenRouter Qwen-Audio 3.0 TTS Flash](https://openrouter.ai/qwen/qwen-audio-3.0-tts-flash)
- [OpenRouter Qwen-Audio 3.0 TTS Plus](https://openrouter.ai/qwen/qwen-audio-3.0-tts-plus)
- [OpenRouter Gemini 3.1 Flash TTS Preview](https://openrouter.ai/google/gemini-3.1-flash-tts-preview)
- [OpenRouter MiniMax Speech 2.8 Turbo](https://openrouter.ai/minimax/speech-2.8-turbo)
- [OpenRouter Microsoft MAI-Voice-2](https://openrouter.ai/microsoft/mai-voice-2)
- [OpenRouter Fish Audio S2.1 Pro Free](https://openrouter.ai/fish-audio/s2.1-pro-free:free)
- [Qwen3-TTS GitHub](https://github.com/QwenLM/Qwen3-TTS)
- [CosyVoice 3 Technical Report](https://arxiv.org/html/2505.17589v1)
- [Fish Speech GitHub](https://github.com/fishaudio/fish-speech)

## 実装状況

MVPとして、開発者向けデバッグ画面、単体・複数モデル実行、最大2並列、停止・再試行、応答ヘッダー・初回チャンク・受信完了・再生開始のTiming計測、評価・メモ、JSONコピー、IndexedDBへの履歴保存を実装済み。

WorkerはOpenRouterのレスポンスボディをバッファリングせず転送する。フロントエンドは計測のためReadableStreamを読み取るが、再生はBlob完成後に開始する。MediaSource等による受信中の逐次再生とCSVコピーは次段階の未実装事項とする。
