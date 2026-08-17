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
   * Checkpoint の表示順。`asc` (省略時のデフォルト) は古い順、`desc` は新しい順。
   * 既存レコードとの後方互換のため optional で扱う。
   */
  sortOrder?: ThreadSortOrder;
  /**
   * タグ絞り込みのカスタムグループ。未設定なら従来どおりフラット表示。
   * 既存レコードとの後方互換のため optional。
   */
  tagGroups?: TagGroup[];
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
