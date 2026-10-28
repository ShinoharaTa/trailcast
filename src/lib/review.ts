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
