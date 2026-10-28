// 記録モード (タイムライン / 記録帳 / ふりかえり) の純関数群。仕様は docs/record-mode.md §5.2。
//
// 記録帳の絞り込みは タイムラインと同じ RecordFilter を共有する。
// 検索語 (query) と未記録 (unrecorded) は記録帳だけで効き、タイムラインは見ない。
// 項目・タグ・範囲は両方で効く。

import type {
  FieldDef,
  FieldValue,
  ThreadRecord,
  ThreadSortOrder,
  ThreadView,
} from "@/lib/types";
import {
  filterPostsByFieldsAndTags,
  hasRangeInput,
  initialFreeTagsForEdit,
  resolveFieldValues,
  type FieldSelection,
  type HasFieldValues,
  type RangeSelection,
} from "@/lib/fields";
import { formatResolvedValue } from "@/lib/fields-format";

export type { ThreadView };

export const THREAD_VIEWS: readonly ThreadView[] = ["timeline", "log", "review"];
export const DEFAULT_THREAD_VIEW: ThreadView = "timeline";
/** いま UI がある表示。ふりかえり (review) は 5b で足す */
export const AVAILABLE_THREAD_VIEWS: readonly ThreadView[] = ["timeline", "log"];

/**
 * 初期表示。未設定・未知の値は "timeline"。
 * available に無い値 (5a 時点の "review") は "log" に落とす。
 */
export function effectiveDefaultView(
  thread: Pick<ThreadRecord, "defaultView">,
  available: readonly ThreadView[] = THREAD_VIEWS,
): ThreadView {
  const view = thread.defaultView;
  if (!view || !THREAD_VIEWS.includes(view)) return DEFAULT_THREAD_VIEW;
  if (available.includes(view)) return view;
  return available.includes("log") ? "log" : DEFAULT_THREAD_VIEW;
}

/** 保存用。既定 ("timeline") なら undefined (sortOrder と同じ慣習) */
export function defaultViewForRecord(view: ThreadView): ThreadView | undefined {
  return view === DEFAULT_THREAD_VIEW ? undefined : view;
}

/**
 * 編集画面の保存値。既定の表示を触っていなければ元の値 ("review" や未知の値も) を
 * そのまま残し、変えたときだけ defaultViewForRecord で組み立てる。
 */
export function defaultViewToSave(
  saved: ThreadRecord["defaultView"],
  initial: ThreadView,
  current: ThreadView,
): ThreadView | undefined {
  return current === initial ? saved : defaultViewForRecord(current);
}

export interface RecordFilter {
  fields: FieldSelection;
  /** tagKey */
  tags: string[];
  /** number 項目の範囲 (入力欄の生文字列) */
  ranges: RangeSelection;
  /** 記録帳のみ */
  query: string;
  /** 記録帳のみ */
  unrecorded: boolean;
}

export const EMPTY_RECORD_FILTER: RecordFilter = {
  fields: {},
  tags: [],
  ranges: {},
  query: "",
  unrecorded: false,
};

/** 絞り込み中か。timeline: true なら fields / tags / ranges だけを見る */
export function isRecordFilterActive(
  f: RecordFilter,
  opts?: { timeline?: boolean },
): boolean {
  if (
    Object.keys(f.fields).length > 0 ||
    f.tags.length > 0 ||
    hasRangeInput(f.ranges)
  ) {
    return true;
  }
  if (opts?.timeline) return false;
  return f.unrecorded || parseQuery(f.query).length > 0;
}

export interface PostLike {
  text?: string;
  tags?: string[];
  fields?: FieldValue[];
  checkpointAt: string;
}

/**
 * 記録項目が 1 つでも定義され、かつ値が 1 つも解決できない投稿。
 * archived 項目の値も「記録あり」。投稿カードに何も出ない値 (空文字) は記録なし扱い。
 */
export function isPostUnrecorded(
  post: HasFieldValues,
  defs: FieldDef[],
): boolean {
  if (defs.length === 0) return false;
  return !resolveFieldValues(post, defs).some((r) => formatResolvedValue(r));
}

export function countUnrecorded(
  posts: HasFieldValues[],
  defs: FieldDef[],
): number {
  if (defs.length === 0) return 0;
  return posts.filter((p) => isPostUnrecorded(p, defs)).length;
}

/** 検索語の正規化。trim → toLocaleLowerCase → 空白で分割 (全角空白含む)。空なら [] */
export function parseQuery(query: string): string[] {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/[\s　]+/)
    .filter((w) => w.length > 0);
}

/**
 * 検索対象の文字列 (小文字)。本文、自由タグ、解決済みの項目値の表示文字列
 * (formatResolvedValue)。項目名は含めない。
 * 要素は改行でつなぐ (検索語は空白を含まないので、要素をまたいで一致しない)。
 */
export function postSearchText(post: PostLike, defs: FieldDef[]): string {
  const parts: string[] = [];
  if (post.text) parts.push(post.text);
  parts.push(...initialFreeTagsForEdit(post, defs));
  for (const r of resolveFieldValues(post, defs)) {
    const text = formatResolvedValue(r);
    if (text) parts.push(text);
  }
  return parts.join("\n").toLocaleLowerCase();
}

/** 全語を含む (AND, 部分一致)。query が空なら同じ参照 */
export function searchPosts<T extends PostLike>(
  posts: T[],
  defs: FieldDef[],
  query: string,
): T[] {
  const words = parseQuery(query);
  if (words.length === 0) return posts;
  return posts.filter((post) => {
    const text = postSearchText(post, defs);
    return words.every((w) => text.includes(w));
  });
}

/**
 * 記録帳の絞り込み。順に unrecorded → fields → tags → ranges → query。
 * opts.timeline が true なら fields / tags / ranges のみ (タイムライン用)。
 * 何も当てなければ同じ参照を返す。
 */
export function applyRecordFilter<T extends PostLike>(
  posts: T[],
  defs: FieldDef[],
  filter: RecordFilter,
  opts?: { timeline?: boolean },
): T[] {
  let out = posts;
  if (!opts?.timeline && filter.unrecorded) {
    out = out.filter((p) => isPostUnrecorded(p, defs));
  }
  out = filterPostsByFieldsAndTags(
    out,
    defs,
    filter.fields,
    filter.tags,
    filter.ranges,
  );
  if (!opts?.timeline) out = searchPosts(out, defs, filter.query);
  return out;
}

/** checkpointAt の並び替え (安定)。不正な日付は並び順に関わらず末尾 */
export function sortByCheckpoint<T extends { checkpointAt: string }>(
  posts: T[],
  order: ThreadSortOrder,
): T[] {
  const sign = order === "asc" ? 1 : -1;
  return posts
    .map((post, index) => ({ post, index, t: new Date(post.checkpointAt).getTime() }))
    .sort((a, b) => {
      const aBad = Number.isNaN(a.t);
      const bBad = Number.isNaN(b.t);
      if (aBad || bBad) {
        if (aBad !== bBad) return aBad ? 1 : -1;
        return a.index - b.index;
      }
      return (a.t - b.t) * sign || a.index - b.index;
    })
    .map((e) => e.post);
}

/** 本文が空のときの記録帳の見出し */
export const NO_TEXT_TITLE = "（本文なし）";

/**
 * 記録帳の 1 行に出す本文。先頭行を title、残りを note (空なら undefined)。
 * 先頭の空行は飛ばす。title が無ければ「（本文なし）」
 */
export function splitPostText(text: string | undefined): {
  title: string;
  note?: string;
} {
  const lines = (text ?? "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim().length > 0);
  if (first < 0) return { title: NO_TEXT_TITLE };
  const title = lines[first].trim();
  const note = lines.slice(first + 1).join("\n").trim();
  return note ? { title, note } : { title };
}
