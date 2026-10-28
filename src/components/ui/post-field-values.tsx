"use client";

import type { FieldDef, PostWithMeta } from "@/lib/types";
import { resolveFieldValues, type FieldSelection } from "@/lib/fields";
import { formatResolvedValue } from "@/lib/fields-format";
import { tagKey } from "@/lib/tags";

// タイムラインの投稿カードと記録帳の行で共通に使う、記録項目の値とタグの表示。

/**
 * チェックポイント本文の下、タグの前に出す記録項目の値 (「項目名 値」)。
 * select の値はボタンで、押すとその選択肢の絞り込みをトグルする (#60)
 */
export function PostFieldValues({
  post,
  defs,
  selection,
  onToggleOption,
  className = "mt-3",
}: {
  post: PostWithMeta;
  defs: FieldDef[];
  selection: FieldSelection;
  onToggleOption: (fieldId: string, optionId: string) => void;
  /** 外側の余白。記録帳の行では詰める */
  className?: string;
}) {
  const items = resolveFieldValues(post, defs)
    .map((r) => ({ resolved: r, text: formatResolvedValue(r) }))
    .filter((item) => item.text);
  if (items.length === 0) return null;
  return (
    <div className={`${className} flex flex-wrap gap-1.5`}>
      {items.map(({ resolved, text }) => {
        const { field } = resolved;
        if (field.type !== "select") {
          return (
            <span
              key={field.id}
              className="flex max-w-full items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px]"
            >
              <span className="shrink-0 text-white/40">{field.label}</span>
              <span className="min-w-0 truncate text-white/75">{text}</span>
            </span>
          );
        }
        const byId = new Map((field.options ?? []).map((o) => [o.id, o]));
        const selected = selection[field.id] ?? [];
        return (
          <span
            key={field.id}
            className="flex max-w-full items-center gap-0.5 rounded-full bg-white/5 py-0.5 pl-2.5 pr-1 text-[11px]"
          >
            <span className="mr-0.5 shrink-0 text-white/40">{field.label}</span>
            {[...new Set(resolved.optionIds ?? [])].map((id) => {
              const opt = byId.get(id);
              // 定義から消えた選択肢は絞り込めないので文字だけ出す
              if (!opt) {
                return (
                  <span key={id} className="min-w-0 truncate px-1.5 text-white/40">
                    {formatResolvedValue({ ...resolved, optionIds: [id] })}
                  </span>
                );
              }
              const active = selected.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggleOption(field.id, id)}
                  aria-pressed={active}
                  className={`min-w-0 truncate rounded-full px-1.5 transition ${
                    active
                      ? "bg-indigo-500/30 text-indigo-100"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

/** チェックポイント本文の下に出すタグ。クリックでその絞り込みをトグルする */
export function PostTags({
  tags,
  selectedKeys,
  onToggle,
  className = "mt-3",
}: {
  tags: string[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  /** 外側の余白。記録帳の行では詰める */
  className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <div className={`${className} flex flex-wrap gap-2 md:gap-1.5`}>
      {tags.map((tag) => {
        const key = tagKey(tag);
        const active = selectedKeys.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition md:px-2.5 md:py-0.5 md:text-[11px] ${
              active
                ? "bg-indigo-500/30 text-indigo-100"
                : "bg-indigo-500/10 text-indigo-300/80 hover:bg-indigo-500/20 hover:text-indigo-200"
            }`}
          >
            #{tag}
          </button>
        );
      })}
    </div>
  );
}
