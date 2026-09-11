import type { BlobRef } from "@atproto/api";

export const NSID_THREAD = "net.shino3.trailcast.thread";
export const NSID_POST = "net.shino3.trailcast.post";
export const NSID_BOOKMARK = "net.shino3.trailcast.bookmark";
export const NSID_TAG_INDEX = "net.shino3.trailcast.tagIndex";

/** tagIndex は 1 ユーザー 1 レコードなので rkey は固定。 */
export const TAG_INDEX_RKEY = "self";

export type ThreadSortOrder = "asc" | "desc";

/**
 * スレッド詳細の絞り込みに出すタグのグループ (例: 「場所: #大阪駅 #東京駅」)。
 * 表示の整理のためだけのもので、タグの実体は常に post.tags 側にある。
 */
export interface TagGroup {
  /** フィルターの見出し (例: 場所) */
  label: string;
  /** 先頭の `#` を含まないタグ */
  tags: string[];
}

export interface ThreadRecord {
  title: string;
  description?: string;
  visibility: "private" | "public";
  coverImage?: BlobRef;
  ogImage?: BlobRef;
  createdAt: string;
  /**
   * Checkpoint の表示順。`desc` (省略時のデフォルト) は新しい順、`asc` は古い順。
   * 既存レコードとの後方互換のため optional で扱う。
   */
  sortOrder?: ThreadSortOrder;
  /**
   * タグ絞り込みのカスタムグループ。未設定なら従来どおりフラット表示。
   * 既存レコードとの後方互換のため optional。
   */
  tagGroups?: TagGroup[];
  /**
   * スレッド自体の分類タグ (旅行 / オフ会 など)。投稿には伝播しない。
   * プロフィールやダッシュボードでスレッドを絞り込むためのもの。optional。
   */
  tags?: string[];
  /**
   * このスレッドの新規投稿に既定で入れるタグ。投稿側で個別に外せる。
   * `tags` (スレッドの分類) とは役割が違うので別フィールド。optional。
   */
  defaultTags?: string[];
  /**
   * 所有者の最終活動時刻 (チェックポイントの作成・編集・削除、スレッド編集)。
   * 一覧の並び順に使う。無ければ createdAt で代用。optional。
   */
  updatedAt?: string;
  /**
   * 所有者が「終了」にした時刻。進行中は未設定。
   * 終了すると既定の並び順が古い順になり、参加者の投稿を受け付けなくなる。
   */
  endedAt?: string;
}

/**
 * 実際に表示に使う並び順。`sortOrder` を明示していればそれ、無ければ
 * 進行中は新しい順 (フィード)、終了後は古い順 (最初から読む物語)。
 */
export function effectiveSortOrder(
  thread: Pick<ThreadRecord, "sortOrder" | "endedAt">,
): ThreadSortOrder {
  return thread.sortOrder ?? (thread.endedAt ? "asc" : "desc");
}

export interface Location {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface PostRecord {
  thread: string; // at-uri
  text?: string;
  images?: BlobRef[];
  imageUrls?: string[];
  location?: Location;
  /**
   * 絞り込み・集計用のタグ。先頭の `#` は含めずに保存し、比較は
   * 大文字小文字を区別しない。既存レコードとの後方互換のため optional。
   */
  tags?: string[];
  checkpointAt: string;
  exif?: Record<string, unknown>;
  sourceRef?: string; // at-uri
  createdAt: string;
}

export interface BookmarkRecord {
  subject: string; // at-uri
  createdAt: string;
}

export interface TagEntry {
  /** 先頭の `#` を含まないタグ文字列 */
  tag: string;
  count: number;
  lastUsedAt: string;
}

/**
 * 自分が使ったタグの辞書。post.tags が正であり、こちらは
 * サジェスト用に導出したキャッシュ (壊れても post から再構築できる)。
 */
export interface TagIndexRecord {
  tags: TagEntry[];
  updatedAt: string;
}

export interface RecordMeta {
  uri: string;
  cid: string;
}

export interface ThreadWithMeta extends ThreadRecord, RecordMeta {
  rkey: string;
}

export interface PostWithMeta extends PostRecord, RecordMeta {
  rkey: string;
}

export interface BookmarkWithMeta extends BookmarkRecord, RecordMeta {
  rkey: string;
}

/**
 * `*WithMeta` から record 部分だけを取り出す。`uri / cid / rkey` は lexicon の
 * schema 外なので putRecord に渡してはいけない。
 *
 * 既存レコードを編集して書き戻すときは、フィールドを列挙して組み立てるのではなく
 * `{ ...stripRecordMeta(existing), 変更分 }` の形にすること。列挙だと、あとから
 * 増えたフィールド (tagGroups / tags / defaultTags など) を落として消してしまう
 * (実際に og/backfill で起きた)。
 */
export function stripRecordMeta<T extends RecordMeta & { rkey: string }>(
  withMeta: T,
): Omit<T, keyof RecordMeta | "rkey"> {
  const copy: Partial<T> = { ...withMeta };
  delete copy.uri;
  delete copy.cid;
  delete copy.rkey;
  return copy as Omit<T, keyof RecordMeta | "rkey">;
}

export function parseAtUri(uri: string): {
  repo: string;
  collection: string;
  rkey: string;
} {
  const parts = uri.replace("at://", "").split("/");
  return {
    repo: parts[0],
    collection: parts[1],
    rkey: parts[2],
  };
}

export function buildAtUri(
  repo: string,
  collection: string,
  rkey: string,
): string {
  return `at://${repo}/${collection}/${rkey}`;
}
