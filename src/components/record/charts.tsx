"use client";

import { useLayoutEffect, useRef } from "react";
import {
  heatLevel,
  visibleHeatmapCells,
  type BarLayout,
  type HeatmapCell,
  type SparklineLayout,
} from "@/lib/review";

// ふりかえりのグラフ。手書きの SVG (docs/record-mode.md §7)。座標は src/lib/review.ts の
// レイアウト関数で計算し、ここでは描くだけにする。

/** 月別の棒グラフ。横スクロールの容器に入れ、初期位置は右端 (最新月) */
export function MonthlyBars({
  layout,
  formatValue,
  formatTitle,
  label,
  padLeft,
  periodKey,
}: {
  layout: BarLayout;
  /** barLayout に渡した padLeft (目盛りのラベルを置く幅) */
  padLeft: number;
  /** 棒の上と目盛りの値 */
  formatValue: (value: number) => string;
  /** 棒の <title> */
  formatTitle: (index: number) => string;
  label: string;
  /** 期間のキー。変わったら (月数が同じでも) 右端へ戻す */
  periodKey: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 月数・期間が変わるたびに最新月が見える位置へ戻す
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [layout.width, periodKey]);

  const { width, height } = layout;
  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={label}
        className="block font-mono text-[10px]"
      >
        {layout.gridlines.map((g) => (
          <g key={g.value}>
            <line
              x1={padLeft}
              x2={width}
              y1={g.y}
              y2={g.y}
              className="stroke-white/5"
            />
            <text
              x={padLeft - 6}
              y={g.y + 3}
              textAnchor="end"
              className="fill-white/40"
            >
              {formatValue(g.value)}
            </text>
          </g>
        ))}
        {layout.bars.map((b, i) => (
          <g key={i}>
            <title>{formatTitle(i)}</title>
            {b.h > 0 && (
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={2}
                className="fill-indigo-400"
              />
            )}
            {b.value !== null && b.value !== 0 && (
              <text
                x={b.x + b.w / 2}
                y={b.y - 4}
                textAnchor="middle"
                className="fill-white/70"
              >
                {formatValue(b.value)}
              </text>
            )}
            <text
              x={b.x + b.w / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-white/40"
            >
              {b.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** 推移の折れ線。幅は容器いっぱいに伸ばす (viewBox を横に引き伸ばす) */
export function Sparkline({
  layout,
  width,
  height,
  label,
}: {
  layout: SparklineLayout;
  /** layout を計算したときの幅 (viewBox) */
  width: number;
  height: number;
  label: string;
}) {
  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-surface-900 px-2 pt-2 pb-1.5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label={label}
        className="block"
      >
        <path d={layout.area} className="fill-indigo-400/10" />
        <path
          d={layout.d}
          fill="none"
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-indigo-400"
        />
        {layout.last && (
          // 引き伸ばしても丸のままにするため、長さ 0 の線を太い丸線端で描く
          <path
            d={`M${layout.last.x} ${layout.last.y} l0 0`}
            strokeWidth={6}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-indigo-300"
          />
        )}
      </svg>
      <div className="mt-1 flex justify-end font-mono text-[10px] text-white/40">
        <span>最新</span>
      </div>
    </div>
  );
}

/** セル 11px、ピッチ 14px */
const CELL = 11;
const PITCH = 14;
/** 曜日ラベルの幅 */
const HEAT_LEFT = 20;
/** 月ラベルの高さ */
const HEAT_TOP = 16;
/** 最後の週の月ラベル ("12月" など) が右端で切れないよう空ける幅 */
const HEAT_RIGHT = 12;
const DOW_LABELS: [number, string][] = [
  [0, "日"],
  [2, "火"],
  [4, "木"],
  [6, "土"],
];
const LEVEL_CLASS = [
  "fill-white/5",
  "fill-indigo-400/45",
  "fill-indigo-400/70",
  "fill-indigo-300",
] as const;

/** "YYYY-MM-DD" → "YYYY/M/D" */
function slashDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}

/** 活動した日のヒートマップ (列 = 週、行 = 曜日)。初期位置は右端 (今日)。今日より後の日は描かない */
export function Heatmap({
  cells,
  monthLabels,
  weeks,
  now,
}: {
  cells: HeatmapCell[];
  monthLabels: { week: number; label: string }[];
  weeks: number;
  /** 今日の基準 (heatmapCells に渡したもの) */
  now: Date;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  const width = HEAT_LEFT + weeks * PITCH + HEAT_RIGHT;
  const height = HEAT_TOP + 7 * PITCH;
  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`活動した日 (直近 ${weeks} 週)`}
        className="block font-mono text-[10px]"
      >
        {DOW_LABELS.map(([dow, label]) => (
          <text
            key={dow}
            x={0}
            y={HEAT_TOP + dow * PITCH + 9}
            className="fill-white/40 font-sans"
          >
            {label}
          </text>
        ))}
        {monthLabels.map((l) => (
          <text
            key={l.week}
            x={HEAT_LEFT + l.week * PITCH}
            y={10}
            className="fill-white/40"
          >
            {l.label}
          </text>
        ))}
        {visibleHeatmapCells(cells, now).map((c) => (
          <rect
            key={c.day}
            x={HEAT_LEFT + c.week * PITCH}
            y={HEAT_TOP + c.dow * PITCH}
            width={CELL}
            height={CELL}
            rx={2}
            className={LEVEL_CLASS[heatLevel(c.count)]}
          >
            <title>{`${slashDay(c.day)} ${c.count}件`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}
