"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type {
  FieldDef,
  PostWithMeta,
  ThreadSortOrder,
  ThreadWithMeta,
} from "@/lib/types";
import { effectiveSortOrder } from "@/lib/types";
import { initialFreeTagsForEdit, toggleFieldOption } from "@/lib/fields";
import {
  EMPTY_RECORD_FILTER,
  applyRecordFilter,
  countUnrecorded,
  isPostUnrecorded,
  isRecordFilterActive,
  sortByCheckpoint,
  splitPostText,
  type RecordFilter,
} from "@/lib/record";
import { FieldFilterBar } from "@/components/ui/field-filter-bar";
import { PostFieldValues, PostTags } from "@/components/ui/post-field-values";

/** thread.fields が無いときの defs。毎 render で新しい配列を作らず参照を固定する */
const NO_FIELDS: FieldDef[] = [];

function photoCount(post: PostWithMeta): number {
  return post.imageUrls?.length || post.images?.length || 0;
}

/** 行の左に出す日付。不正な日付は null */
function dateParts(iso: string): { md: string; year: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    md: `${d.getMonth() + 1}/${d.getDate()}`,
    year: String(d.getFullYear()),
  };
}

/**
 * 記録帳パネル。仕様は docs/record-mode.md §5.3。
 *
 * - 絞り込み (項目・自由タグ) はタイムラインと同じ filter を共有する
 * - 検索語と未記録は記録帳だけで効く
 * - 行の日付・タイトルを押すとタイムラインのその投稿へ移る (編集・削除はタイムラインで行う)
 */
export function RecordLog({
  posts,
  thread,
  filter,
  onFilterChange,
  onOpenPost,
  canEdit = false,
  onEditFields,
}: {
  /** 絞り込み前の全投稿 (並び順は問わない) */
  posts: PostWithMeta[];
  thread: ThreadWithMeta;
  filter: RecordFilter;
  onFilterChange: (next: RecordFilter) => void;
  onOpenPost: (uri: string) => void;
  canEdit?: boolean;
  onEditFields?: () => void;
}) {
  const defs = thread.fields ?? NO_FIELDS;
  const [sortOrder, setSortOrder] = useState<ThreadSortOrder>(() =>
    effectiveSortOrder(thread),
  );
  // 入力のたびに一覧を組み直すと重くなるので、検索語の反映は遅らせる
  const deferredQuery = useDeferredValue(filter.query);

  // filter 全体を deps にすると、入力のたびに (query だけ変わっても) 組み直してしまう
  const rows = useMemo(
    () =>
      sortByCheckpoint(
        applyRecordFilter(posts, defs, {
          fields: filter.fields,
          tags: filter.tags,
          unrecorded: filter.unrecorded,
          query: deferredQuery,
        }),
        sortOrder,
      ),
    [
      posts,
      defs,
      filter.fields,
      filter.tags,
      filter.unrecorded,
      deferredQuery,
      sortOrder,
    ],
  );
  const unrecordedCount = useMemo(
    () => countUnrecorded(posts, defs),
    [posts, defs],
  );

  const update = (patch: Partial<RecordFilter>) =>
    onFilterChange({ ...filter, ...patch });
  const toggleOption = (fieldId: string, optionId: string) =>
    update({ fields: toggleFieldOption(filter.fields, fieldId, optionId) });
  const toggleTag = (key: string) =>
    update({
      tags: filter.tags.includes(key)
        ? filter.tags.filter((k) => k !== key)
        : [...filter.tags, key],
    });
  const clearAll = () => onFilterChange(EMPTY_RECORD_FILTER);
  const filtering = isRecordFilterActive(filter);

  if (posts.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-white/30">まだチェックポイントがありません</p>
      </div>
    );
  }

  // 選択中なら件数 0 になっても解除できるように出す
  const showUnrecorded =
    defs.length > 0 && (unrecordedCount > 0 || filter.unrecorded);

  return (
    <div>
      <div className="mb-4 space-y-3">
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 focus-within:border-indigo-400/50">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-3.5 shrink-0 text-white/30"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            inputMode="search"
            value={filter.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="本文・タグ・項目で探す"
            aria-label="記録を検索"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/30"
          />
        </label>

        <FieldFilterBar
          posts={posts}
          defs={defs}
          selection={filter.fields}
          tagKeys={filter.tags}
          onToggleOption={toggleOption}
          onToggleTag={toggleTag}
          onClear={() => update({ fields: {}, tags: [] })}
          matchedCount={rows.length}
          canEdit={canEdit}
          onEditFields={onEditFields}
          hasLegacyTagGroups={(thread.tagGroups?.length ?? 0) > 0}
          className=""
        />

        {showUnrecorded && (
          <div className="px-1">
            <div className="mb-1.5 text-[11px] font-medium text-white/40">
              整理
            </div>
            <button
              type="button"
              onClick={() => update({ unrecorded: !filter.unrecorded })}
              aria-pressed={filter.unrecorded}
              className={`flex items-center gap-1.5 rounded-full border border-dashed px-3.5 py-2 text-sm font-medium transition md:px-3 md:py-1 md:text-xs ${
                filter.unrecorded
                  ? "border-amber-400 bg-amber-400 text-amber-950"
                  : "border-amber-400/40 text-amber-300 hover:bg-amber-400/10"
              }`}
            >
              未記録
              <span
                className={`tabular-nums ${
                  filter.unrecorded ? "text-amber-950/70" : "text-amber-300/60"
                }`}
              >
                {unrecordedCount}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-0.5 py-1.5 text-xs text-white/40">
        <span>
          <span className="font-mono text-sm font-bold tabular-nums text-white">
            {rows.length}
          </span>{" "}
          件
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setSortOrder((o) => (o === "desc" ? "asc" : "desc"))
            }
            className="rounded px-1 py-0.5 text-indigo-300 transition hover:text-indigo-200"
          >
            {sortOrder === "desc" ? "新しい順" : "古い順"} ↕
          </button>
          {filtering && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded px-1 py-0.5 text-indigo-300 transition hover:text-indigo-200"
            >
              クリア
            </button>
          )}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-white/30">条件に合う記録はありません</p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-3 text-sm text-indigo-400 hover:underline"
          >
            クリア
          </button>
        </div>
      ) : (
        <ul>
          {rows.map((post) => {
            const date = dateParts(post.checkpointAt);
            const { title, note } = splitPostText(post.text);
            const photos = photoCount(post);
            const unrecorded = isPostUnrecorded(post, defs);
            return (
              <li
                key={post.uri}
                className="grid grid-cols-[62px_1fr] gap-x-3 border-b border-white/5 px-0.5 py-3"
              >
                <button
                  type="button"
                  onClick={() => onOpenPost(post.uri)}
                  title="タイムラインで見る"
                  className="self-start text-left font-mono text-xs leading-snug text-white/50 transition hover:text-white/80"
                >
                  {date ? (
                    <>
                      {date.md}
                      <span className="block text-[10px] text-white/30">
                        {date.year}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </button>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenPost(post.uri)}
                    className="block w-full truncate text-left text-sm font-semibold text-white/90 transition hover:text-white"
                  >
                    {title}
                  </button>
                  {note && (
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-white/40">
                      {note}
                    </p>
                  )}
                  <PostFieldValues
                    post={post}
                    defs={defs}
                    selection={filter.fields}
                    onToggleOption={toggleOption}
                    className="mt-2"
                  />
                  <PostTags
                    tags={initialFreeTagsForEdit(post, defs)}
                    selectedKeys={filter.tags}
                    onToggle={toggleTag}
                    className="mt-2"
                  />
                  {(photos > 0 || unrecorded) && (
                    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                      {photos > 0 && (
                        <span className="text-white/40">写真 {photos}</span>
                      )}
                      {unrecorded && (
                        <span className="text-[10.5px] text-amber-300">
                          未記録
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
