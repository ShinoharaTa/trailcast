import { describe, expect, it } from "vitest";
import type { ResolvedValue } from "@/lib/fields";
import {
  UNKNOWN_OPTION_LABEL,
  formatDuration,
  formatResolvedValue,
  parseDurationInput,
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

describe("parseDurationInput", () => {
  it("空・空白だけは null", () => {
    expect(parseDurationInput("")).toBeNull();
    expect(parseDurationInput("   ")).toBeNull();
  });

  it("h:mm:ss / m:ss", () => {
    expect(parseDurationInput("1:23:45")).toBe(5025);
    expect(parseDurationInput("23:45")).toBe(1425);
    expect(parseDurationInput("0:00")).toBe(0);
    expect(parseDurationInput("83:00")).toBe(4980);
  });

  it("コロン区切りの 2 つ目以降が 59 を超えたら invalid", () => {
    expect(parseDurationInput("1:59:59")).toBe(7199);
    expect(parseDurationInput("1:60:00")).toBe("invalid");
    expect(parseDurationInput("1:00:60")).toBe("invalid");
    expect(parseDurationInput("23:60")).toBe("invalid");
  });

  it("日本語の単位", () => {
    expect(parseDurationInput("1時間23分45秒")).toBe(5025);
    expect(parseDurationInput("83分")).toBe(4980);
    expect(parseDurationInput("90秒")).toBe(90);
    expect(parseDurationInput("1時間")).toBe(3600);
    expect(parseDurationInput("1時間45秒")).toBe(3645);
    expect(parseDurationInput("1 時間 23 分")).toBe(4980);
  });

  it("「半」は 30 分 / 30 秒", () => {
    expect(parseDurationInput("1時間半")).toBe(5400);
    expect(parseDurationInput("2分半")).toBe(150);
    expect(parseDurationInput("1時間半10分")).toBe("invalid");
  });

  it("英字の単位 (大文字小文字は無視)", () => {
    expect(parseDurationInput("1h23m45s")).toBe(5025);
    expect(parseDurationInput("83m")).toBe(4980);
    expect(parseDurationInput("90s")).toBe(90);
    expect(parseDurationInput("1H23M")).toBe(4980);
  });

  it("数字だけは分 (小数可、秒に四捨五入)", () => {
    expect(parseDurationInput("0")).toBe(0);
    expect(parseDurationInput("45")).toBe(2700);
    expect(parseDurationInput("1.5")).toBe(90);
    expect(parseDurationInput("0.01")).toBe(1);
  });

  it("全角は NFKC で揃える", () => {
    expect(parseDurationInput("１：２３：４５")).toBe(5025);
    expect(parseDurationInput("８３分")).toBe(4980);
    expect(parseDurationInput(" ４５ ")).toBe(2700);
  });

  it("負数・その他は invalid", () => {
    expect(parseDurationInput("-5")).toBe("invalid");
    expect(parseDurationInput("abc")).toBe("invalid");
    expect(parseDurationInput("時間")).toBe("invalid");
    expect(parseDurationInput("1:2:3:4")).toBe("invalid");
    expect(parseDurationInput("1.5.0")).toBe("invalid");
  });

  it("formatDuration の出力を戻すと同じ秒になる", () => {
    for (const seconds of [0, 1, 59, 60, 61, 1425, 3599, 3600, 5025, 36059]) {
      expect(parseDurationInput(formatDuration(seconds))).toBe(seconds);
    }
  });
});
