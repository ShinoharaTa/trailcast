# TODO

## Phase 0: プロジェクト初期セットアップ

- [ ] Tauri + Next.js のプロジェクトスキャフォールド（`create-tauri-app` or 手動構成）
- [ ] Rust 側の `Cargo.toml` 初期設定（Tauri プラグイン含む）
- [ ] Next.js の `next.config` を SSG 出力（`output: "export"`）に設定
- [ ] Tauri の `tauri.conf.json` で Next.js の SSG 出力ディレクトリをフロントエンドソースに指定
- [ ] `npm run dev` で Tauri + Next.js のホットリロード開発が動作することを確認
- [ ] ESLint / Prettier / TypeScript の設定
- [ ] Git リポジトリの初期化と `.gitignore` の整備

## Phase 1: カスタム Lexicon 定義

- [ ] Lexicon スキーマファイルの作成（JSON Schema 形式）
  - [ ] `net.shino3.trailcast.thread` の Lexicon 定義
  - [ ] `net.shino3.trailcast.post` の Lexicon 定義
  - [ ] `net.shino3.trailcast.bookmark` の Lexicon 定義
- [ ] Lexicon から TypeScript の型を生成する仕組みの構築（`@atproto/lex-cli` 等）
- [ ] 生成された型が正しく import できることを確認

## Phase 2: AT Protocol 認証

- [ ] `@atproto/api` のインストールと基本セットアップ
- [ ] AT Protocol OAuth (DPOP) フローの調査・方式決定
- [ ] ログイン画面の UI 作成（ハンドル or DID の入力 → PDS 解決 → 認証）
- [ ] OAuth コールバックの処理実装
- [ ] セッション（トークン）の保持と自動更新の実装
  - [ ] Tauri Rust 側でのセキュアストレージ保持を検討（keyring 等）
  - [ ] フォールバックとして WebView の localStorage を利用
- [ ] ログアウト処理
- [ ] 認証状態に応じた画面の出し分け（未認証 → ログイン画面、認証済 → メイン画面）

## Phase 3: スレッド（イベント）管理

### 作成

- [ ] スレッド作成フォームの UI（タイトル、概要、公開設定）
- [ ] PDS への `net.shino3.trailcast.thread` レコード作成（`putRecord`）
- [ ] 作成成功後、スレッド詳細画面へ遷移

### 一覧表示

- [ ] 自分の PDS から `net.shino3.trailcast.thread` を `listRecords` で取得
- [ ] スレッド一覧画面の UI（タイトル、作成日、公開設定のバッジ表示）
- [ ] 一覧から個別スレッドへの遷移

### 詳細表示

- [ ] スレッド詳細画面の UI（タイトル、概要、チェックポイント一覧の枠）
- [ ] スレッドの AT URI からレコードを `getRecord` で取得して表示

### 編集

- [ ] タイトル・概要の編集フォーム
- [ ] PDS 上のレコードを `putRecord` で更新

### 削除

- [ ] スレッド削除の確認ダイアログ
- [ ] `deleteRecord` でスレッドレコードを削除
- [ ] 紐づくチェックポイントの連動削除（自分の PDS 上のもの）

## Phase 4: チェックポイント投稿

### 投稿

- [ ] チェックポイント投稿フォームの UI（テキスト入力、画像選択、位置情報トグル）
- [ ] テキストの 200 文字制限バリデーション
- [ ] 画像の選択・プレビュー（最大 4 枚）
- [ ] 画像を PDS にアップロード（`uploadBlob`）
- [ ] EXIF 読み取り処理の実装
  - [ ] Tauri Rust 側で EXIF パース（`kamadak-exif` クレート等）
  - [ ] Tauri Command として WebView に公開
  - [ ] 撮影位置・撮影時刻を抽出し、フォームに自動入力
- [ ] 現在地取得（Geolocation API）のオプション実装
- [ ] PDS への `net.shino3.trailcast.post` レコード作成（`putRecord`）

### Bluesky 投稿からのインポート

- [ ] 「Bluesky 投稿からインポート」ボタンの設置（スレッド詳細画面内）
- [ ] `app.bsky.feed.getAuthorFeed` で自分の過去投稿を一覧取得
- [ ] 投稿一覧の表示 UI（テキスト・画像プレビュー、チェックボックス付き）
- [ ] 選択した投稿からテキスト・画像を抽出し、チェックポイントに変換
- [ ] チェックポイント時刻に元投稿の `createdAt` を初期値として設定
- [ ] `sourceRef` に元投稿の AT URI を記録
- [ ] 位置情報は付与しない（Bluesky の画像は EXIF 削除済み）
- [ ] PDS への `net.shino3.trailcast.post` レコード作成（`putRecord`）

### 一覧表示（スレッド詳細内）

- [ ] スレッド AT URI に紐づく `post` レコードを `listRecords` で取得
- [ ] チェックポイントを時系列で並べて表示する UI
- [ ] 画像のサムネイル表示
- [ ] 位置情報がある場合の地図プロット（Leaflet or Mapbox）

### 編集

- [ ] チェックポイント時刻の編集 UI（DateTimePicker）
- [ ] 位置情報の削除 UI
- [ ] EXIF メタデータの削除 UI
- [ ] テキスト・画像の編集と `putRecord` による更新

### 削除

- [ ] チェックポイント個別の削除確認
- [ ] `deleteRecord` で PDS から削除

## Phase 5: 共有リンクと OGP

- [ ] スレッド詳細画面に「共有リンクをコピー」ボタンを設置
- [ ] URL 形式の決定（`trailcast.shino3.net/thread/{did}/{rkey}` 等）
- [ ] 軽量バックエンドのプロジェクトセットアップ（Hono）
- [ ] OGP エンドポイントの実装
  - [ ] リクエストの AT URI から PDS を解決し、`getRecord` でスレッド情報を取得
  - [ ] タイトル・概要・サムネイルから `<meta>` タグを動的生成
  - [ ] クローラー以外のリクエストはフロントエンド（SPA）にフォールバック
- [ ] Cloudflare Workers / Vercel へのデプロイ設定
- [ ] `trailcast.shino3.net` のドメイン設定（DNS）

## Phase 6: Web 閲覧版

- [ ] 共有リンク先としてブラウザで開けるスレッド閲覧ページの実装
- [ ] PDS からスレッド＋チェックポイントを取得して表示（読み取り専用）
- [ ] 画像ギャラリー表示
- [ ] 位置情報がある場合のマップ表示
- [ ] レスポンシブデザイン（モバイルブラウザ対応）

## Phase 7: ブックマーク

- [ ] 他ユーザーのスレッド閲覧時に「ブックマーク追加」ボタンを表示
- [ ] PDS への `net.shino3.trailcast.bookmark` レコード作成
- [ ] ブックマーク一覧画面の UI
- [ ] ブックマーク対象スレッドの取得（対象ユーザーの PDS に `getRecord`）
- [ ] ブックマーク削除

## Phase 8: Bluesky クロスポスト

- [ ] スレッド詳細画面に「Bluesky に共有」ボタンを設置
- [ ] クロスポスト用のテキスト入力ダイアログ（デフォルトテンプレート付き）
- [ ] Trailcast スレッド URL を embed link として含む `app.bsky.feed.post` を作成
- [ ] 投稿成功時のフィードバック表示

## Phase 9: Public Event 対応（インデクサー）

- [ ] インデクサーの技術選定を確定（Cloudflare Workers + D1 / VPS / Jetstream 等）
- [ ] Firehose（または Jetstream）からの購読処理の実装
  - [ ] `net.shino3.trailcast.post` のフィルタリング
  - [ ] DB への保存（スレッド URI、投稿者 DID、レコード内容）
- [ ] インデクサー API の実装
  - [ ] `GET /api/thread/:uri/posts` -- スレッドに紐づく全投稿を時系列で返す
- [ ] フロントエンド側で、Public スレッドの場合はインデクサー API から投稿を取得するよう分岐
- [ ] インデクサーのデプロイと運用設定

## Phase 10: UI / UX 磨き込み

- [ ] アプリ全体のデザインシステム整備（カラー、タイポグラフィ、スペーシング）
- [ ] ダークモード対応
- [ ] ローディング状態・エラー状態の UI
- [ ] 画像のリサイズ・圧縮処理（アップロード前）
- [ ] オフライン時の挙動（下書き保存等）
- [ ] アクセシビリティの基本対応

## Phase 11: 配信準備

- [ ] デスクトップ向けビルド・パッケージング（macOS .dmg / Windows .msi / Linux .AppImage）
- [ ] 自動アップデート機能の検討（Tauri Updater）
- [ ] アプリアイコン・スプラッシュスクリーンの作成
- [ ] Tauri Mobile（iOS / Android）の対応調査と PoC
- [ ] モバイルストア配信の要件調査

## 未確定・要検討

- [ ] Public Event の参加者管理方式（招待制？ リンク共有制？ スレッド URI 知っていれば誰でも？）
- [ ] インデクサーの Firehose 購読方式（常時接続 vs Jetstream vs ポーリング）
- [ ] Web 閲覧版を投稿可能なフルクライアントにするかどうか
- [ ] Tauri Mobile と Web の優先順位
- [ ] カバー画像の自動生成（最初のチェックポイントの写真を使う等）
