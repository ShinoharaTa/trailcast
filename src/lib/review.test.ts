import { describe, expect, it } from "vitest";
import { FIELD_UNSET, fieldFilterGroups } from "@/lib/fields";
import type { PostLike } from "@/lib/record";
import {
  availablePeriods,
  dayKey,
  dayLabel,
  filterByPeriod,
  formatStat,
  monthKey,
  numericCard,
  optionShares,
  periodRange,
  reviewKpis,
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
