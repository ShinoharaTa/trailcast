// ふりかえり (記録モード) の集計の純関数群。仕様は docs/record-mode.md §6.2。
//
// 日付キー・期間はブラウザのローカル時刻で作る (タイムラインの日付グループと同じ)。
// 「いま」に依存する関数は now を引数で受け取る (テストで固定する)。

import type { FieldDef } from "@/lib/types";
import {
  FIELD_UNSET,
  countSelectOptions,
  summarizeDuration,
  summarizeNumber,
  type HasFieldValues,
  type NumericSummary,
} from "@/lib/fields";
import { formatDuration } from "@/lib/fields-format";
import type { PostLike } from "@/lib/record";

// ─── 期間 ────────────────────────────────────────────────────

export type PeriodKey = "all" | "3m" | "1y" | `y:${number}`;
export interface Period {
  key: PeriodKey;
  label: string;
}

/** 年ごとの期間チップの上限 */
export const MAX_YEAR_PERIODS = 5;

const FIXED_PERIODS: Period[] = [
  { key: "all", label: "全期間" },
  { key: "3m", label: "直近3か月" },
  { key: "1y", label: "直近1年" },
];

function parseTime(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 固定 3 つ + 投稿がある年 (新しい順、最大 5)。投稿が 0 件なら固定 3 つだけ */
export function availablePeriods(
  posts: { checkpointAt: string }[],
  // 年チップは投稿から作るので now は使わない (シグネチャは仕様に揃える)
  _now: Date,
): Period[] {
  void _now;
  const years = new Set<number>();
  for (const p of posts) {
    const d = parseTime(p.checkpointAt);
    if (d) years.add(d.getFullYear());
  }
  const yearPeriods = [...years]
    .sort((a, b) => b - a)
    .slice(0, MAX_YEAR_PERIODS)
    .map((y): Period => ({ key: `y:${y}`, label: `${y}年` }));
  return [...FIXED_PERIODS, ...yearPeriods];
}

/** months か月前の同時刻。前の月に同じ日が無ければその月の末日に寄せる (5/31 の 3 か月前 → 2/28) */
function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * [from, to) をローカル時刻で。all は両方 null。
 * 3m / 1y は now の 3 か月 / 1 年前の同時刻から now まで (now を含む)。
 * y:N はその年の 1/1 00:00 から翌年 1/1 00:00 まで。
 */
export function periodRange(
  key: PeriodKey,
  now: Date,
): { from: Date | null; to: Date | null } {
  if (key === "all") return { from: null, to: null };
  // to は排他なので、now を含めるため 1ms 先にする
  const to = new Date(now.getTime() + 1);
  if (key === "3m") return { from: monthsBefore(now, 3), to };
  if (key === "1y") return { from: monthsBefore(now, 12), to };
  const year = Number(key.slice(2));
  return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) };
}

/** 期間内の投稿。all は同じ参照を返す。それ以外では不正な日付の投稿を除く */
export function filterByPeriod<T extends { checkpointAt: string }>(
  posts: T[],
  key: PeriodKey,
  now: Date,
): T[] {
  if (key === "all") return posts;
  const { from, to } = periodRange(key, now);
  return posts.filter((p) => {
    const d = parseTime(p.checkpointAt);
    if (!d) return false;
    const t = d.getTime();
    return (!from || t >= from.getTime()) && (!to || t < to.getTime());
  });
}

// ─── 日付キー ────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" (ローカル)。不正なら null */
export function dayKey(iso: string): string | null {
  const d = parseTime(iso);
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM" (ローカル)。不正なら null */
export function monthKey(iso: string): string | null {
  const d = parseTime(iso);
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// ─── KPI ─────────────────────────────────────────────────────

export interface ReviewKpis {
  count: number;
  /** dayKey のユニーク数 */
  activeDays: number;
  /** count / spanMonths (count 0 なら null) */
  perMonth: number | null;
  /** 最初〜最後の投稿の月数 (最低 1、小数) */
  spanMonths: number;
  busiestDay: { day: string; count: number } | null;
}

/** 平均的なひと月の長さ (ミリ秒)。グレゴリオ暦の 1 年 / 12 */
const MS_PER_MONTH = (365.2425 / 12) * 24 * 60 * 60 * 1000;

export function reviewKpis(posts: { checkpointAt: string }[]): ReviewKpis {
  const perDay = new Map<string, number>();
  let first = Infinity;
  let last = -Infinity;
  for (const p of posts) {
    const d = parseTime(p.checkpointAt);
    if (!d) continue;
    const t = d.getTime();
    if (t < first) first = t;
    if (t > last) last = t;
    const key = dayKey(p.checkpointAt)!;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const spanMonths =
    first <= last ? Math.max(1, (last - first) / MS_PER_MONTH) : 1;
  // 同数の日があれば新しい日を採る
  let busiestDay: ReviewKpis["busiestDay"] = null;
  for (const [day, count] of perDay) {
    if (
      !busiestDay ||
      count > busiestDay.count ||
      (count === busiestDay.count && day > busiestDay.day)
    ) {
      busiestDay = { day, count };
    }
  }
  return {
    count: posts.length,
    activeDays: perDay.size,
    perMonth: posts.length === 0 ? null : posts.length / spanMonths,
    spanMonths,
    busiestDay,
  };
}

// ─── select の分布 ────────────────────────────────────────────

export interface OptionShare {
  optionId: string;
  label: string;
  archived: boolean;
  count: number;
  /** count / total (0..1)。total 0 なら 0 */
  share: number;
}

/**
 * select 項目の分布。countSelectOptions を件数降順 (同数は options 順) に並べ替え、
 * share の分母は posts.length (未設定を含む)。unset は別に返す。
 * count 0 の選択肢は含めない。multiple は延べ数。
 */
export function optionShares(
  posts: HasFieldValues[],
  def: FieldDef,
): { total: number; items: OptionShare[]; unset: number } {
  const total = posts.length;
  const counts = countSelectOptions(posts, def);
  const options = new Map((def.options ?? []).map((o) => [o.id, o]));
  let unset = 0;
  const items: OptionShare[] = [];
  for (const { optionId, count } of counts) {
    if (optionId === FIELD_UNSET) {
      unset = count;
      continue;
    }
    if (count === 0) continue;
    const option = options.get(optionId);
    items.push({
      optionId,
      label: option?.label ?? optionId,
      archived: Boolean(option?.archived),
      count,
      share: total === 0 ? 0 : count / total,
    });
  }
  // Array.prototype.sort は安定なので、同数は options 順のまま
  items.sort((a, b) => b.count - a.count);
  return { total, items, unset };
}

// ─── number / duration ───────────────────────────────────────

export interface NumericCard extends NumericSummary {
  /** 時系列 (checkpointAt 昇順)。推移グラフ (5c) 用。不正な日付の投稿は含めない */
  series: { at: string; value: number }[];
}

/** number / duration 共通。それ以外の型は count 0 */
export function numericCard(posts: PostLike[], def: FieldDef): NumericCard {
  const summarize =
    def.type === "number"
      ? summarizeNumber
      : def.type === "duration"
        ? summarizeDuration
        : null;
  if (!summarize) {
    return { count: 0, sum: null, avg: null, min: null, max: null, series: [] };
  }
  // 1 件ずつ集計にかけ、値の検証 (不正な decimal の除外など) を summarize* と揃える
  const series: { at: string; value: number; t: number }[] = [];
  for (const post of posts) {
    const d = parseTime(post.checkpointAt);
    if (!d) continue;
    const one = summarize([post], def);
    if (one.count === 1 && one.sum !== null) {
      series.push({ at: post.checkpointAt, value: one.sum, t: d.getTime() });
    }
  }
  series.sort((a, b) => a.t - b.t);
  return {
    ...summarize(posts, def),
    series: series.map(({ at, value }) => ({ at, value })),
  };
}

/** number の丸め桁数 (scale 未設定は 1 桁) */
const DEFAULT_STAT_SCALE = 1;

/**
 * number は scale 桁で丸め (scale 未設定は 1 桁。末尾の 0 は付けない)、
 * duration は秒に丸めて formatDuration。null は "—"
 */
export function formatStat(value: number | null, def: FieldDef): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (def.type === "duration") return formatDuration(Math.round(value));
  const scale = Math.max(0, Math.floor(def.scale ?? DEFAULT_STAT_SCALE));
  const rounded = Number(value.toFixed(scale));
  // -0 を "0" にする
  return String(rounded === 0 ? 0 : rounded);
}

// ─── グラフ (5c) ─────────────────────────────────────────────
// 仕様は docs/record-mode.md §7.3。座標はすべて SVG のユーザー単位 (px)。

/** from の月から to の月まで "YYYY-MM" を昇順で (両端含む)。from > to なら [] */
export function monthKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let y = from.getFullYear();
  let m = from.getMonth();
  const endY = to.getFullYear();
  const endM = to.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${pad2(m + 1)}`);
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
  return keys;
}

export type MonthlyMetric =
  | { kind: "count" }
  /** number / duration 項目 */
  | { kind: "sum" | "avg"; fieldId: string };

/** count は 0、sum/avg は値が無い月は null */
export interface MonthlyPoint {
  month: string;
  value: number | null;
}

/**
 * 月別の系列。範囲は period が all なら 最初の投稿の月〜now の月、
 * それ以外は periodRange の月 (from の月〜to の直前の月)。期間内の投稿が 0 件なら []
 */
export function monthlySeries(
  posts: PostLike[],
  defs: FieldDef[],
  metric: MonthlyMetric,
  key: PeriodKey,
  now: Date,
): MonthlyPoint[] {
  const inPeriod = filterByPeriod(posts, key, now).filter(
    (p) => parseTime(p.checkpointAt) !== null,
  );
  if (inPeriod.length === 0) return [];

  let from: Date;
  let to: Date;
  if (key === "all") {
    let first = Infinity;
    for (const p of inPeriod) {
      first = Math.min(first, parseTime(p.checkpointAt)!.getTime());
    }
    from = new Date(first);
    to = now;
  } else {
    const range = periodRange(key, now);
    from = range.from!;
    // to は排他なので 1ms 前の月まで
    to = new Date(range.to!.getTime() - 1);
  }

  const byMonth = new Map<string, PostLike[]>();
  for (const p of inPeriod) {
    const k = monthKey(p.checkpointAt)!;
    const list = byMonth.get(k);
    if (list) list.push(p);
    else byMonth.set(k, [p]);
  }

  const def =
    metric.kind === "count"
      ? undefined
      : defs.find((d) => d.id === metric.fieldId);
  const summarize =
    def?.type === "number"
      ? summarizeNumber
      : def?.type === "duration"
        ? summarizeDuration
        : null;
  return monthKeysBetween(from, to).map((month): MonthlyPoint => {
    const list = byMonth.get(month) ?? [];
    if (metric.kind === "count") return { month, value: list.length };
    if (!summarize || !def || list.length === 0) return { month, value: null };
    const s = summarize(list, def);
    return { month, value: metric.kind === "sum" ? s.sum : s.avg };
  });
}

/** 棒グラフの座標。values の null は 0 高さ。top は最大値を 5 の倍数に切り上げ (最小 5) */
export interface BarLayout {
  width: number;
  height: number;
  top: number;
  bars: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    value: number | null;
  }[];
  gridlines: { y: number; value: number }[];
}

/** 棒の上の値ラベルが切れないよう、プロット領域の上に空ける高さ */
const BAR_PAD_TOP = 16;
/** 目盛りは 0 から top までを 5 等分 */
const BAR_GRID_STEPS = 5;

export function barLayout(
  points: MonthlyPoint[],
  opts: {
    barWidth?: number;
    gap?: number;
    height?: number;
    padLeft?: number;
    padBottom?: number;
  } = {},
): BarLayout {
  const {
    barWidth = 26,
    gap = 18,
    height = 170,
    padLeft = 26,
    padBottom = 22,
  } = opts;
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  const top = Math.max(5, Math.ceil(max / 5) * 5);
  const plotH = Math.max(0, height - padBottom - BAR_PAD_TOP);
  const base = BAR_PAD_TOP + plotH;
  const bars = points.map((p, i) => {
    // 負の値は 0 高さ (棒は下に伸ばさない)
    const v = p.value === null ? 0 : Math.max(0, p.value);
    const h = (plotH * v) / top;
    return {
      x: padLeft + i * (barWidth + gap) + gap / 2,
      y: base - h,
      w: barWidth,
      h,
      label: `${Number(p.month.slice(5))}月`,
      value: p.value,
    };
  });
  const gridlines: BarLayout["gridlines"] = [];
  for (let i = 0; i <= BAR_GRID_STEPS; i++) {
    const value = (top * i) / BAR_GRID_STEPS;
    gridlines.push({ y: base - (plotH * value) / top, value });
  }
  return {
    width: points.length * (barWidth + gap) + padLeft,
    height,
    top,
    bars,
    gridlines,
  };
}

/** 折れ線 (等間隔 x)。最新 limit 件。1 件なら点だけ */
export interface SparklineLayout {
  d: string;
  area: string;
  last: { x: number; y: number } | null;
  min: number;
  max: number;
}

/** 線の太さ・末尾の点が端で切れないよう、上下左右に空ける幅 */
const SPARK_PAD = 4;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sparklineLayout(
  values: number[],
  opts: { width: number; height: number; limit?: number },
): SparklineLayout {
  const { width, height, limit = 30 } = opts;
  const vs = values.slice(-limit);
  if (vs.length === 0) return { d: "", area: "", last: null, min: 0, max: 0 };
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const innerW = Math.max(0, width - SPARK_PAD * 2);
  const innerH = Math.max(0, height - SPARK_PAD * 2);
  // 同値のみなら中央に寝かせる (0 除算しない)
  const y = (v: number) =>
    max === min
      ? height / 2
      : SPARK_PAD + (1 - (v - min) / (max - min)) * innerH;
  if (vs.length === 1) {
    const p = { x: width / 2, y: y(vs[0]) };
    return { d: `M${round2(p.x)} ${round2(p.y)}`, area: "", last: p, min, max };
  }
  const pts = vs.map((v, i) => ({
    x: SPARK_PAD + (innerW * i) / (vs.length - 1),
    y: y(v),
  }));
  const d = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${round2(p.x)} ${round2(p.y)}`)
    .join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area = `${d} L${round2(last.x)} ${height} L${round2(first.x)} ${height} Z`;
  return { d, area, last, min, max };
}

/** week は左から 0..weeks-1、dow は 0 = 日曜 .. 6 = 土曜 */
export interface HeatmapCell {
  day: string;
  count: number;
  week: number;
  dow: number;
}

/** ヒートマップの週数の既定。期間チップに依らず直近 26 週 (§8 D-3) */
export const HEATMAP_WEEKS = 26;

/**
 * 直近 weeks 週 (今日を含む週の土曜まで)。日曜始まり。ローカル時刻。
 * monthLabels は各月の最初の週 (日曜がその月の 1〜7 日の週) に 1 つ
 */
export function heatmapCells(
  posts: { checkpointAt: string }[],
  now: Date,
  weeks: number = HEATMAP_WEEKS,
): { cells: HeatmapCell[]; monthLabels: { week: number; label: string }[] } {
  const perDay = new Map<string, number>();
  for (const p of posts) {
    const k = dayKey(p.checkpointAt);
    if (k) perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  // 先頭の日曜からの日数で Date(y, m, d) を作る (夏時間のある TZ でも日がずれない)
  const y = now.getFullYear();
  const m = now.getMonth();
  const startDate = now.getDate() - now.getDay() - (weeks - 1) * 7;
  const cells: HeatmapCell[] = [];
  const monthLabels: { week: number; label: string }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(y, m, startDate + i);
    const day = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const week = Math.floor(i / 7);
    const dow = i % 7;
    cells.push({ day, count: perDay.get(day) ?? 0, week, dow });
    if (dow === 0 && d.getDate() <= 7) {
      monthLabels.push({ week, label: `${d.getMonth() + 1}月` });
    }
  }
  return { cells, monthLabels };
}

/** 0 / 1 / 2 / 3+ の 4 段階 */
export function heatLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}
