# しゃべチャイナ - プロジェクト規約（AGENTS.md）

**中国語会話学習アプリ（ブラウザ版）**
「趣味の合う外国人の友達と、中国語で話す。」

本ファイルは AI エージェント（Antigravity, Codex, Claude Code 等）および開発者が従うべき技術・命名・コマンド・開発規約を定義する。

---

## 1. 技術スタック

- **フロントエンド (`web/`)**: React + Vite + TypeScript (strict) + Tailwind CSS + PWA (`vite-plugin-pwa`)
- **バックエンド (`worker/`)**: Cloudflare Workers + Hono + TypeScript
- **データ保持**: ブラウザ IndexedDB（会話履歴・語彙帳・設定・キー）
- **型付け**: strict を徹底し、`any` 型の使用を禁止する。
- **アーキテクチャ方針**: 最小構成（MVP）を最優先。まずは確実に動作するものを作り、後から拡張する。

---

## 2. 命名基準（用語定義書.md に準拠）

コード内の型定義・変数名・ファイル名は [用語定義書.md](file:///./用語定義書.md) の英語表記を必ず使用すること。

| ドメイン用語 | コード内の英語表記 | 定義・役割 |
|---|---|---|
| 趣味ペルソナ / 外国人の友達 | `Friend`, `friendId` | AI の会話相手（キャラ/NPC/ボット等の呼称は避ける） |
| HSK 級別設定 | `hskLevel` (number) | HSK 1〜6 級。会話語彙・文法範囲を制御 |
| 音声属性 | `Voice` | `{ quality: 'standard' \| 'natural' \| 'high', gender: 'male' \| 'female' }` |
| バイリンガル応答 | `BilingualReply` | `{ zh: string, ja: string, pinyin: string, hskLevel: number }` |
| 発話添削 | `Correction` | `{ hasCorrection: boolean, original?: string, suggested?: string, ja?: string }` |
| 趣味語彙 | `HobbyVocabulary` | `{ term: string, pinyin: string, hskLevel?: number }` |
| プロバイダ設定 (BYO-AI) | `AppConfig` | `{ llm: object, languages: object, voice: object }` |
| 会話セッション | `Session` | 一連の会話のまとまり（IndexedDB 保存） |
| 語彙帳 | `VocabularyBook` | 会話で出た新表現・間違いの保存一覧 |

---

## 3. 重要決定事項（要件定義書.md に準拠）

- **片言対応**: 不完全な発話でも会話を成立させつつ、毎回の返答で優しく添削（`Correction`）を返す。
- **添削表示**: チャット返答の下に控えめに添える（本文は自然な中国語、添削は小さく）。
- **HSK 制御**: 級内ベース＋自然さ優先（必要な語は平易に言い換え、多少の逸脱を許容）。
- **ピンイン**: 常時表示（発音重視）。
- **音声**: standard / natural × male / female。STT は中国語＋日本語の両対応。
- **データ・キー管理**: 個人利用前提。API キーや履歴はブラウザ（IndexedDB）に保持し、Workers はリクエスト転送専用とする。
- **シークレット管理**: API キーは絶対に Git リポジトリへコミットしない（`.env*` やキーファイルは `.gitignore` 対象）。

---

## 4. 開発コマンド

ルートディレクトリで以下を実行可能：

```bash
# 全体ビルド（web + worker）
npm run build

# 個別ビルド
npm run build:web
npm run build:worker

# 開発サーバー起動
npm run dev:web
npm run dev:worker

# テスト実行
npm test
```

---

## 5. 開発規約・タスク管理

- **1タスク ＝ 1コミット**:
  - タスクは `T-XX` 形式で管理（例: `T-01: POST /api/chat を実装`）。
  - コミットメッセージの先頭に必ず `T-XX:` を付与する。
- **コミット前確認**:
  - `git diff` を確認し、意図しない変更やシークレットが含まれていないことを確認する。
  - `npm run build` および `npm test` がエラーなく通過することを確認する。
- **依存パッケージの最小化**: 不要なライブラリを追加せず、標準機能と指定ツールでシンプルに保つ。
