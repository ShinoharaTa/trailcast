import { describe, expect, it } from "vitest";
import {
  FIELD_UNSET,
  convertTagGroupsToFields,
  countSelectOptions,
  crosspostTagsFor,
  filterPostsByFields,
  generateFieldId,
  resolveFieldValues,
  sanitizeFieldsForRecord,
  sanitizePostFieldsForRecord,
  summarizeDuration,
  summarizeNumber,
} from "@/lib/fields";
import { countTags, groupTagCounts } from "@/lib/tags";
import type { FieldDef, FieldValue, TagGroup } from "@/lib/types";

type Post = { tags?: string[]; fields?: FieldValue[] };

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
const text = (field: string, t: string): FieldValue => ({
  $type: "net.shino3.trailcast.post#textValue",
  field,
  text: t,
});

const kind: FieldDef = {
  id: "kind",
  label: "種類",
  type: "select",
  options: [
    { id: "hall", label: "ホール" },
    { id: "room", label: "ルーム" },
    { id: "walk", label: "周遊", archived: true },
  ],
};
const result: FieldDef = {
  id: "result",
  label: "成否",
  type: "select",
  options: [
    { id: "ok", label: "成功" },
    { id: "ng", label: "失敗" },
  ],
};
const weight: FieldDef = { id: "weight", label: "重量", type: "number", unit: "kg" };
const time: FieldDef = { id: "time", label: "タイム", type: "duration" };
const memo: FieldDef = { id: "memo", label: "メモ", type: "text" };

describe("generateFieldId", () => {
  it("base32 小文字 8 文字", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateFieldId()).toMatch(/^[a-z2-7]{8}$/);
    }
  });
});

describe("tagGroups からの変換", () => {
  const groups: TagGroup[] = [
    { label: "種類", tags: ["ホール", "ルーム", "周遊"] },
    { label: "成否", tags: ["成功", "失敗"] },
    { label: "未使用", tags: ["誰も使っていない"] },
  ];
  // タグだけの旧 post。大文字小文字違い・グループ外のタグ・タグ無しを含む
  const legacy: Post[] = [
    { tags: ["ホール", "成功", "東京"] },
    { tags: ["ルーム", "失敗"] },
    { tags: ["ホール", "ルーム", "成功"] },
    { tags: ["周遊"] },
    { tags: ["東京"] },
    {},
    { tags: [] },
  ];

  it("1 group → 1 select。既定は multiple: true、tags は順に option になる", () => {
    const defs = convertTagGroupsToFields(groups);
    expect(defs).toHaveLength(3);
    expect(defs[0]).toMatchObject({ label: "種類", type: "select", multiple: true });
    expect(defs[0].options?.map((o) => o.label)).toEqual(["ホール", "ルーム", "周遊"]);
    const ids = defs.flatMap((d) => [d.id, ...(d.options ?? []).map((o) => o.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opts.multiple で group ごとに single を選べる", () => {
    const defs = convertTagGroupsToFields(groups, {
      multiple: (g) => g.label !== "成否",
    });
    expect(defs.map((d) => d.multiple)).toEqual([true, false, true]);
  });

  it("変換後の件数がグループごとのタグ件数と一致する", () => {
    const defs = convertTagGroupsToFields(groups);
    const grouped = groupTagCounts(countTags(legacy), groups);
    expect(grouped.groups).toHaveLength(defs.length);
    grouped.groups.forEach((g, i) => {
      const counts = countSelectOptions(legacy, defs[i]);
      const byOption = counts.filter((c) => c.optionId !== FIELD_UNSET);
      expect(byOption.map((c) => c.count)).toEqual(g.items.map((t) => t.count));
    });
  });

  it("大文字小文字違いのタグも一致する", () => {
    const defs = convertTagGroupsToFields([{ label: "日", tags: ["Day1"] }]);
    const counts = countSelectOptions([{ tags: ["day1"] }, { tags: ["DAY1"] }], defs[0]);
    expect(counts[0].count).toBe(2);
  });
});

describe("resolveFieldValues", () => {
  it("post.fields があればそれを使い、定義に無い field は除外する", () => {
    const r = resolveFieldValues(
      { tags: ["ホール"], fields: [select("result", ["ok"]), num("gone", "1")] },
      [kind, result],
    );
    expect(r).toEqual([{ field: result, source: "fields", optionIds: ["ok"] }]);
  });

  it("archived option の値も解決される (fields / tags 両方)", () => {
    expect(resolveFieldValues({ fields: [select("kind", ["walk"])] }, [kind])).toEqual([
      { field: kind, source: "fields", optionIds: ["walk"] },
    ]);
    expect(resolveFieldValues({ tags: ["周遊"] }, [kind])).toEqual([
      { field: kind, source: "tags", optionIds: ["walk"] },
    ]);
  });

  it("tags fallback は完全一致のみ (部分一致しない)", () => {
    expect(resolveFieldValues({ tags: ["ホールA", "ルー"] }, [kind])).toEqual([]);
  });

  it("fields の無い thread (defs 空) では何も返さない", () => {
    expect(resolveFieldValues({ tags: ["ホール"] }, [])).toEqual([]);
    expect(resolveFieldValues({ fields: [select("kind", ["hall"])] }, [])).toEqual([]);
    expect(crosspostTagsFor({ tags: ["温泉", "宿"] }, [])).toEqual(["温泉", "宿"]);
    const posts: Post[] = [{ tags: ["温泉"] }, {}];
    expect(filterPostsByFields(posts, [], {})).toBe(posts);
  });
});

describe("filterPostsByFields", () => {
  const posts: Post[] = [
    { fields: [select("kind", ["hall"]), select("result", ["ok"])] },
    { fields: [select("kind", ["room"]), select("result", ["ng"])] },
    { fields: [select("kind", ["hall", "room"])] },
    { tags: ["ホール", "成功"] },
    { tags: ["東京"] },
    {},
  ];
  const defs = [{ ...kind, multiple: true }, result];

  it("同じ field 内は OR、field 間は AND", () => {
    expect(filterPostsByFields(posts, defs, { kind: ["hall"] })).toEqual([
      posts[0],
      posts[2],
      posts[3],
    ]);
    expect(filterPostsByFields(posts, defs, { kind: ["hall", "room"], result: ["ok"] })).toEqual([
      posts[0],
      posts[3],
    ]);
  });

  it("空配列の選択は条件にしない", () => {
    expect(filterPostsByFields(posts, defs, { kind: [], result: [] })).toBe(posts);
  });

  it("FIELD_UNSET を含むとタグ無し・値無しの post が拾える", () => {
    expect(filterPostsByFields(posts, defs, { kind: [FIELD_UNSET] })).toEqual([
      posts[4],
      posts[5],
    ]);
    expect(filterPostsByFields(posts, defs, { result: ["ok", FIELD_UNSET] })).toEqual([
      posts[0],
      posts[2],
      posts[3],
      posts[4],
      posts[5],
    ]);
  });

  it("option の label を変えても fields を持つ post の結果は変わらない", () => {
    const renamed: FieldDef = {
      ...kind,
      multiple: true,
      options: kind.options!.map((o) => ({ ...o, label: `${o.label}-改` })),
    };
    const withFields = posts.filter((p) => p.fields);
    const before = filterPostsByFields(withFields, defs, { kind: ["hall"] });
    const after = filterPostsByFields(withFields, [renamed, result], { kind: ["hall"] });
    expect(after).toEqual(before);
    expect(after).toHaveLength(2);
  });
});

describe("countSelectOptions", () => {
  it("定義の options 順、multiple は延べ数、最後に UNSET", () => {
    const def = { ...kind, multiple: true };
    const posts: Post[] = [
      { fields: [select("kind", ["room", "hall"])] },
      { fields: [select("kind", ["hall"])] },
      { tags: ["周遊"] },
      { fields: [select("kind", ["unknown"])] },
      {},
    ];
    expect(countSelectOptions(posts, def)).toEqual([
      { optionId: "hall", count: 2 },
      { optionId: "room", count: 1 },
      { optionId: "walk", count: 1 },
      { optionId: FIELD_UNSET, count: 2 },
    ]);
  });
});

describe("sanitizePostFieldsForRecord", () => {
  const defs = [kind, result, weight, time, memo];

  it('number "12.5" はそのまま、"1e3" や "abc" は落ちる', () => {
    expect(sanitizePostFieldsForRecord([num("weight", "12.5")], defs)).toEqual([
      num("weight", "12.5"),
    ]);
    for (const bad of ["1e3", "abc", "", "1.", ".5", "+1", "1".repeat(33)]) {
      expect(sanitizePostFieldsForRecord([num("weight", bad)], defs)).toBeUndefined();
    }
    expect(sanitizePostFieldsForRecord([num("weight", "-0.25")], defs)).toEqual([
      num("weight", "-0.25"),
    ]);
  });

  it("同じ field が 2 件あると後勝ちで 1 件になる", () => {
    expect(
      sanitizePostFieldsForRecord([num("weight", "10"), num("weight", "20")], defs),
    ).toEqual([num("weight", "20")]);
  });

  it("定義に無い field は落とし、archived な field は残す", () => {
    const archived: FieldDef = { ...weight, archived: true };
    expect(
      sanitizePostFieldsForRecord([num("weight", "1"), num("nope", "1")], [archived]),
    ).toEqual([num("weight", "1")]);
  });

  it("select は定義にある option id だけ、single は先頭 1 件、0 件なら落とす", () => {
    expect(
      sanitizePostFieldsForRecord([select("kind", ["x", "room", "hall"])], defs),
    ).toEqual([select("kind", ["room"])]);
    expect(
      sanitizePostFieldsForRecord([select("kind", ["x", "room", "hall"])], [
        { ...kind, multiple: true },
      ]),
    ).toEqual([select("kind", ["room", "hall"])]);
    expect(sanitizePostFieldsForRecord([select("kind", ["x"])], defs)).toBeUndefined();
  });

  it("duration は 0 以上の整数、text は trim して空なら落とす", () => {
    expect(sanitizePostFieldsForRecord([dur("time", 0)], defs)).toEqual([dur("time", 0)]);
    expect(sanitizePostFieldsForRecord([dur("time", -1)], defs)).toBeUndefined();
    expect(sanitizePostFieldsForRecord([dur("time", 1.5)], defs)).toBeUndefined();
    expect(sanitizePostFieldsForRecord([text("memo", "  よかった ")], defs)).toEqual([
      text("memo", "よかった"),
    ]);
    expect(sanitizePostFieldsForRecord([text("memo", "   ")], defs)).toBeUndefined();
    expect(
      (sanitizePostFieldsForRecord([text("memo", "あ".repeat(250))], defs)?.[0] as {
        text: string;
      }).text,
    ).toHaveLength(200);
  });

  it("$type が field の型と合わないものは落とす", () => {
    expect(sanitizePostFieldsForRecord([num("time", "10")], defs)).toBeUndefined();
    expect(sanitizePostFieldsForRecord([dur("weight", 10)], defs)).toBeUndefined();
  });
});

describe("sanitizeFieldsForRecord", () => {
  it("label の trim / 上限、型ごとに不要なプロパティを落とす", () => {
    const out = sanitizeFieldsForRecord([
      { id: "a", label: "  重量  ", type: "number", unit: "kg", scale: 1, options: [{ id: "x", label: "x" }], multiple: true },
      { id: "b", label: "あ".repeat(30), type: "duration", unit: "s", scale: 2 },
      { id: "c", label: "種類", type: "select", multiple: true, unit: "kg", options: [{ id: "o", label: " #ホール " }] },
    ]);
    expect(out).toEqual([
      { id: "a", label: "重量", type: "number", unit: "kg", scale: 1 },
      { id: "b", label: "あ".repeat(20), type: "duration" },
      { id: "c", label: "種類", type: "select", multiple: true, options: [{ id: "o", label: "ホール" }] },
    ]);
  });

  it("id 重複は後ろを落とし、有効な option が無い select は落とす", () => {
    const out = sanitizeFieldsForRecord([
      { id: "a", label: "一", type: "text" },
      { id: "a", label: "二", type: "text" },
      { id: "s", label: "空", type: "select", options: [{ id: "o", label: "   " }] },
      { id: "t", label: "無", type: "select" },
    ]);
    expect(out).toEqual([{ id: "a", label: "一", type: "text" }]);
  });

  it("空なら undefined", () => {
    expect(sanitizeFieldsForRecord([])).toBeUndefined();
  });
});

describe("crosspostTagsFor", () => {
  it("自由タグと option label を重複なしで合流する (大文字小文字違いも 1 つ)", () => {
    const def: FieldDef = {
      id: "d",
      label: "日",
      type: "select",
      multiple: true,
      options: [
        { id: "d1", label: "Day1" },
        { id: "on", label: "温泉" },
      ],
    };
    expect(
      crosspostTagsFor({ tags: ["day1", "宿"], fields: [select("d", ["d1", "on"])] }, [def]),
    ).toEqual(["day1", "宿", "温泉"]);
  });
});

describe("summarizeNumber / summarizeDuration", () => {
  it("合計・平均・最小・最大", () => {
    const posts: Post[] = [
      { fields: [num("weight", "12.5"), dur("time", 60)] },
      { fields: [num("weight", "7.5"), dur("time", 180)] },
      { fields: [num("weight", "bad")] },
      {},
    ];
    expect(summarizeNumber(posts, weight)).toEqual({ count: 2, sum: 20, avg: 10, min: 7.5, max: 12.5 });
    expect(summarizeDuration(posts, time)).toEqual({ count: 2, sum: 240, avg: 120, min: 60, max: 180 });
  });

  it("値が 0 件なら count 0、他は null", () => {
    const empty = { count: 0, sum: null, avg: null, min: null, max: null };
    expect(summarizeNumber([{}], weight)).toEqual(empty);
    expect(summarizeDuration([], time)).toEqual(empty);
  });
});
