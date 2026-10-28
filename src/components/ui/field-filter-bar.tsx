"use client";

import { useMemo } from "react";
import type { FieldDef, PostWithMeta } from "@/lib/types";
import {
  FIELD_UNSET,
  fieldFilterGroups,
  freeTagChips,
  type FieldFilterChip,
  type FieldSelection,
  type FreeTagChip,
} from "@/lib/fields";
import { HashIcon } from "@/components/ui/icons";

/**
 * タイムライン上部に置く絞り込み / 集計バー (#60)。仕様は docs/record-mode.md §4.3。
 *
 * - select 項目ごとの行 (項目内 OR / 項目間 AND) と、その下に自由タグの行 (AND)
 * - チップの件数は「その項目以外の条件を当てた上での該当数」(ファセット方式)
 * - 選択済みチップをもう一度押すと解除
 * - 未選択で件数 0 のチップは、押せないようにして空振りを防ぐ
 */
export function FieldFilterBar({
  posts,
  defs,
  selection,
  tagKeys,
  onToggleOption,
  onToggleTag,
  onClear,
  matchedCount,
  canEdit = false,
  onEditFields,
  hasLegacyTagGroups = false,
  className = "mb-8",
}: {
  /** 絞り込み前の全投稿。件数集計はこちらを基準にする */
  posts: PostWithMeta[];
  /** thread.fields ?? [] */
  defs: FieldDef[];
  selection: FieldSelection;
  tagKeys: string[];
  onToggleOption: (fieldId: string, optionId: string) => void;
  onToggleTag: (key: string) => void;
  onClear: () => void;
  matchedCount: number;
  /** スレッド所有者なら記録項目の編集への導線を出す (#37) */
  canEdit?: boolean;
  onEditFields?: () => void;
  /** thread.tagGroups が残っている (変換案内の文言用) */
  hasLegacyTagGroups?: boolean;
  /** 外側の余白。記録帳のツールバーでは詰める */
  className?: string;
}) {
  const groups = useMemo(
    () => fieldFilterGroups(posts, defs, selection, tagKeys),
    [posts, defs, selection, tagKeys],
  );
  const tags = useMemo(
    () => freeTagChips(posts, defs, selection, tagKeys),
    [posts, defs, selection, tagKeys],
  );
  if (groups.length === 0 && tags.length === 0) return null;

  const filtering = Object.keys(selection).length > 0 || tagKeys.length > 0;
  const editLabel =
    defs.length > 0
      ? "記録項目を編集"
      : hasLegacyTagGroups
        ? "記録項目に変換"
        : "記録項目を追加";

  const chipClass = (active: boolean, disabled: boolean, dim: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition md:px-3 md:py-1 md:text-xs ${
      active
        ? "bg-indigo-500 text-white shadow-sm shadow-indigo-900/40"
        : disabled
          ? "cursor-not-allowed bg-white/[0.03] text-white/20"
          : dim
            ? "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/90"
            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90"
    }`;

  const countBadge = (active: boolean, n: number) => (
    <span
      className={`tabular-nums ${active ? "text-white/70" : "text-white/30"}`}
    >
      {n}
    </span>
  );

  const renderOptionChip = (field: FieldDef, c: FieldFilterChip) => {
    const unset = c.optionId === FIELD_UNSET;
    return (
      <button
        key={c.optionId}
        type="button"
        onClick={() => onToggleOption(field.id, c.optionId)}
        disabled={c.disabled}
        aria-pressed={c.active}
        title={c.archived ? "入力画面では非表示の選択肢" : undefined}
        className={`${chipClass(c.active, c.disabled, c.archived)} ${
          unset ? "border border-dashed border-white/20" : ""
        }`}
      >
        {c.label}
        {countBadge(c.active, c.count)}
      </button>
    );
  };

  const renderTagChip = (t: FreeTagChip) => (
    <button
      key={t.key}
      type="button"
      onClick={() => onToggleTag(t.key)}
      disabled={t.disabled}
      aria-pressed={t.active}
      className={chipClass(t.active, t.disabled, false)}
    >
      #{t.tag}
      {countBadge(t.active, t.facetCount)}
    </button>
  );

  return (
    <div className={`${className} rounded-2xl border border-white/5 bg-white/[0.02] p-3.5`}>
      <div className="mb-2.5 flex items-center gap-2">
        <HashIcon className="size-3.5 text-white/30" />
        <span className="text-xs font-medium text-white/50">
          {defs.length > 0 ? "絞り込む" : "タグで絞り込む"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {filtering && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80 md:px-2.5 md:py-1 md:text-[11px]"
            >
              クリア
            </button>
          )}
          {canEdit && onEditFields && (
            <button
              type="button"
              onClick={onEditFields}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/10 hover:text-indigo-200 md:px-2.5 md:py-1 md:text-[11px]"
            >
              {editLabel}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {groups.map((g) => (
          <div key={g.field.id}>
            <div className="mb-1.5 text-[11px] font-medium text-white/40">
              {g.field.label}
            </div>
            <div className="flex flex-wrap gap-2 md:gap-1.5">
              {g.chips.map((c) => renderOptionChip(g.field, c))}
            </div>
          </div>
        ))}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 md:gap-1.5">
            {tags.map(renderTagChip)}
          </div>
        )}
      </div>

      {filtering && (
        <p className="mt-2.5 text-[11px] text-white/40">
          <span className="font-bold tabular-nums text-indigo-300">
            {matchedCount}
          </span>
          {" / "}
          <span className="tabular-nums">{posts.length}</span> 件を表示中
        </p>
      )}
    </div>
  );
}
