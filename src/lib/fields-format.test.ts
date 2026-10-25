import { describe, expect, it } from "vitest";
import type { ResolvedValue } from "@/lib/fields";
import {
  UNKNOWN_OPTION_LABEL,
  formatDuration,
  formatResolvedValue,
  joinSeconds,
  splitSeconds,
} from "@/lib/fields-format";
import type { FieldDef } from "@/lib/types";

const kind: FieldDef = {
  id: "kind",
  label: "種類",
  type: "select",
  multiple: true,
  options: [
    { id: "hall", label: "ホール" },
    { id: "room", label: "ルーム" },
    { id: "walk", label: "周遊", archived: true },
  ],
};
const weight: FieldDef = { id: "weight", label: "重量", type: "number", unit: "kg" };
const count: FieldDef = { id: "count", label: "回数", type: "number" };
const time: FieldDef = { id: "time", label: "所要時間", type: "duration" };
const memo: FieldDef = { id: "memo", label: "メモ", type: "text" };

const r = (field: FieldDef, rest: Partial<ResolvedValue>): ResolvedValue => ({
  field,
  source: "fields",
  ...rest,
});

describe("formatResolvedValue", () => {
  it("select は選択肢名を「・」区切りにする (archived も名前で出す)", () => {
    expect(formatResolvedValue(r(kind, { optionIds: ["hall"] }))).toBe("ホール");
    expect(
      formatResolvedValue(r(kind, { optionIds: ["room", "walk"] })),
    ).toBe("ルーム・周遊");
  });

  it("定義に無い option id は「未定義の選択肢」", () => {
    expect(
      formatResolvedValue(r(kind, { optionIds: ["hall", "gone"] })),
    ).toBe(`ホール・${UNKNOWN_OPTION_LABEL}`);
  });

  it("number は値と単位。丸めない", () => {
    expect(formatResolvedValue(r(weight, { value: "12.50" }))).toBe("12.50 kg");
    expect(formatResolvedValue(r(count, { value: "3" }))).toBe("3");
  });

  it("duration は m:ss / h:mm:ss", () => {
    expect(formatResolvedValue(r(time, { seconds: 59 }))).toBe("0:59");
    expect(formatResolvedValue(r(time, { seconds: 3600 }))).toBe("1:00:00");
  });

  it("text はそのまま", () => {
    expect(formatResolvedValue(r(memo, { text: "雨" }))).toBe("雨");
  });
});

describe("formatDuration", () => {
  it("1 時間未満は m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("1 時間以上は h:mm:ss", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(36000 + 59)).toBe("10:00:59");
  });
});

describe("splitSeconds / joinSeconds", () => {
  it("往復できる", () => {
    expect(splitSeconds(3661)).toEqual({ h: "1", m: "1", s: "1" });
    expect(joinSeconds(splitSeconds(3661))).toBe(3661);
    expect(joinSeconds({ h: "", m: "1", s: "" })).toBe(60);
  });

  it("全部空なら null", () => {
    expect(joinSeconds({ h: "", m: "", s: "" })).toBeNull();
  });

  it("分・秒が 59 を超えたら invalid", () => {
    expect(joinSeconds({ h: "0", m: "59", s: "59" })).toBe(3599);
    expect(joinSeconds({ h: "", m: "60", s: "" })).toBe("invalid");
    expect(joinSeconds({ h: "", m: "", s: "60" })).toBe("invalid");
  });
});
