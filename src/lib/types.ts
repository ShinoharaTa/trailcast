import type { BlobRef } from "@atproto/api";

export const NSID_THREAD = "net.shino3.trailcast.thread";
export const NSID_POST = "net.shino3.trailcast.post";
export const NSID_BOOKMARK = "net.shino3.trailcast.bookmark";
export const NSID_TAG_INDEX = "net.shino3.trailcast.tagIndex";

/** tagIndex は 1 ユーザー 1 レコードなので rkey は固定。 */
export const TAG_INDEX_RKEY = "self";

export type ThreadSortOrder = "asc" | "desc";

/** スレッド詳細の表示。timeline = タイムライン、log = 記録帳、review = ふりかえり */
export type ThreadView = "timeline" | "log" | "review";

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

/** 記録項目 (カスタムフィールド) の選択肢。id で参照するので label は自由に変えられる。 */
export interface FieldOption {
  /** スレッド内で一意なランダム id。label からは作らない */
  id: string;
  /** 表示名。クロスポスト時はハッシュタグとして使う (normalizeTag 済み) */
  label: string;
  /** 入力 UI から隠す。既存の値は引き続き解決される */
  archived?: boolean;
}

export type FieldType = "select" | "number" | "duration" | "text";

/**
 * スレッドに定義する記録項目。値は post.fields に field id で入る。
 * 型ごとに使うプロパティが違う (options / multiple は select、unit / scale は number)。
 */
export interface FieldDef {
  /** スレッド内で一意なランダム id。label からは作らない */
  id: string;
  label: string;
  type: FieldType;
  /** select のみ。true は複数選択、false / 省略は 1 つだけ */
  multiple?: boolean;
  /** select のみ */
  options?: FieldOption[];
  /** number のみ (kg, km, 回) */
  unit?: string;
  /** number のみ。入力 UI で受け付ける小数桁数 (表示用のヒント) */
  scale?: number;
  /** 入力 UI から隠す。既存の値は引き続き解決される */
  archived?: boolean;
}

export interface SelectValue {
  $type: "net.shino3.trailcast.post#selectValue";
  field: string;
  /** 選択した FieldOption.id */
  options: string[];
}

export interface NumberValue {
  $type: "net.shino3.trailcast.post#numberValue";
  field: string;
  /** 10 進文字列 (例: "12.5")。lexicon に浮動小数型が無いので文字列で持つ */
  value: string;
}

export interface DurationValue {
  $type: "net.shino3.trailcast.post#durationValue";
  field: string;
  /** 秒 (0 以上の整数) */
  seconds: number;
}

export interface TextValue {
  $type: "net.shino3.trailcast.post#textValue";
  field: string;
  text: string;
}

export type FieldValue = SelectValue | NumberValue | DurationValue | TextValue;

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
   * スレッド詳細を開いたときの表示。省略時はタイムライン。所有者が設定し、
   * 全閲覧者に効く。既存レコードとの後方互換のため optional。
   */
  defaultView?: ThreadView;
  /**
   * タグ絞り込みのカスタムグループ。未設定なら従来どおりフラット表示。
   * 既存レコードとの後方互換のため optional。
   */
  tagGroups?: TagGroup[];
  /**
   * 記録項目の定義。値は post.fields 側に id 参照で入る。
   * tagGroups の後継。既存レコードとの後方互換のため optional。
   */
  fields?: FieldDef[];
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

/** record 上の位置。#64 以降は decimal string、それ以前の record は number */
export interface LocationRecord {
  latitude: string | number;
  longitude: string | number;
  altitude?: string | number;
}

export interface PostRecord {
  thread: string; // at-uri
  text?: string;
  images?: BlobRef[];
  imageUrls?: string[];
  location?: LocationRecord;
  /**
   * 絞り込み・集計用のタグ。先頭の `#` は含めずに保存し、比較は
   * 大文字小文字を区別しない。既存レコードとの後方互換のため optional。
   */
  tags?: string[];
  /**
   * スレッドの記録項目に対する値。無い投稿 (旧データ・他クライアント) は
   * tags から読み取り時に補う。optional。
   */
  fields?: FieldValue[];
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
