"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { loadTagDictionary } from "@/lib/pds/tags";
import {
  MAX_TAGS_PER_POST,
  dedupeTags,
  parseTagInput,
  tagKey,
  type TagCount,
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

/** 「よく使うタグ」の折りたたみ時に見せる件数 */
const DICT_VISIBLE_DEFAULT = 10;

export interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** 表示中スレッドで既に使われているタグ。「このスレッドのタグ」として出す */
  threadTags?: TagCount[];
  /** スレッドに定義されたタググループ。見出し付きで最上段に出す */
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
 * 候補はすべて入力欄の**上**に常時表示のトグルチップとして並べる:
 *   スレッドのグループ (見出しごと) → このスレッドのタグ → よく使うタグ (個人辞書)
 *
 * - チップはタップで付け外し。フォーカス不要なのでキーボードが出ない
 * - 入力欄に文字を打つと、チップがその場で前方一致に絞り込まれる
 *   (浮くドロップダウンを使わないので、モバイルでキーボードに隠れない #10)
 * - 新規タグは自由入力。Enter / スペース / カンマ で確定、
 *   空の状態で Backspace を押すと直前のタグを削除
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
  const [dictExpanded, setDictExpanded] = useState(false);
  const dictionary = useTagDictionary();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isFull = value.length >= maxTags;
  const selectedKeys = useMemo(() => new Set(value.map(tagKey)), [value]);

  // ─── 候補セクションの組み立て ───────────────────────────

  const pickerGroups = useMemo(() => {
    if (!tagGroups || tagGroups.length === 0) return [];
    return tagGroups
      .map((g) => ({ label: g.label, tags: dedupeTags(g.tags) }))
      .filter((g) => g.tags.length > 0);
  }, [tagGroups]);

  const groupTagKeys = useMemo(
    () => new Set(pickerGroups.flatMap((g) => g.tags.map(tagKey))),
    [pickerGroups],
  );

  // このスレッドのタグ (件数順)。グループに出したものは重複して出さない
  const threadSection = useMemo(
    () =>
      threadTags.filter((t) => !groupTagKeys.has(t.key)).map((t) => t.tag),
    [threadTags, groupTagKeys],
  );

  // よく使うタグ (個人辞書、使用回数 → 直近使用順)。グループ・スレッド分は除く
  const dictSection = useMemo(() => {
    const threadKeys = new Set(threadTags.map((t) => t.key));
    return dictionary
      .filter((e) => {
        const key = tagKey(e.tag);
        return !groupTagKeys.has(key) && !threadKeys.has(key);
      })
      .sort(
        (a, b) =>
          b.count - a.count ||
          (Date.parse(b.lastUsedAt) || 0) - (Date.parse(a.lastUsedAt) || 0) ||
          (tagKey(a.tag) < tagKey(b.tag) ? -1 : 1),
      )
      .map((e) => e.tag);
  }, [dictionary, groupTagKeys, threadTags]);

  // 入力中の文字列での前方一致絞り込み。チップをその場でフィルタする
  const query = tagKey(draft.trim().replace(/^[#＃]+/, ""));
  const matches = (tag: string) => !query || tagKey(tag).startsWith(query);

  const visibleGroups = pickerGroups
    .map((g) => ({ label: g.label, tags: g.tags.filter(matches) }))
    .filter((g) => g.tags.length > 0);
  const visibleThread = threadSection.filter(matches);
  const dictMatches = dictSection.filter(matches);
  // 絞り込み中は折りたたみを無視して一致分をすべて見せる
  const dictVisible =
    query || dictExpanded
      ? dictMatches
      : dictMatches.slice(0, DICT_VISIBLE_DEFAULT);
  const dictHiddenCount = dictMatches.length - dictVisible.length;
  const hasCandidates =
    visibleGroups.length > 0 || visibleThread.length > 0 || dictVisible.length > 0;

  // ─── 追加 / 削除 ─────────────────────────────────────────

  const addTags = useCallback(
    (input: string) => {
      const parsed = parseTagInput(input);
      if (parsed.length === 0) return;
      const merged = dedupeTags([...value, ...parsed]).slice(0, maxTags);
      onChange(merged);
      setDraft("");
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

  const toggleTag = (tag: string) => {
    if (selectedKeys.has(tagKey(tag))) {
      removeTag(tag);
    } else {
      addTags(tag);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME 変換中の Enter はタグ確定ではなく変換確定なので無視する
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Escape" && draft) {
      e.preventDefault();
      setDraft("");
      return;
    }
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      // Enter でフォームが送信されたり、スペースが入力欄に残ったりしないようにする
      e.preventDefault();
      addTags(draft);
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
    if (draft.trim()) addTags(draft);
  };

  // ─── 描画 ────────────────────────────────────────────────

  const renderChip = (tag: string) => {
    const key = tagKey(tag);
    const selected = selectedKeys.has(key);
    return (
      <button
        key={key}
        type="button"
        // mousedown を殺して、入力中でも blur による draft 確定を挟まず押せるようにする
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleTag(tag)}
        disabled={disabled || (isFull && !selected)}
        aria-pressed={selected}
        className={`rounded-full px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed md:px-3 md:py-1 md:text-xs ${
          selected
            ? "bg-indigo-500 text-white shadow-sm shadow-indigo-900/40"
            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90 disabled:opacity-40"
        }`}
      >
        #{tag}
      </button>
    );
  };

  const sectionLabelClass = "mb-1 text-[11px] font-medium text-white/40";
  const chipRowClass = "flex flex-wrap gap-2 md:gap-1.5";
  const expandButtonClass =
    "rounded-full px-3.5 py-2 text-sm font-medium text-indigo-300/80 transition hover:bg-indigo-500/10 hover:text-indigo-200 md:px-3 md:py-1 md:text-xs";

  return (
    <div ref={containerRef} onBlur={handleBlur}>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-xs font-medium text-white/50">
          {label}
        </label>
        <span className="text-[11px] text-white/25">
          {isFull
            ? `上限 ${maxTags} 件`
            : value.length > 0
              ? `${value.length}件`
              : ""}
        </span>
      </div>

      {hasCandidates && (
        <div className="mb-2.5 space-y-2">
          {visibleGroups.map((g, gi) => (
            <div key={`${g.label}-${gi}`}>
              <p className={sectionLabelClass}>{g.label}</p>
              <div className={chipRowClass}>{g.tags.map(renderChip)}</div>
            </div>
          ))}
          {visibleThread.length > 0 && (
            <div>
              <p className={sectionLabelClass}>このスレッドのタグ</p>
              <div className={chipRowClass}>{visibleThread.map(renderChip)}</div>
            </div>
          )}
          {dictVisible.length > 0 && (
            <div>
              <p className={sectionLabelClass}>よく使うタグ</p>
              <div className={chipRowClass}>
                {dictVisible.map(renderChip)}
                {dictHiddenCount > 0 && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setDictExpanded(true)}
                    className={expandButtonClass}
                  >
                    もっと見る ({dictHiddenCount})
                  </button>
                )}
                {dictExpanded &&
                  !query &&
                  dictMatches.length > DICT_VISIBLE_DEFAULT && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setDictExpanded(false)}
                      className={expandButtonClass}
                    >
                      閉じる
                    </button>
                  )}
              </div>
            </div>
          )}
        </div>
      )}

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
                ? "#温泉 のように入力・絞り込み"
                : "追加"
          }
          aria-label="タグを入力"
          // モバイルは 16px 未満だと iOS がフォーカス時に自動ズームするので text-base にする
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-base text-white placeholder-white/20 outline-none disabled:cursor-not-allowed md:text-sm"
        />
      </div>

      {hint && <p className="mt-1 text-[11px] text-white/30">{hint}</p>}
    </div>
  );
}
