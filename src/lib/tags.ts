// チェックポイントのタグ (ハッシュタグ) を扱う純関数群。
//
// 保存形式:
//   - `post.tags` に先頭の `#` を含まない文字列の配列として持つ
//   - 表示・Bluesky へのクロスポスト時にだけ `#` を前置する
//   - 比較 (重複排除・絞り込み・集計) は大文字小文字を無視した
//     `tagKey()` で行い、表示は入力された表記をそのまま使う
//
// この差を設けているのは、`#Day2` と `#day2` を別タグとして数えたくない一方で、
// ユーザーが選んだ大文字小文字はそのまま見せたいため。

import type { TagEntry } from "@/lib/types";

/** 1 チェックポイントに付けられるタグの上限 (lexicon の maxLength と一致させる) */
export const MAX_TAGS_PER_POST = 8;

/** タグ 1 件の最大長 (grapheme 単位。lexicon 側はバイト長ではなく文字数上限) */
export const MAX_TAG_LENGTH = 64;

/** 個人辞書に保持するタグ件数の上限 (lexicon の maxLength と一致させる) */
export const MAX_TAG_INDEX_ENTRIES = 500;

/**
 * タグの区切りとして扱う文字。ユーザーが `#温泉 #宿` や `温泉, 宿` と
 * まとめて打った場合にこれらで分割する。
 */
const TAG_SEPARATOR = /[\s,、，]+/;

/**
 * タグ内に含められない文字。Bluesky のハッシュタグとして成立させるため、
 * 空白と区切り記号、および `#` 自体を落とす。
 */
const INVALID_TAG_CHARS = /[\s#,、，]/g;

/**
 * 入力文字列を保存用のタグ 1 件に正規化する。
 * 正規化できない (空になる) 場合は null。
 */
export function normalizeTag(input: string): string | null {
  // 先頭の `#` は何個付いていても剥がす (`##温泉` → `温泉`)
  const stripped = input.trim().replace(/^[#＃]+/, "");
  const cleaned = stripped.replace(INVALID_TAG_CHARS, "");
  if (!cleaned) return null;
  return sliceGraphemes(cleaned, MAX_TAG_LENGTH);
}

/**
 * 大文字小文字を無視した比較用のキー。
 * 表示用の文字列とは別に使い、`#Day2` と `#day2` を同一視する。
 */
export function tagKey(tag: string): string {
  return tag.toLocaleLowerCase();
}

/**
 * 自由入力 (スペース区切りやカンマ区切りを含む) を正規化済みタグの配列にする。
 * 重複は先に現れた表記を残して除去する。
 */
export function parseTagInput(input: string): string[] {
  return dedupeTags(
    input
      .split(TAG_SEPARATOR)
      .map(normalizeTag)
      .filter((t): t is string => t !== null),
  );
}

/**
 * テキスト中の `#タグ` を抜き出す。Bluesky からインポートした投稿の
 * 本文からタグを拾うのに使う。
 */
export function extractTagsFromText(text: string): string[] {
  const matches = text.match(/[#＃][^\s#＃,、，]+/g) ?? [];
  return dedupeTags(
    matches.map(normalizeTag).filter((t): t is string => t !== null),
  );
}

/**
 * 並び替えの tie-break 用の文字列比較。
 *
 * `localeCompare` は ICU のロケールデータに依存し、Node (SSR) と
 * ブラウザで結果が変わりうる。同じ配列が別の順序でレンダリングされると
 * hydration mismatch になるため、コードユニット順で決定的に比較する。
 */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** tagKey ベースで重複を除く。順序は保つ。 */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * 保存直前のサニタイズ。正規化 → 重複除去 → 件数上限。
 * 空配列になった場合は undefined を返し、レコードに空の `tags: []` を
 * 書き込まないようにする。
 */
export function sanitizeTagsForRecord(tags: string[]): string[] | undefined {
  const normalized = dedupeTags(
    tags.map(normalizeTag).filter((t): t is string => t !== null),
  ).slice(0, MAX_TAGS_PER_POST);
  return normalized.length > 0 ? normalized : undefined;
}

// ─── 絞り込み / 集計 ──────────────────────────────────────────

export interface TagCount {
  /** 表示用のタグ (そのタグを最初に使った投稿の表記) */
  tag: string;
  /** 比較用キー */
  key: string;
  count: number;
}

interface HasTags {
  tags?: string[];
}

/**
 * 投稿群からタグごとの件数を集計する。
 * 件数の多い順、同数ならタグ名の昇順で返す。
 */
export function countTags(posts: HasTags[]): TagCount[] {
  const map = new Map<string, TagCount>();
  for (const post of posts) {
    // 1 投稿内に同じタグが重複していても 1 件として数える
    for (const tag of dedupeTags(post.tags ?? [])) {
      const key = tagKey(tag);
      const found = map.get(key);
      if (found) {
        found.count += 1;
      } else {
        map.set(key, { tag, key, count: 1 });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || compareStrings(a.key, b.key),
  );
}

/**
 * AND 条件での絞り込み。`selectedKeys` のすべてを含む投稿だけを返す。
 * 選択が空なら元の配列をそのまま返す。
 */
export function filterPostsByTags<T extends HasTags>(
  posts: T[],
  selectedKeys: string[],
): T[] {
  if (selectedKeys.length === 0) return posts;
  return posts.filter((post) => {
    const keys = new Set((post.tags ?? []).map(tagKey));
    return selectedKeys.every((key) => keys.has(key));
  });
}

/**
 * 現在の選択に対してそのタグを足した場合の該当件数。
 * 0 件になる組み合わせをチップ上で無効化するために使う。
 */
export function countWithTagAdded(
  posts: HasTags[],
  selectedKeys: string[],
  key: string,
): number {
  if (selectedKeys.includes(key)) {
    return filterPostsByTags(posts, selectedKeys).length;
  }
  return filterPostsByTags(posts, [...selectedKeys, key]).length;
}

// ─── サジェスト ──────────────────────────────────────────────

export interface TagSuggestion {
  tag: string;
  key: string;
  /** このスレッド内で既に使われているタグかどうか (UI で区別する) */
  inThread: boolean;
}

export interface BuildSuggestionsInput {
  /** 入力中の文字列。前方一致で絞り込む。空なら全件 */
  query: string;
  /** 個人のタグ辞書 (過去に使ったタグ) */
  dictionary: TagEntry[];
  /** 表示中スレッドで既に使われているタグ (文脈的に優先度が高い) */
  threadTags: TagCount[];
  /** すでに選択済みのタグ。候補から除く */
  exclude: string[];
  /** 返す最大件数 */
  limit?: number;
}

/** 辞書スコアに使う使用回数の上限。スレッド側の段を跨がせないためのクランプ */
const MAX_DICT_COUNT = 100_000;

/** スレッド内の件数 1 つぶんのスコア幅。辞書スコアの取りうる最大値より大きい */
const THREAD_TIER = 1e9;

/**
 * タグ入力欄に出す候補を組み立てる。
 *
 * 並び順の意図:
 *   同じスレッドで既に使ったタグが最も選ばれやすいので先頭に寄せ、
 *   その次に個人辞書を「使用回数 × 直近性」で並べる。
 *   スレッド内で件数が同じタグ同士は、普段よく使う方を上にする。
 */
export function buildTagSuggestions(
  input: BuildSuggestionsInput,
): TagSuggestion[] {
  const { query, dictionary, threadTags, exclude, limit = 12 } = input;

  const excluded = new Set(exclude.map(tagKey));
  const threadKeys = new Set(threadTags.map((t) => t.key));
  const normalizedQuery = tagKey(query.trim().replace(/^[#＃]+/, ""));

  const candidates = new Map<string, { tag: string; score: number }>();

  // スコアは加算する。スレッド内にも辞書にもあるタグは両方のスコアを持ち、
  // スレッド内で同数のタグ同士は「普段よく使う方」が上に来る。
  const consider = (tag: string, score: number) => {
    const key = tagKey(tag);
    if (excluded.has(key)) return;
    if (normalizedQuery && !key.startsWith(normalizedQuery)) return;
    const found = candidates.get(key);
    if (found) {
      found.score += score;
    } else {
      candidates.set(key, { tag, score });
    }
  };

  // スレッド内のタグ: 件数が 1 増えるごとに 1 段 (THREAD_TIER) 上がる。
  // 段の幅は辞書スコアの上限より大きいので、スレッド内の件数が必ず主、
  // 辞書は「同じ件数どうしの並べ替え」だけに効く。
  for (const t of threadTags) {
    consider(t.tag, THREAD_TIER * (t.count + 1));
  }

  // 個人辞書: 使用回数を主、最終使用日時を従にしたスコア。
  // 日時はミリ秒のままだと回数の差を完全に潰すため、日数に丸めて足す。
  for (const entry of dictionary) {
    const days = Number.isNaN(Date.parse(entry.lastUsedAt))
      ? 0
      : Date.parse(entry.lastUsedAt) / 86_400_000;
    consider(entry.tag, Math.min(entry.count, MAX_DICT_COUNT) * 1000 + days);
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1].score - a[1].score || compareStrings(a[0], b[0]))
    .slice(0, limit)
    .map(([key, v]) => ({ tag: v.tag, key, inThread: threadKeys.has(key) }));
}

// ─── 内部ヘルパー ────────────────────────────────────────────

/**
 * grapheme 単位で先頭 max 文字を取り出す。Intl.Segmenter が無い環境では
 * code point 単位で代替する。
 */
function sliceGraphemes(input: string, max: number): string {
  const SegmenterCtor = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter })
    .Segmenter;
  if (SegmenterCtor) {
    const segs: string[] = [];
    for (const s of new SegmenterCtor("ja", {
      granularity: "grapheme",
    }).segment(input)) {
      segs.push(s.segment);
      if (segs.length >= max) break;
    }
    return segs.join("");
  }
  return Array.from(input).slice(0, max).join("");
}
