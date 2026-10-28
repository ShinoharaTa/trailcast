"use client";

import { useMemo, useState } from "react";
import type { FieldDef, PostWithMeta, ThreadWithMeta } from "@/lib/types";
import { FIELD_UNSET, type FieldSelection } from "@/lib/fields";
import {
  HEATMAP_WEEKS,
  availablePeriods,
  barLayout,
  dayLabel,
  filterByPeriod,
  formatStat,
  heatmapCells,
  monthlySeries,
  numericCard,
  optionShares,
  reviewKpis,
  sparklineLayout,
  spansMultipleYears,
  type MonthlyMetric,
  type PeriodKey,
} from "@/lib/review";
import { Heatmap, MonthlyBars, Sparkline } from "@/components/record/charts";

/** thread.fields が無いときの defs。毎 render で新しい配列を作らず参照を固定する */
const NO_FIELDS: FieldDef[] = [];

/** select の分布で最初に出す選択肢の数。残りは「ほか n 件を表示」で開く */
const TOP_OPTIONS = 8;

/** 推移グラフに出す最新の件数 */
const SPARK_LIMIT = 30;
/** 推移グラフの高さと、座標計算に使う幅 (表示は容器いっぱいに引き伸ばす) */
const SPARK_HEIGHT = 90;
const SPARK_WIDTH = 320;
/** 月別の目盛りラベル 1 文字あたりの幅の目安 (mono 10px) */
const TICK_CHAR_WIDTH = 6.5;
const BAR_PAD_LEFT = 26;

/** 整数 %。0 より大きく 1% 未満は "<1%" (0% と見分ける) */
function percent(share: number): string {
  if (share > 0 && share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
}

/** select の分布・数値のカードを出す項目。text は出さない。archived は値が 1 件以上あるときだけ */
function reviewFields(posts: PostWithMeta[], defs: FieldDef[]): FieldDef[] {
  return defs.filter((def) => {
    if (def.type === "text") return false;
    if (!def.archived) return true;
    if (def.type === "select") return optionShares(posts, def).items.length > 0;
    return numericCard(posts, def).count > 0;
  });
}

/**
 * ふりかえりパネル。仕様は docs/record-mode.md §6.3 / §7.4。
 *
 * - 期間は このパネルの中だけの state (記録帳と共有しない)
 * - 分布の棒を押すと、その選択肢だけで絞った記録帳へ移る (期間は持ち越さない)
 */
export function RecordReview({
  posts,
  thread,
  onJumpToLog,
}: {
  /** 絞り込み前の全投稿 (並び順は問わない) */
  posts: PostWithMeta[];
  thread: ThreadWithMeta;
  onJumpToLog: (next: { fields: FieldSelection }) => void;
}) {
  const defs = thread.fields ?? NO_FIELDS;
  const [periodKey, setPeriodKey] = useState<PeriodKey>("all");
  // 期間の基準時刻。開いている間に「直近」の範囲がずれないよう、マウント時に固定する
  const [now] = useState(() => new Date());

  const periods = useMemo(() => availablePeriods(posts, now), [posts, now]);
  // 投稿の削除などで選んでいた年が消えたら全期間に戻す
  const activeKey = periods.some((p) => p.key === periodKey)
    ? periodKey
    : "all";
  const inPeriod = useMemo(
    () => filterByPeriod(posts, activeKey, now),
    [posts, activeKey, now],
  );
  const kpis = useMemo(() => reviewKpis(inPeriod), [inPeriod]);
  const fields = useMemo(() => reviewFields(posts, defs), [posts, defs]);
  const heatmap = useMemo(() => heatmapCells(posts, now), [posts, now]);

  return (
    <div>
      <div
        role="group"
        aria-label="期間"
        className="mb-4 flex flex-wrap gap-2 md:gap-1.5"
      >
        {periods.map((p) => {
          const active = p.key === activeKey;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => setPeriodKey(p.key)}
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition md:px-3 md:py-1 md:text-xs ${
                active
                  ? "bg-indigo-500 text-white shadow-sm shadow-indigo-900/40"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
        <Kpi value={String(kpis.count)} unit="件" label="記録" />
        <Kpi value={String(kpis.activeDays)} unit="日" label="活動日" />
        <Kpi
          value={kpis.perMonth === null ? "—" : kpis.perMonth.toFixed(1)}
          unit={kpis.perMonth === null ? undefined : "/月"}
          label="月あたり"
        />
        <Kpi
          value={kpis.busiestDay ? String(kpis.busiestDay.count) : "—"}
          unit={kpis.busiestDay ? "件" : undefined}
          label="1 日最多"
          sub={
            kpis.busiestDay
              ? dayLabel(kpis.busiestDay.day, spansMultipleYears(inPeriod))
              : undefined
          }
        />
      </div>

      <MonthlySection
        posts={posts}
        defs={defs}
        fields={fields}
        periodKey={activeKey}
        now={now}
      />

      <section className="mt-7">
        <SectionHeading
          title="活動した日"
          note={`直近 ${HEATMAP_WEEKS} 週`}
        />
        <Heatmap
          cells={heatmap.cells}
          monthLabels={heatmap.monthLabels}
          weeks={HEATMAP_WEEKS}
        />
      </section>

      {fields.map((def) =>
        def.type === "select" ? (
          <SelectSection
            key={def.id}
            def={def}
            posts={inPeriod}
            onJump={(optionId) =>
              onJumpToLog({ fields: { [def.id]: [optionId] } })
            }
          />
        ) : (
          <NumericSection key={def.id} def={def} posts={inPeriod} />
        ),
      )}
    </div>
  );
}

function Kpi({
  value,
  unit,
  label,
  sub,
}: {
  value: string;
  unit?: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="bg-surface-900 p-3.5">
      <div className="font-mono text-2xl font-bold leading-tight tracking-tight text-white tabular-nums">
        {value}
        {unit && (
          <small className="ml-0.5 text-[13px] font-medium text-white/40">
            {unit}
          </small>
        )}
      </div>
      <div className="mt-1 text-[11px] text-white/40">
        {label}
        {sub && (
          <span className="ml-1.5 font-mono tabular-nums text-white/50">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <h2 className="mb-2.5 flex items-baseline justify-between gap-2 text-[13px] font-bold tracking-wider text-white/70">
      <span className="min-w-0 truncate">{title}</span>
      {note && (
        <small className="shrink-0 text-[11px] font-medium tracking-normal text-white/40">
          {note}
        </small>
      )}
    </h2>
  );
}

function SelectSection({
  def,
  posts,
  onJump,
}: {
  def: FieldDef;
  posts: PostWithMeta[];
  onJump: (optionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { items, unset, total } = useMemo(
    () => optionShares(posts, def),
    [posts, def],
  );
  const max = Math.max(1, unset, ...items.map((i) => i.count));
  const shown = expanded ? items : items.slice(0, TOP_OPTIONS);
  const hidden = items.length - shown.length;
  // 単一選択でも 1 件が複数の選択肢に数えられていれば延べ数 (割合の合計が 100% を超える)
  const overCounted =
    items.reduce((sum, i) => sum + i.count, 0) + unset > total;

  const bar = (
    key: string,
    label: string,
    count: number,
    opts: { dim?: boolean; unset?: boolean; title?: string },
  ) => (
    <li key={key}>
      <button
        type="button"
        onClick={() => onJump(key)}
        title={opts.title}
        className="group grid w-full grid-cols-[96px_1fr_72px] items-center gap-2.5 text-left text-xs"
      >
        <span
          className={`truncate transition group-hover:text-white ${
            opts.dim ? "text-white/40" : "text-white/70"
          }`}
        >
          {label}
        </span>
        <span
          className={`flex h-2.5 overflow-hidden rounded-full ${
            opts.unset ? "border border-dashed border-white/20" : "bg-white/5"
          }`}
        >
          <span
            className={`rounded-full ${
              opts.unset ? "bg-white/15" : "bg-indigo-400"
            }`}
            style={{ width: `${(count / max) * 100}%` }}
          />
        </span>
        <span className="text-right font-mono text-[11px] tabular-nums text-white/40">
          {count}件 {percent(total === 0 ? 0 : count / total)}
        </span>
      </button>
    </li>
  );

  return (
    <section className="mt-7">
      <SectionHeading
        title={def.label}
        note={
          def.multiple ? "複数選択は延べ数" : overCounted ? "延べ数" : undefined
        }
      />
      {items.length === 0 && unset === 0 ? (
        <p className="text-xs text-white/30">この期間の記録はありません</p>
      ) : (
        <ul className="grid gap-2">
          {shown.map((i) =>
            bar(i.optionId, i.label, i.count, {
              dim: i.archived,
              title: i.archived ? "入力画面では非表示の選択肢" : undefined,
            }),
          )}
          {hidden > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded px-1 py-0.5 text-xs text-indigo-300 transition hover:text-indigo-200"
              >
                ほか {hidden} 件を表示
              </button>
            </li>
          )}
          {unset > 0 && bar(FIELD_UNSET, "未設定", unset, { unset: true })}
        </ul>
      )}
    </section>
  );
}

function NumericSection({
  def,
  posts,
}: {
  def: FieldDef;
  posts: PostWithMeta[];
}) {
  const card = useMemo(() => numericCard(posts, def), [posts, def]);
  // 1 件以下なら描かない
  const spark = useMemo(
    () =>
      card.series.length > 1
        ? sparklineLayout(
            card.series.map((s) => s.value),
            { width: SPARK_WIDTH, height: SPARK_HEIGHT, limit: SPARK_LIMIT },
          )
        : null,
    [card],
  );
  const duration = def.type === "duration";
  const title = def.unit ? `${def.label}（${def.unit}）` : def.label;
  const rows: { label: string; value: string }[] = [
    { label: "件数", value: `${card.count}件` },
    { label: "合計", value: formatStat(card.sum, def) },
    { label: "平均", value: formatStat(card.avg, def) },
    { label: duration ? "最長" : "最大", value: formatStat(card.max, def) },
    { label: duration ? "最速" : "最小", value: formatStat(card.min, def) },
  ];

  return (
    <section className="mt-7">
      <SectionHeading title={title} />
      {card.count === 0 ? (
        <p className="text-xs text-white/30">この期間の記録はありません</p>
      ) : (
        // スマホ幅 (3 列) は 2 行目に空きマスが出るので、区切り線を容器の背景ではなく
        // セルの枠線で引き、空きマスはセルと同じ背景にする。sm 以上は 1 行で従来どおり
        <dl className="grid grid-cols-3 overflow-hidden rounded-xl border border-white/10 bg-surface-900 sm:grid-cols-5 sm:gap-px sm:bg-white/10">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`min-w-0 border-white/10 bg-surface-900 px-2 py-2.5 sm:border-0 ${
                i < 3 ? "border-b" : ""
              } ${i % 3 !== 2 && i + 1 < rows.length ? "border-r" : ""}`}
            >
              <dt className="text-[10.5px] text-white/40">{r.label}</dt>
              <dd
                title={r.value}
                className="mt-0.5 truncate font-mono text-[13px] font-bold tabular-nums text-white sm:text-sm"
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {spark && (
        <Sparkline
          layout={spark}
          width={SPARK_WIDTH}
          height={SPARK_HEIGHT}
          count={Math.min(card.series.length, SPARK_LIMIT)}
          label={`${def.label}の推移`}
        />
      )}
    </section>
  );
}

/** 指標セレクトの値。"count" / "sum:<fieldId>" / "avg:<fieldId>" */
type MetricValue = "count" | `${"sum" | "avg"}:${string}`;

function parseMetric(value: MetricValue): MonthlyMetric {
  if (value === "count") return { kind: "count" };
  const i = value.indexOf(":");
  return {
    kind: value.slice(0, i) as "sum" | "avg",
    fieldId: value.slice(i + 1),
  };
}

function MonthlySection({
  posts,
  defs,
  fields,
  periodKey,
  now,
}: {
  posts: PostWithMeta[];
  defs: FieldDef[];
  /** ふりかえりに出す項目 (この中の number / duration を指標に出す) */
  fields: FieldDef[];
  periodKey: PeriodKey;
  now: Date;
}) {
  const numericFields = useMemo(
    () => fields.filter((f) => f.type === "number" || f.type === "duration"),
    [fields],
  );
  const options = useMemo(
    () => [
      { value: "count" as MetricValue, label: "件数" },
      ...numericFields.flatMap((f) => [
        { value: `sum:${f.id}` as MetricValue, label: `${f.label} 合計` },
        { value: `avg:${f.id}` as MetricValue, label: `${f.label} 平均` },
      ]),
    ],
    [numericFields],
  );
  const [selected, setSelected] = useState<MetricValue>("count");
  // 項目が消えたら件数に戻す
  const metricValue = options.some((o) => o.value === selected)
    ? selected
    : "count";
  const metric = parseMetric(metricValue);
  const def =
    metric.kind === "count"
      ? undefined
      : numericFields.find((f) => f.id === metric.fieldId);
  const metricLabel =
    options.find((o) => o.value === metricValue)?.label ?? "件数";

  const points = useMemo(
    () => monthlySeries(posts, defs, parseMetric(metricValue), periodKey, now),
    [posts, defs, metricValue, periodKey, now],
  );
  const formatValue = (v: number) =>
    def ? formatStat(v, def) : String(Math.round(v));
  const layout = useMemo(() => {
    const first = barLayout(points, { padLeft: BAR_PAD_LEFT });
    // 目盛りのラベル (duration の "1:00:00" など) が収まるよう左の余白を広げる
    const longest = Math.max(
      ...first.gridlines.map((g) =>
        (def ? formatStat(g.value, def) : String(g.value)).length,
      ),
    );
    const padLeft = Math.max(
      BAR_PAD_LEFT,
      Math.ceil(longest * TICK_CHAR_WIDTH + 8),
    );
    return padLeft === BAR_PAD_LEFT
      ? { layout: first, padLeft }
      : { layout: barLayout(points, { padLeft }), padLeft };
  }, [points, def]);

  return (
    <section className="mt-7">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-[13px] font-bold tracking-wider text-white/70">
          月ごとの記録
        </h2>
        {options.length > 1 && (
          <select
            aria-label="月ごとの記録の指標"
            value={metricValue}
            onChange={(e) => setSelected(e.target.value as MetricValue)}
            className="max-w-[55%] shrink-0 truncate rounded-lg border border-white/10 bg-surface-900 px-2 py-1 text-xs text-white/70 focus:border-indigo-400 focus:outline-none"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {points.length === 0 ? (
        <p className="text-xs text-white/30">この期間の記録はありません</p>
      ) : (
        <MonthlyBars
          layout={layout.layout}
          padLeft={layout.padLeft}
          formatValue={formatValue}
          formatTitle={(i) => {
            const p = points[i];
            const [y, m] = p.month.split("-");
            const value =
              p.value === null
                ? "記録なし"
                : def
                  ? formatStat(p.value, def)
                  : `${p.value}件`;
            return `${y}年${Number(m)}月 ${metricLabel} ${value}`;
          }}
          label={`月ごとの記録 (${metricLabel})`}
          periodKey={periodKey}
        />
      )}
    </section>
  );
}
