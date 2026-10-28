import { describe, expect, it } from "vitest";
import { FIELD_UNSET, fieldFilterGroups } from "@/lib/fields";
import type { PostLike } from "@/lib/record";
import {
  availablePeriods,
  barLayout,
  dayKey,
  dayLabel,
  filterByPeriod,
  formatStat,
  heatLevel,
  heatmapCells,
  monthKey,
  monthKeysBetween,
  monthlySeries,
  numericCard,
  optionShares,
  periodRange,
  reviewKpis,
  sparklineLayout,
  spansMultipleYears,
} from "@/lib/review";
import type { FieldDef, FieldValue } from "@/lib/types";

const select = (field: string, options: string[]): FieldValue => ({
  $type: "net.shino3.trailcast.post#selectValue",
  field,
  options,
});
const num = (field: string, value: string): FieldValue => ({
  $type: "net.shino3.trailcast.post#numberValue",
  field,
  value,
});
const dur = (field: string, seconds: number): FieldValue => ({
  $type: "net.shino3.trailcast.post#durationValue",
  field,
  seconds,
});

const at = (checkpointAt: string, p: Partial<PostLike> = {}): PostLike => ({
  checkpointAt,
  ...p,
});

const now = new Date("2026-10-28T12:00:00+09:00");

describe("periodRange / filterByPeriod", () => {
  it("all は両端 null で、同じ参照を返す", () => {
    expect(periodRange("all", now)).toEqual({ from: null, to: null });
    const posts = [at("2020-01-01T00:00:00+09:00"), at("not a date")];
    expect(filterByPeriod(posts, "all", now)).toBe(posts);
  });

  it("3m はちょうど 3 か月前を含み、now と未来の投稿も含む", () => {
    const { from, to } = periodRange("3m", now);
    expect(from?.getTime()).toBe(
      new Date("2026-07-28T12:00:00+09:00").getTime(),
    );
    expect(to).toBeNull();
    const posts = [
      at("2026-07-28T11:59:59.999+09:00"),
      at("2026-07-28T12:00:00+09:00"),
      at("2026-10-28T12:00:00+09:00"),
      at("2026-10-28T12:00:00.001+09:00"),
      at("2027-01-01T00:00:00+09:00"),
    ];
    expect(filterByPeriod(posts, "3m", now)).toEqual([
      posts[1],
      posts[2],
      posts[3],
      posts[4],
    ]);
  });

  it("3m は前の月に同じ日が無ければ末日に寄せる", () => {
    const end = new Date("2026-05-31T10:00:00+09:00");
    expect(periodRange("3m", end).from?.getTime()).toBe(
      new Date("2026-02-28T10:00:00+09:00").getTime(),
    );
  });

  it("1y は 1 年前の同時刻から、終わりは無し", () => {
    expect(periodRange("1y", now).from?.getTime()).toBe(
      new Date("2025-10-28T12:00:00+09:00").getTime(),
    );
    expect(periodRange("1y", now).to).toBeNull();
  });

  it("y:2025 は 1/1 00:00 から 12/31 23:59:59 まで", () => {
    const posts = [
      at("2024-12-31T23:59:59+09:00"),
      at("2025-01-01T00:00:00+09:00"),
      at("2025-12-31T23:59:59+09:00"),
      at("2026-01-01T00:00:00+09:00"),
    ];
    expect(filterByPeriod(posts, "y:2025", now)).toEqual([posts[1], posts[2]]);
  });

  it("y:50 は 1950 年ではなく 50 年", () => {
    const posts = [
      at("0050-06-01T00:00:00+09:00"),
      at("1950-06-01T00:00:00+09:00"),
    ];
    expect(filterByPeriod(posts, "y:50", now)).toEqual([posts[0]]);
    const { from, to } = periodRange("y:50", now);
    expect(from?.getFullYear()).toBe(50);
    expect(to?.getFullYear()).toBe(51);
  });

  it("all 以外では不正な日付を除く", () => {
    const posts = [at("not a date"), at("2026-10-01T00:00:00+09:00")];
    expect(filterByPeriod(posts, "3m", now)).toEqual([posts[1]]);
    expect(filterByPeriod(posts, "y:2026", now)).toEqual([posts[1]]);
  });
});

describe("availablePeriods", () => {
  it("投稿 0 件なら固定 3 つだけ", () => {
    expect(availablePeriods([], now).map((p) => p.key)).toEqual([
      "all",
      "3m",
      "1y",
    ]);
  });

  it("投稿のある年を新しい順に足す", () => {
    const posts = [
      at("2024-03-01T00:00:00+09:00"),
      at("2026-01-01T00:00:00+09:00"),
      at("2024-05-01T00:00:00+09:00"),
      at("not a date"),
    ];
    expect(availablePeriods(posts, now)).toEqual([
      { key: "all", label: "全期間" },
      { key: "3m", label: "直近3か月" },
      { key: "1y", label: "直近1年" },
      { key: "y:2026", label: "2026年" },
      { key: "y:2024", label: "2024年" },
    ]);
  });

  it("年は最大 5 つ (新しい側を残す)", () => {
    const posts = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) =>
      at(`${y}-06-01T00:00:00+09:00`),
    );
    expect(availablePeriods(posts, now).map((p) => p.key)).toEqual([
      "all",
      "3m",
      "1y",
      "y:2025",
      "y:2024",
      "y:2023",
      "y:2022",
      "y:2021",
    ]);
  });

  it("年の境目はローカル時刻 (JST の 1/1 00:30 は UTC では前年)", () => {
    const keys = availablePeriods([at("2026-01-01T00:30:00+09:00")], now).map(
      (p) => p.key,
    );
    expect(keys).toContain("y:2026");
    expect(keys).not.toContain("y:2025");
  });
});

describe("dayKey / monthKey", () => {
  it("JST の日付で切る (UTC では日が変わるケース)", () => {
    expect(dayKey("2026-06-30T23:30:00+09:00")).toBe("2026-06-30");
    expect(dayKey("2026-06-30T23:30:00Z")).toBe("2026-07-01");
    expect(dayKey("2026-07-01T00:30:00+09:00")).toBe("2026-07-01");
    expect(monthKey("2026-06-30T23:30:00+09:00")).toBe("2026-06");
    expect(monthKey("2026-06-30T23:30:00Z")).toBe("2026-07");
  });

  it("不正な日付は null", () => {
    expect(dayKey("not a date")).toBeNull();
    expect(monthKey("")).toBeNull();
  });
});

describe("spansMultipleYears / dayLabel", () => {
  it("単年なら M/D、複数年にまたがれば YYYY/M/D", () => {
    const single = [
      at("2026-01-01T00:30:00+09:00"),
      at("2026-12-31T23:30:00+09:00"),
      at("not a date"),
    ];
    const multi = [
      at("2025-12-31T23:30:00+09:00"),
      at("2026-01-01T00:30:00+09:00"),
    ];
    expect(spansMultipleYears(single)).toBe(false);
    expect(spansMultipleYears(multi)).toBe(true);
    expect(spansMultipleYears([])).toBe(false);
    expect(dayLabel("2026-06-03", spansMultipleYears(single))).toBe("6/3");
    expect(dayLabel("2026-06-03", spansMultipleYears(multi))).toBe("2026/6/3");
  });
});

describe("reviewKpis", () => {
  it("同じ日の 3 件は活動日 1、1 日最多 3", () => {
    const kpis = reviewKpis([
      at("2026-06-30T09:00:00+09:00"),
      at("2026-06-30T12:00:00+09:00"),
      at("2026-06-30T23:30:00+09:00"),
    ]);
    expect(kpis.count).toBe(3);
    expect(kpis.activeDays).toBe(1);
    expect(kpis.busiestDay).toEqual({ day: "2026-06-30", count: 3 });
    expect(kpis.spanMonths).toBe(1);
    expect(kpis.perMonth).toBe(3);
  });

  it("1 件だけなら spanMonths 1、perMonth 1", () => {
    const kpis = reviewKpis([at("2026-06-30T09:00:00+09:00")]);
    expect(kpis.spanMonths).toBe(1);
    expect(kpis.perMonth).toBe(1);
    expect(kpis.busiestDay).toEqual({ day: "2026-06-30", count: 1 });
  });

  it("0 件なら perMonth / busiestDay は null", () => {
    expect(reviewKpis([])).toEqual({
      count: 0,
      activeDays: 0,
      perMonth: null,
      spanMonths: 1,
      busiestDay: null,
    });
  });

  it("期間は最初〜最後の投稿の月数 (小数)", () => {
    const kpis = reviewKpis([
      at("2025-10-28T00:00:00+09:00"),
      at("2026-04-28T12:00:00+09:00"),
      at("2026-10-28T00:00:00+09:00"),
    ]);
    expect(kpis.spanMonths).toBeCloseTo(12, 1);
    expect(kpis.perMonth).toBeCloseTo(0.25, 2);
    expect(kpis.activeDays).toBe(3);
  });

  it("1 日最多が同数なら新しい日", () => {
    const kpis = reviewKpis([
      at("2026-06-01T09:00:00+09:00"),
      at("2026-06-03T09:00:00+09:00"),
      at("2026-06-02T09:00:00+09:00"),
    ]);
    expect(kpis.busiestDay).toEqual({ day: "2026-06-03", count: 1 });
  });

  it("不正な日付は件数には数え、日には数えない", () => {
    const kpis = reviewKpis([at("not a date"), at("2026-06-01T09:00:00+09:00")]);
    expect(kpis.count).toBe(2);
    expect(kpis.activeDays).toBe(1);
  });
});

describe("optionShares", () => {
  const kind: FieldDef = {
    id: "kind",
    label: "種類",
    type: "select",
    options: [
      { id: "hall", label: "ホール" },
      { id: "room", label: "ルーム" },
      { id: "web", label: "ウェブ" },
      { id: "old", label: "旧", archived: true },
    ],
  };

  it("件数降順、同数は options 順。分母は未設定を含む。0 件は含めない", () => {
    const posts = [
      at("", { fields: [select("kind", ["web"])] }),
      at("", { fields: [select("kind", ["room"])] }),
      at("", { fields: [select("kind", ["web"])] }),
      at("", { fields: [select("kind", ["old"])] }),
      at("", { fields: [] }),
    ];
    const r = optionShares(posts, kind);
    expect(r.total).toBe(5);
    expect(r.unset).toBe(1);
    expect(r.items).toEqual([
      { optionId: "web", label: "ウェブ", archived: false, count: 2, share: 0.4 },
      { optionId: "room", label: "ルーム", archived: false, count: 1, share: 0.2 },
      { optionId: "old", label: "旧", archived: true, count: 1, share: 0.2 },
    ]);
    expect(r.items.some((i) => i.optionId === FIELD_UNSET)).toBe(false);
  });

  it("multiple は延べ数 (share の合計が 1 を超えうる)", () => {
    const tags: FieldDef = { ...kind, multiple: true };
    const posts = [
      at("", { fields: [select("kind", ["hall", "room"])] }),
      at("", { fields: [select("kind", ["hall"])] }),
    ];
    const r = optionShares(posts, tags);
    expect(r.items.map((i) => [i.optionId, i.count, i.share])).toEqual([
      ["hall", 2, 1],
      ["room", 1, 0.5],
    ]);
    expect(r.unset).toBe(0);
  });

  it("fields を持たない旧投稿はタグから数える", () => {
    const r = optionShares([at("", { tags: ["ホール"] })], kind);
    expect(r.items.map((i) => i.optionId)).toEqual(["hall"]);
  });

  it("投稿 0 件", () => {
    expect(optionShares([], kind)).toEqual({ total: 0, items: [], unset: 0 });
  });

  it("件数は絞り込みなしの記録帳のチップ (fieldFilterGroups) と一致する", () => {
    const posts = [
      at("", { fields: [select("kind", ["web"])] }),
      at("", { fields: [select("kind", ["room", "web"])] }),
      at("", { tags: ["ホール"] }),
      at("", { fields: [] }),
    ];
    const r = optionShares(posts, kind);
    const chips = fieldFilterGroups(posts, [kind], {}, [])[0].chips;
    const fromChips = Object.fromEntries(chips.map((c) => [c.optionId, c.count]));
    expect(Object.fromEntries(r.items.map((i) => [i.optionId, i.count]))).toEqual(
      Object.fromEntries(
        Object.entries(fromChips).filter(([id]) => id !== FIELD_UNSET),
      ),
    );
    expect(r.unset).toBe(fromChips[FIELD_UNSET]);
  });
});

describe("numericCard", () => {
  const distance: FieldDef = {
    id: "dist",
    label: "距離",
    type: "number",
    unit: "km",
    scale: 1,
  };
  const time: FieldDef = { id: "time", label: "タイム", type: "duration" };

  it("合計・平均・最大・最小と、checkpointAt 昇順の series", () => {
    const posts = [
      at("2026-06-02T09:00:00+09:00", { fields: [num("dist", "7")] }),
      at("2026-06-01T09:00:00+09:00", { fields: [num("dist", "12.5")] }),
      at("2026-06-03T09:00:00+09:00", { fields: [] }),
    ];
    const card = numericCard(posts, distance);
    expect(card).toMatchObject({ count: 2, sum: 19.5, avg: 9.75, min: 7, max: 12.5 });
    expect(card.series).toEqual([
      { at: "2026-06-01T09:00:00+09:00", value: 12.5 },
      { at: "2026-06-02T09:00:00+09:00", value: 7 },
    ]);
    expect(formatStat(card.sum, distance)).toBe("19.5");
    expect(formatStat(card.avg, distance)).toBe("9.8");
    expect(formatStat(card.max, distance)).toBe("12.5");
    expect(formatStat(card.min, distance)).toBe("7");
  });

  it("不正な decimal は除く", () => {
    const posts = [
      at("2026-06-01T09:00:00+09:00", { fields: [num("dist", "abc")] }),
      at("2026-06-02T09:00:00+09:00", { fields: [num("dist", "3")] }),
    ];
    const card = numericCard(posts, distance);
    expect(card.count).toBe(1);
    expect(card.series.map((s) => s.value)).toEqual([3]);
  });

  it("duration は秒で集計し、最速 = 最小", () => {
    const posts = [
      at("2026-06-01T09:00:00+09:00", { fields: [dur("time", 3725)] }),
      at("2026-06-02T09:00:00+09:00", { fields: [dur("time", 125)] }),
    ];
    const card = numericCard(posts, time);
    expect(card).toMatchObject({ count: 2, sum: 3850, min: 125, max: 3725 });
    expect(formatStat(card.min, time)).toBe("2:05");
    expect(formatStat(card.max, time)).toBe("1:02:05");
    expect(formatStat(card.avg, time)).toBe("32:05");
  });

  it("値が無ければ count 0、他は null", () => {
    const card = numericCard([at("2026-06-01T09:00:00+09:00")], distance);
    expect(card).toEqual({
      count: 0,
      sum: null,
      avg: null,
      min: null,
      max: null,
      series: [],
    });
  });

  it("series は不正な日付の投稿を含めない (集計には含める)", () => {
    const posts = [
      at("not a date", { fields: [num("dist", "1")] }),
      at("2026-06-01T09:00:00+09:00", { fields: [num("dist", "2")] }),
    ];
    const card = numericCard(posts, distance);
    expect(card.count).toBe(2);
    expect(card.series.map((s) => s.value)).toEqual([2]);
  });
});

describe("formatStat", () => {
  const n = (scale?: number): FieldDef => ({
    id: "n",
    label: "n",
    type: "number",
    scale,
  });

  it("scale 0 / 1 / 3、未設定は 1 桁", () => {
    expect(formatStat(9.75, n(0))).toBe("10");
    expect(formatStat(9.75, n(1))).toBe("9.8");
    expect(formatStat(1.23456, n(3))).toBe("1.235");
    expect(formatStat(9.75, n())).toBe("9.8");
    expect(formatStat(7, n(3))).toBe("7");
    expect(formatStat(-0.01, n(1))).toBe("0");
  });

  it("巨大・極小の値も指数表記にしない (末尾 0 なし)", () => {
    expect(formatStat(1e21, n(1))).toBe("1000000000000000000000");
    expect(formatStat(-2.5e22, n(0))).toBe("-25000000000000000000000");
    expect(formatStat(1.5e21, n(3))).toBe("1500000000000000000000");
    expect(formatStat(0.0000001, n(3))).toBe("0");
    expect(formatStat(0.001, n(3))).toBe("0.001");
    expect(formatStat(12345.6, n(1))).toBe("12345.6");
  });

  it("duration は m:ss / h:mm:ss", () => {
    const d: FieldDef = { id: "d", label: "d", type: "duration" };
    expect(formatStat(59, d)).toBe("0:59");
    expect(formatStat(3600, d)).toBe("1:00:00");
    expect(formatStat(90.6, d)).toBe("1:31");
  });

  it("null は —", () => {
    expect(formatStat(null, n(1))).toBe("—");
  });
});

describe("monthKeysBetween", () => {
  it("同月は 1 つ", () => {
    expect(
      monthKeysBetween(
        new Date("2026-06-01T00:00:00+09:00"),
        new Date("2026-06-30T23:59:59+09:00"),
      ),
    ).toEqual(["2026-06"]);
  });

  it("年跨ぎ", () => {
    expect(
      monthKeysBetween(
        new Date("2025-11-15T00:00:00+09:00"),
        new Date("2026-02-01T00:00:00+09:00"),
      ),
    ).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("逆順は []", () => {
    expect(
      monthKeysBetween(
        new Date("2026-06-01T00:00:00+09:00"),
        new Date("2026-05-31T23:59:59+09:00"),
      ),
    ).toEqual([]);
  });

  it("月は JST で決める (UTC では前月のケース)", () => {
    expect(
      monthKeysBetween(
        new Date("2026-07-01T00:30:00+09:00"),
        new Date("2026-07-01T00:30:00+09:00"),
      ),
    ).toEqual(["2026-07"]);
  });
});

describe("monthlySeries", () => {
  const distance: FieldDef = {
    id: "dist",
    label: "距離",
    type: "number",
    scale: 1,
  };
  const defs = [distance];
  const posts = [
    at("2026-07-10T09:00:00+09:00", { fields: [num("dist", "10")] }),
    at("2026-07-20T09:00:00+09:00", { fields: [num("dist", "5")] }),
    at("2026-07-31T23:30:00+09:00", { fields: [] }),
    at("2026-09-01T09:00:00+09:00", { fields: [num("dist", "3")] }),
    at("not a date", { fields: [num("dist", "100")] }),
  ];

  it("count は 0 埋めで、all の範囲は最初の投稿の月〜now の月", () => {
    expect(monthlySeries(posts, defs, { kind: "count" }, "all", now)).toEqual([
      { month: "2026-07", value: 3 },
      { month: "2026-08", value: 0 },
      { month: "2026-09", value: 1 },
      { month: "2026-10", value: 0 },
    ]);
  });

  it("sum は値の無い月が null", () => {
    expect(
      monthlySeries(posts, defs, { kind: "sum", fieldId: "dist" }, "all", now),
    ).toEqual([
      { month: "2026-07", value: 15 },
      { month: "2026-08", value: null },
      { month: "2026-09", value: 3 },
      { month: "2026-10", value: null },
    ]);
  });

  it("avg は値のある投稿だけで割る", () => {
    const s = monthlySeries(
      posts,
      defs,
      { kind: "avg", fieldId: "dist" },
      "all",
      now,
    );
    expect(s[0]).toEqual({ month: "2026-07", value: 7.5 });
  });

  it("3m の範囲は periodRange の月 (7/28〜10/28 → 7〜10 月)", () => {
    const s = monthlySeries(posts, defs, { kind: "count" }, "3m", now);
    expect(s).toEqual([
      { month: "2026-07", value: 1 },
      { month: "2026-08", value: 0 },
      { month: "2026-09", value: 1 },
      { month: "2026-10", value: 0 },
    ]);
  });

  it("3m / 1y で未来日時の投稿の月まで並べ、合計は期間内件数と一致", () => {
    const withFuture = [
      ...posts,
      at("2026-12-05T09:00:00+09:00"),
      at("2027-01-02T09:00:00+09:00"),
    ];
    for (const key of ["3m", "1y"] as const) {
      const s = monthlySeries(withFuture, defs, { kind: "count" }, key, now);
      expect(s.slice(-4)).toEqual([
        { month: "2026-10", value: 0 },
        { month: "2026-11", value: 0 },
        { month: "2026-12", value: 1 },
        { month: "2027-01", value: 1 },
      ]);
      const total = s.reduce((n, p) => n + (p.value ?? 0), 0);
      expect(total).toBe(filterByPeriod(withFuture, key, now).length);
    }
    const all = monthlySeries(withFuture, defs, { kind: "count" }, "all", now);
    expect(all.at(-1)).toEqual({ month: "2027-01", value: 1 });
    expect(all.reduce((n, p) => n + (p.value ?? 0), 0)).toBe(
      withFuture.filter((p) => p.checkpointAt !== "not a date").length,
    );
  });

  it("1y は 12 か月前の月から", () => {
    const s = monthlySeries(posts, defs, { kind: "count" }, "1y", now);
    expect(s[0].month).toBe("2025-10");
    expect(s.at(-1)?.month).toBe("2026-10");
  });

  it("y:N はその年の 1〜12 月", () => {
    const s = monthlySeries(posts, defs, { kind: "count" }, "y:2026", now);
    expect(s.map((p) => p.month)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("期間内の投稿 0 件・項目が無い", () => {
    expect(monthlySeries([], defs, { kind: "count" }, "all", now)).toEqual([]);
    expect(monthlySeries(posts, defs, { kind: "count" }, "y:2024", now)).toEqual(
      [],
    );
    const s = monthlySeries(
      posts,
      defs,
      { kind: "sum", fieldId: "missing" },
      "all",
      now,
    );
    expect(s.every((p) => p.value === null)).toBe(true);
  });
});

describe("barLayout", () => {
  const pts = (...values: (number | null)[]) =>
    values.map((value, i) => ({
      month: `2026-${String(i + 1).padStart(2, "0")}`,
      value,
    }));

  it("top は 5 の倍数に切り上げ (7 → 10、0 → 5)", () => {
    expect(barLayout(pts(7, 3)).top).toBe(10);
    expect(barLayout(pts(0, 0)).top).toBe(5);
    expect(barLayout(pts(10)).top).toBe(10);
    expect(barLayout(pts(null)).top).toBe(5);
  });

  it("null は h 0、最大値の棒はプロット上端まで", () => {
    const l = barLayout(pts(null, 10), { height: 170, padBottom: 22 });
    expect(l.bars[0].h).toBe(0);
    expect(l.bars[0].value).toBeNull();
    const base = l.gridlines[0].y;
    expect(l.bars[0].y).toBe(base);
    expect(l.bars[1].y).toBe(l.gridlines[5].y);
    expect(l.bars[1].y + l.bars[1].h).toBe(base);
  });

  it("幅 = n × (barWidth + gap) + padLeft、x は等間隔", () => {
    const l = barLayout(pts(1, 2, 3), { barWidth: 20, gap: 10, padLeft: 30 });
    expect(l.width).toBe(3 * 30 + 30);
    expect(l.bars.map((b) => b.x)).toEqual([35, 65, 95]);
    expect(l.bars.every((b) => b.w === 20)).toBe(true);
  });

  it("目盛りは 0〜top の 6 本、ラベルは M月", () => {
    const l = barLayout(pts(7));
    expect(l.gridlines.map((g) => g.value)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(l.bars[0].label).toBe("1月");
  });
});

describe("sparklineLayout", () => {
  it("0 件は空", () => {
    expect(sparklineLayout([], { width: 100, height: 50 })).toEqual({
      d: "",
      area: "",
      last: null,
      min: 0,
      max: 0,
    });
  });

  it("1 件は点だけ", () => {
    const l = sparklineLayout([3], { width: 100, height: 50 });
    expect(l.d).toBe("M50 25");
    expect(l.area).toBe("");
    expect(l.last).toEqual({ x: 50, y: 25 });
  });

  it("同値のみは中央の水平線 (0 除算しない)", () => {
    const l = sparklineLayout([2, 2, 2], { width: 100, height: 50 });
    expect(l.d).toBe("M4 25 L50 25 L96 25");
    expect(l.min).toBe(2);
    expect(l.max).toBe(2);
  });

  it("最大が上・最小が下、最新が右端", () => {
    const l = sparklineLayout([0, 10], { width: 100, height: 50 });
    expect(l.d).toBe("M4 46 L96 4");
    expect(l.last).toEqual({ x: 96, y: 4 });
    expect(l.area).toBe("M4 46 L96 4 L96 50 L4 50 Z");
  });

  it("NaN / Infinity は除く", () => {
    const l = sparklineLayout([NaN, 0, Infinity, 10, -Infinity], {
      width: 100,
      height: 50,
    });
    expect(l.d).toBe("M4 46 L96 4");
    expect(l.min).toBe(0);
    expect(l.max).toBe(10);
    expect(sparklineLayout([NaN], { width: 100, height: 50 }).last).toBeNull();
  });

  it("limit で最新側を残す", () => {
    const l = sparklineLayout([100, 1, 2, 3], {
      width: 100,
      height: 50,
      limit: 3,
    });
    expect(l.min).toBe(1);
    expect(l.max).toBe(3);
    expect(l.d.split(" L")).toHaveLength(3);
  });
});

describe("heatmapCells", () => {
  // 2026-10-28 (水)。今日を含む週の土曜は 10/31、先頭の日曜は 25 週前の 5/3
  it("セル数 = weeks × 7、先頭が日曜、末尾が今日を含む週の土曜", () => {
    const { cells } = heatmapCells([], now);
    expect(cells).toHaveLength(26 * 7);
    expect(cells[0]).toMatchObject({ day: "2026-05-03", week: 0, dow: 0 });
    expect(new Date(2026, 4, 3).getDay()).toBe(0);
    expect(cells[cells.length - 1]).toMatchObject({
      day: "2026-10-31",
      week: 25,
      dow: 6,
    });
    expect(cells.find((c) => c.day === "2026-10-28")).toMatchObject({
      week: 25,
      dow: 3,
    });
  });

  it("weeks を指定できる", () => {
    expect(heatmapCells([], now, 4).cells).toHaveLength(28);
  });

  it("JST 23:30 の投稿がその日に乗る。範囲外・不正な日付は数えない", () => {
    const { cells } = heatmapCells(
      [
        at("2026-10-27T23:30:00+09:00"),
        at("2026-10-27T08:00:00+09:00"),
        at("2026-05-02T12:00:00+09:00"),
        at("not a date"),
      ],
      now,
    );
    expect(cells.find((c) => c.day === "2026-10-27")?.count).toBe(2);
    expect(cells.find((c) => c.day === "2026-10-28")?.count).toBe(0);
    expect(cells.reduce((s, c) => s + c.count, 0)).toBe(2);
  });

  it("monthLabels は各月の最初の週に 1 つ", () => {
    const { cells, monthLabels } = heatmapCells([], now);
    expect(monthLabels.map((l) => l.label)).toEqual([
      "5月",
      "6月",
      "7月",
      "8月",
      "9月",
      "10月",
    ]);
    for (const { week, label } of monthLabels) {
      const sunday = cells.find((c) => c.week === week && c.dow === 0)!;
      expect(`${Number(sunday.day.slice(5, 7))}月`).toBe(label);
      expect(Number(sunday.day.slice(8))).toBeLessThanOrEqual(7);
    }
  });
});

describe("heatLevel", () => {
  it("0 / 1 / 2 / 3+", () => {
    expect([0, 1, 2, 3, 10].map(heatLevel)).toEqual([0, 1, 2, 3, 3]);
  });
});
