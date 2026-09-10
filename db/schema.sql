-- Public スレッドの投稿集約インデックス (#14)
--
-- 正本は常に各ユーザーの PDS。ここには at-uri の紐付けと並び替えに要る最小限の
-- メタデータだけを置き、本文・画像・位置情報は保存しない。全行を捨てても
-- 各ユーザーが /api/index/sync を叩けば PDS から完全に再構築できる。
--
-- 適用:
--   npx wrangler d1 execute trailcast-index --local --file=db/schema.sql
--   npx wrangler d1 execute trailcast-index --remote --file=db/schema.sql

CREATE TABLE IF NOT EXISTS post_index (
  -- at://<author did>/net.shino3.trailcast.post/<rkey>
  post_uri      TEXT PRIMARY KEY,
  -- at://<owner did>/net.shino3.trailcast.thread/<rkey>
  thread_uri    TEXT NOT NULL,
  author_did    TEXT NOT NULL,
  cid           TEXT NOT NULL,
  checkpoint_at TEXT NOT NULL,
  -- 同期時の世代判定に使う。sync 開始時刻より古い行は PDS 側で消えたとみなす
  indexed_at    TEXT NOT NULL
);

-- スレッド詳細の主クエリ: thread_uri で引いて checkpoint_at 昇順
CREATE INDEX IF NOT EXISTS idx_post_index_thread
  ON post_index(thread_uri, checkpoint_at, post_uri);

-- 同期時の世代 GC 用
CREATE INDEX IF NOT EXISTS idx_post_index_author
  ON post_index(author_did, indexed_at);

CREATE TABLE IF NOT EXISTS sync_state (
  author_did     TEXT PRIMARY KEY,
  last_synced_at TEXT NOT NULL,
  post_count     INTEGER NOT NULL
);
