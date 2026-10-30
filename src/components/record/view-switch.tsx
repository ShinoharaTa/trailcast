"use client";

import type { ThreadView } from "@/lib/record";

/**
 * スレッド詳細の最上位の切り替え「タイムライン / 記録」。仕様は docs/record-mode.md §5.3。
 *
 * 固定ヘッダー (56px) の直下に貼り付く。高さ 40px で下端が top-24 (96px) に来るので、
 * タイムラインの DateBadge (sticky top-24) とは重ならない。
 */
export function ViewSwitch({
  view,
  onChange,
}: {
  view: ThreadView;
  onChange: (view: ThreadView) => void;
}) {
  const record = view !== "timeline";
  const segClass = (active: boolean) =>
    `rounded-lg text-xs font-bold transition ${
      active
        ? "bg-white/10 text-white ring-1 ring-inset ring-white/15"
        : "text-white/50 hover:text-white/80"
    }`;
  return (
    <div className="sticky top-14 z-30 -mx-4 mb-6 flex h-10 items-center bg-surface-950/90 px-4 backdrop-blur sm:-mx-5 sm:px-5">
      <div
        role="group"
        aria-label="表示"
        className="grid h-9 w-full grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-0.5"
      >
        <button
          type="button"
          aria-pressed={!record}
          onClick={() => onChange("timeline")}
          className={segClass(!record)}
        >
          タイムライン
        </button>
        <button
          type="button"
          aria-pressed={record}
          // 記録の中のタブは記録帳から開く
          onClick={() => {
            if (!record) onChange("log");
          }}
          className={segClass(record)}
        >
          記録
        </button>
      </div>
    </div>
  );
}

/** 「記録」の中のタブ「記録帳 / ふりかえり」 */
export function RecordTabs({
  view,
  onChange,
}: {
  view: ThreadView;
  onChange: (view: ThreadView) => void;
}) {
  const tabs: { view: ThreadView; label: string }[] = [
    { view: "log", label: "記録帳" },
    { view: "review", label: "ふりかえり" },
  ];
  return (
    <div
      role="tablist"
      aria-label="記録"
      className="mb-4 flex gap-4 border-b border-white/10"
    >
      {tabs.map((t) => {
        const active = view === t.view;
        return (
          <button
            key={t.view}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.view)}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-semibold transition ${
              active
                ? "border-indigo-400 text-white"
                : "border-transparent text-white/40 hover:text-white/70"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
