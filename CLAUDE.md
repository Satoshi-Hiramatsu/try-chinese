# しゃべチャイナ - プロジェクト規約（CLAUDE.md）

**中国語会話学習アプリ（ブラウザ版）**
「趣味の合う外国人の友達と、中国語で話す。」

本ファイルは Claude Code 向けの開発ガイドラインおよびプロジェクト規約を定義する。

---

## 1. 技術スタック

- **フロントエンド (`web/`)**: React + Vite + TypeScript (strict) + Tailwind CSS + PWA (`vite-plugin-pwa`)
- **バックエンド (`worker/`)**: Cloudflare Workers + Hono + TypeScript
- **データ保持**: ブラウザ IndexedDB（会話履歴・語彙帳・設定・APIキー）
- **型付け**: strict を遵守し、`any` を避ける。
- **基本原則**: 最小構成（MVP）優先。手軽に動くものを先に作り、後から拡張する。

---

## 2. 命名規約（用語定義書に準拠）

- コード内の型・変数・ファイル名は [用語定義書.md](file:///./用語定義書.md) の英語表記を使用する。
- `Friend`（趣味ペルソナ / 外国人の友達。キャラやNPCと呼称しない）
- `hskLevel`（HSK 級別設定、number 型）
- `Voice`（音声属性: `{ quality: 'standard' | 'natural' | 'high', gender: 'male' | 'female' }`）
- `BilingualReply`（バイリンガル応答: `{ zh, ja, pinyin, hskLevel }`）
- `Correction`（発話添削: `{ hasCorrection, original, suggested, ja }`）
- `HobbyVocabulary`（趣味語彙: `{ term, pinyin, hskLevel }`）
- `AppConfig`（BYO-AI プロバイダ設定: `{ llm, languages, voice }`）
- `Session`（会話セッション、IndexedDB 保存）
- `VocabularyBook`（語彙帳）

---

## 3. 重要決定事項（要件定義書に準拠）

- **片言対応**: 不完全・片言の発話でも会話を成立させ、返答時に毎回優しく添削（`Correction`）を返す。
- **添削表示**: 返答テキストの下に小さく控えめに添える。
- **HSK 制御**: 級内ベース＋自然さ優先（平易な言い換えを行い、多少の逸脱は許容）。
- **ピンイン**: 常時表示（発音重視）。
- **音声**: standard / natural × male / female。STT は中国語・日本語の両対応。
- **データ・セキュリティ**: 個人利用前提。API キー・会話履歴はブラウザ（IndexedDB）保存。Workers はプロキシ・転送専用。API キーは絶対にコミットしない。

---

## 4. コマンド集

```bash
# ビルド
npm run build              # 全体ビルド (web + worker)
npm run build:web          # フロントエンドビルド
npm run build:worker       # バックエンド型チェック

# 開発
npm run dev:web            # フロントエンド開発サーバー
npm run dev:worker         # Workers ローカル開発サーバー

# テスト
npm test                   # Worker テスト実行 (vitest)
```

---

## 5. 開発規約

- **1タスク ＝ 1コミット**:
  - コミットメッセージには必ずタスク番号プレフィックスを付ける（例: `T-00: ...`, `T-01: ...`）。
- **コミット前チェック**:
  - `git diff` で意図しない変更や機密情報がないか必ず確認する。
  - `npm run build` および `npm test` が通過していることを確認する。
- **最小構成の維持**: 不要な依存ライブラリを追加しない。
