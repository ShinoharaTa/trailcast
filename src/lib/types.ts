import type { BlobRef } from "@atproto/api";

export const NSID_THREAD = "net.shino3.trailcast.thread";
export const NSID_POST = "net.shino3.trailcast.post";
export const NSID_BOOKMARK = "net.shino3.trailcast.bookmark";

export type ThreadSortOrder = "asc" | "desc";

export interface ThreadRecord {
  title: string;
  description?: string;
  visibility: "private" | "public";
  coverImage?: BlobRef;
  createdAt: string;
  /**
   * Checkpoint の表示順。`asc` (省略時のデフォルト) は古い順、`desc` は新しい順。
   * 既存レコードとの後方互換のため optional で扱う。
   */
  sortOrder?: ThreadSortOrder;
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
  checkpointAt: string;
  exif?: Record<string, unknown>;
  sourceRef?: string; // at-uri
  createdAt: string;
}

export interface BookmarkRecord {
  subject: string; // at-uri
  createdAt: string;
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
