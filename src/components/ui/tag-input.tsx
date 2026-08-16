"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { loadTagDictionary } from "@/lib/pds/tags";
import {
  MAX_TAGS_PER_POST,
  buildTagSuggestions,
  dedupeTags,
  parseTagInput,
  tagKey,
  type TagCount,
  type TagSuggestion,
} from "@/lib/tags";
import type { TagEntry, TagGroup } from "@/lib/types";

/**
 * 自分のタグ辞書を読む hook。
 * 辞書はサジェストのためだけに使うので、失敗しても空配列に落として続行する。
 */
export function useTagDictionary(enabled = true): TagEntry[] {
  const [dictionary, setDictionary] = useState<TagEntry[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadTagDictionary()
      .then((entries) => {
        if (!cancelled) setDictionary(entries);
      })
      .catch(() => {
        // サジェストが出ないだけなので握りつぶす
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return dictionary;
}

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** 表示中スレッドで既に使われているタグ。候補の上位に出す */
  threadTags?: TagCount[];
  /**
   * スレッドに定義されたタググループ。候補の最上段に見出し付きで表示し、
   * 未使用のタグでもグループから直接選べるようにする
   */
  tagGroups?: TagGroup[];
  disabled?: boolean;
  /** ラベルの下に出す補助テキスト */
  hint?: string;
  /** 入力欄のラベル。省略時は「タグ」 */
  label?: string;
  /** タグ数の上限。省略時はチェックポイントの上限 (MAX_TAGS_PER_POST) */
  maxTags?: number;
}

/**
 * チェックポイントに付けるタグの入力欄。
 *
 * - Enter / スペース / カンマ で確定
 * - 空の状態で Backspace を押すと直前のタグを削除
 * - ↑ / ↓ で候補を選び、Enter で確定
 * - 候補は「このスレッドで使用中のタグ」→「自分が過去に使ったタグ」の順
 */
export function TagInput({
  value,
  onChange,
  threadTags = [],
  tagGroups,
  disabled = false,
  hint,
  label = "タグ",
  maxTags = MAX_TAGS_PER_POST,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dictionary = useTagDictionary();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isFull = value.length >= maxTags;

  // スレッドのグループ定義から出す候補。選択済み・入力に前方一致しないものは除く
  const groupSections = useMemo(() => {
    if (isFull || !tagGroups || tagGroups.length === 0) return [];
    const selected = new Set(value.map(tagKey));
    const query = tagKey(draft.trim().replace(/^[#＃]+/, ""));
    return tagGroups
      .map((g) => ({
        label: g.label,
        tags: dedupeTags(g.tags).filter((tag) => {
          const key = tagKey(tag);
          return !selected.has(key) && (!query || key.startsWith(query));
        }),
      }))
      .filter((g) => g.tags.length > 0);
  }, [tagGroups, value, draft, isFull]);

  const suggestions = useMemo<TagSuggestion[]>(() => {
    if (isFull) return [];
    // グループ側に出したタグは重複して出さない
    const groupKeys = new Set(
      groupSections.flatMap((g) => g.tags.map(tagKey)),
    );
    return buildTagSuggestions({
      query: draft,
      dictionary,
      threadTags,
      exclude: value,
    }).filter((s) => !groupKeys.has(s.key));
  }, [draft, dictionary, threadTags, value, isFull, groupSections]);

  // ↑↓ / Enter の対象になる候補の一覧。表示順 (グループ → その他) と一致させる
  const navItems = useMemo(
    () => [
      ...groupSections.flatMap((g) => g.tags),
      ...suggestions.map((s) => s.tag),
    ],
    [groupSections, suggestions],
  );

  // 候補の中身が変わったら選択位置をリセットする (別のタグを誤確定しないため)
  useEffect(() => {
    setActiveIndex(-1);
  }, [draft]);

  const addTags = useCallback(
    (input: string) => {
      const parsed = parseTagInput(input);
      if (parsed.length === 0) return;
      const merged = dedupeTags([...value, ...parsed]).slice(0, maxTags);
      onChange(merged);
      setDraft("");
      setActiveIndex(-1);
    },
    [value, onChange, maxTags],
  );

  const removeTag = useCallback(
    (target: string) => {
      const key = tagKey(target);
      onChange(value.filter((t) => tagKey(t) !== key));
    },
    [value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME 変換中の Enter はタグ確定ではなく変換確定なので無視する
    if (e.nativeEvent.isComposing) return;

    if (e.key === "ArrowDown" && navItems.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % navItems.length);
      return;
    }
    if (e.key === "ArrowUp" && navItems.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? navItems.length - 1 : i - 1));
      return;
    }
    if (e.key === "Escape" && activeIndex >= 0) {
      e.preventDefault();
      setActiveIndex(-1);
      return;
    }
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      // Enter でフォームが送信されたり、スペースが入力欄に残ったりしないようにする
      e.preventDefault();
      const picked = activeIndex >= 0 ? navItems[activeIndex] : null;
      addTags(picked ?? draft);
      return;
    }
    if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      removeTag(value[value.length - 1]);
    }
  };

  // 入力欄の外にフォーカスが移ったら、打ちかけの文字列をタグとして確定する。
  // (「打ったのに反映されない」を避けるため)
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (containerRef.current?.contains(e.relatedTarget as Node | null)) return;
    setFocused(false);
    setActiveIndex(-1);
    if (draft.trim()) addTags(draft);
  };

  const showSuggestions = focused && navItems.length > 0;

  // 表示順 (グループ → その他) に対応する activeIndex の開始位置
  const groupOffsets: number[] = [];
  {
    let acc = 0;
    for (const g of groupSections) {
      groupOffsets.push(acc);
      acc += g.tags.length;
    }
  }
  const flatOffset = groupOffsets.length
    ? groupOffsets[groupOffsets.length - 1] +
      groupSections[groupSections.length - 1].tags.length
    : 0;

  return (
    <div ref={containerRef} onBlur={handleBlur} className="relative">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-white/50">
          {label}
        </label>
        <span className="text-[11px] text-white/25">
          {value.length}/{maxTags}
        </span>
      </div>

      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 rounded-xl border bg-white/5 px-2.5 py-2 transition ${
          focused
            ? "border-indigo-400 ring-2 ring-indigo-400/20"
            : "border-white/10"
        } ${disabled ? "opacity-50" : "cursor-text"}`}
      >
        {value.map((tag) => (
          <span
            key={tagKey(tag)}
            className="flex items-center gap-1 rounded-full bg-indigo-500/15 py-1 pl-2.5 pr-1 text-xs font-medium text-indigo-200"
          >
            #{tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={disabled}
              aria-label={`タグ #${tag} を外す`}
              // タッチで押しやすいようモバイルでは一回り大きくする (写真の削除ボタンと同じ扱い)
              className="flex size-6 items-center justify-center rounded-full text-indigo-300/60 transition hover:bg-indigo-400/20 hover:text-indigo-100 md:size-4"
            >
              <CloseIcon className="size-3 md:size-2.5" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={disabled || isFull}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          placeholder={
            isFull
              ? `タグは最大${maxTags}件です`
              : value.length === 0
                ? "#温泉 のように入力"
                : "追加"
          }
          aria-label="タグを入力"
          // モバイルは 16px 未満だと iOS がフォーカス時に自動ズームするので text-base にする
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-base text-white placeholder-white/20 outline-none disabled:cursor-not-allowed md:text-sm"
        />
      </div>

      {hint && !showSuggestions && (
        <p className="mt-1 text-[11px] text-white/30">{hint}</p>
      )}

      {showSuggestions && (
        <div className="absolute inset-x-0 z-20 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-surface-800 p-1.5 shadow-xl shadow-black/40">
          {groupSections.map((g, gi) => (
            <div key={`${g.label}-${gi}`} className="mb-2">
              <p className="px-1 pb-1 text-[10px] font-medium text-white/40">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-2 md:gap-1.5">
                {g.tags.map((tag, ti) => {
                  const index = groupOffsets[gi] + ti;
                  return (
                    <button
                      key={tagKey(tag)}
                      type="button"
                      // mousedown で処理して、blur による確定より先にタグを追加する
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTags(tag);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition md:px-2.5 md:py-1 md:text-xs ${
                        index === activeIndex
                          ? "bg-indigo-500/30 text-indigo-100"
                          : "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 md:gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  // mousedown で処理して、blur による確定より先にタグを追加する
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTags(s.tag);
                  }}
                  onMouseEnter={() => setActiveIndex(flatOffset + i)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition md:px-2.5 md:py-1 md:text-xs ${
                    flatOffset + i === activeIndex
                      ? "bg-indigo-500/30 text-indigo-100"
                      : s.inThread
                        ? "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
                        : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  #{s.tag}
                </button>
              ))}
            </div>
          )}
          <p className="px-1 pb-0.5 pt-2 text-[10px] text-white/25">
            {groupSections.length > 0
              ? "スレッドのグループ → 使用中のタグの順に表示しています"
              : "このスレッドで使用中のタグを先に表示しています"}
          </p>
        </div>
      )}
    </div>
  );
}
