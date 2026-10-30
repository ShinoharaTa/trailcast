import { describe, expect, it } from "vitest";
import {
  FIELD_UNSET,
  MAX_FIELD_OPTIONS,
  appendPendingOptions,
  findOptionByLabel,
  mergePendingOptions,
  remapSelectValues,
  selectedPendingOptions,
  buildEditedPostFields,
  buildNewPostFields,
  convertTagGroupsToFields,
  copyFieldDefs,
  countFreeTags,
  EMPTY_RANGE_INPUT,
  effectiveRange,
  filterPostsByRanges,
  formatRangeBound,
  hasRangeInput,
  isRangeField,
  numericValueOf,
  parseRangeBound,
  pruneRangeSelection,
  rangeFilterRows,
  setRangeBound,
  fieldFilterGroups,
  filterPostsByFieldsAndTags,
  freeTagChips,
  pruneFieldSelection,
  toggleFieldOption,
  fieldDefErrors,
  fieldDefsDirty,
  isBlankOptionLabel,
  optionLabelTaken,
  orderFields,
  countSelectOptions,
  crosspostTagsFor,
  fieldValuesFromResolved,
  filterPostsByFields,
  generateFieldId,
  initialFreeTagsForEdit,
  resolveFieldValues,
  restoreBlankLabel,
  toEditableField,
  toFieldDef,
  sanitizeFieldsForRecord,
  sanitizePostFieldsForRecord,
  stripSelectedOptionTags,
  summarizeDuration,
  summarizeNumber,
  toggleSelectOption,
  type EditableField,
  type FieldSelection,
  type RangeSelection,
} from "@/lib/fields";
import { countTags, filterPostsByTags, groupTagCounts, tagKey } from "@/lib/tags";
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

  it("変換後の絞り込みチップの件数がグループごとのタグ件数と一致する", () => {
    const defs = convertTagGroupsToFields(groups);
    const grouped = groupTagCounts(countTags(legacy), groups);
    const chips = fieldFilterGroups(legacy, defs, {}, []);
    grouped.groups.forEach((g, i) => {
      const group = chips.find((c) => c.field.id === defs[i].id);
      const byLabel = new Map(
        (group?.chips ?? [])
          .filter((c) => c.optionId !== FIELD_UNSET)
          .map((c) => [c.label, c]),
      );
      // 0 件の選択肢はチップに出ない。出たものは total も count もグループの件数と同じ
      for (const t of g.items) {
        const chip = byLabel.get(t.tag);
        if (t.count === 0) {
          expect(chip).toBeUndefined();
        } else {
          expect(chip?.total).toBe(t.count);
          expect(chip?.count).toBe(t.count);
        }
      }
    });
  });

  it("大文字小文字違いのタグも一致する", () => {
    const defs = convertTagGroupsToFields([{ label: "日", tags: ["Day1"] }]);
    const counts = countSelectOptions([{ tags: ["day1"] }, { tags: ["DAY1"] }], defs[0]);
    expect(counts[0].count).toBe(2);
  });
});

describe("copyFieldDefs", () => {
  const src: FieldDef[] = [
    {
      id: "kind",
      label: "種類",
      type: "select",
      multiple: true,
      options: [
        { id: "a", label: "ホール" },
        { id: "b", label: "旧", archived: true },
        { id: "c", label: "ルーム" },
      ],
    },
    { id: "old", label: "旧項目", type: "text", archived: true },
    { id: "w", label: "重量", type: "number", unit: "kg", scale: 1 },
  ];

  it("archived の項目・選択肢を除き、設定はそのまま複製する", () => {
    const out = copyFieldDefs(src);
    expect(out.map((d) => d.label)).toEqual(["種類", "重量"]);
    expect(out[0]).toMatchObject({ type: "select", multiple: true });
    expect(out[0].options?.map((o) => o.label)).toEqual(["ホール", "ルーム"]);
    expect(out[1]).toMatchObject({ type: "number", unit: "kg", scale: 1 });
  });

  it("項目と選択肢の id はすべて新しく振られる", () => {
    const out = copyFieldDefs(src);
    const oldIds = new Set(src.flatMap((d) => [d.id, ...(d.options ?? []).map((o) => o.id)]));
    const ids = out.flatMap((d) => [d.id, ...(d.options ?? []).map((o) => o.id)]);
    expect(ids.every((id) => /^[a-z2-7]{8}$/.test(id) && !oldIds.has(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("元の定義を書き換えない", () => {
    const before = JSON.stringify(src);
    copyFieldDefs(src);
    expect(JSON.stringify(src)).toBe(before);
  });

  it("multiple: false / true をそのまま保つ", () => {
    const out = copyFieldDefs([
      { id: "s", label: "単", type: "select", multiple: false, options: [{ id: "a", label: "x" }] },
      { id: "m", label: "複", type: "select", multiple: true, options: [{ id: "b", label: "y" }] },
    ]);
    expect(out.map((d) => d.multiple)).toEqual([false, true]);
  });

  it("選択肢がすべて archived の select は落とす", () => {
    const out = copyFieldDefs([
      { id: "s", label: "旧", type: "select", options: [{ id: "a", label: "x", archived: true }] },
      { id: "e", label: "空", type: "select" },
      { id: "t", label: "メモ", type: "text" },
    ]);
    expect(out.map((d) => d.label)).toEqual(["メモ"]);
  });

  it("30 件で打ち切る", () => {
    const many: FieldDef[] = Array.from({ length: 31 }, (_, i) => ({
      id: `f${i}`,
      label: `項目${i}`,
      type: "text",
    }));
    const out = copyFieldDefs(many);
    expect(out).toHaveLength(30);
    expect(out.at(-1)?.label).toBe("項目29");
  });

  it("結果を sanitizeFieldsForRecord に通しても項目・選択肢が落ちない", () => {
    const many: FieldDef[] = Array.from({ length: 31 }, (_, i) => ({
      id: `f${i}`,
      label: `項目${i}`,
      type: "select",
      multiple: i % 2 === 0,
      options: Array.from({ length: 50 }, (_, j) => ({ id: `o${j}`, label: `選択肢${j}` })),
    }));
    for (const input of [src, many]) {
      const out = copyFieldDefs(input);
      const sanitized = sanitizeFieldsForRecord(out);
      expect(sanitized).toHaveLength(out.length);
      expect(sanitized?.map((d) => d.options?.length)).toEqual(
        out.map((d) => d.options?.length),
      );
      const ids = out.flatMap((d) => [d.id, ...(d.options ?? []).map((o) => o.id)]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("定義エディタの state 変換", () => {
  // PDS が返す DAG-CBOR の正準キー順 (キー長 → バイト順) で書いた保存済み定義。
  // scale: 0 / multiple: false を明示し、archived の項目が途中にある並び
  const saved = [
    {
      id: "kind",
      type: "select",
      label: "種類",
      options: [
        { id: "a", label: "ホール" },
        { id: "b", label: "旧", archived: true },
      ],
      multiple: false,
    },
    { id: "old", type: "text", label: "旧項目", archived: true },
    { id: "w", type: "number", unit: "kg", label: "重量", scale: 0 },
    { id: "part", type: "select", label: "部位", options: [{ id: "x", label: "脚" }], multiple: true },
    { id: "t", type: "duration", label: "タイム" },
  ] as FieldDef[];

  it("保存済み def → 編集 state → def → sanitize が元の sanitize 結果と一致する", () => {
    const editing = saved.map((d) => toEditableField(d, true));
    const roundTrip = sanitizeFieldsForRecord(orderFields(editing).map(toFieldDef));
    const original = sanitizeFieldsForRecord(orderFields(saved));
    expect(JSON.stringify(roundTrip)).toBe(JSON.stringify(original));
    // archived は末尾、scale: 0 は保たれる
    expect(roundTrip?.map((d) => d.id)).toEqual(["kind", "w", "part", "t", "old"]);
    expect(roundTrip?.find((d) => d.id === "w")?.scale).toBe(0);
  });

  it("開いただけでは dirty にならず、変更すると dirty になる", () => {
    const editing = saved.map((d) => toEditableField(d, true));
    expect(fieldDefsDirty(editing, saved)).toBe(false);
    expect(fieldDefsDirty([], undefined)).toBe(false);
    const renamed = editing.map((f) => (f.id === "w" ? { ...f, label: "重さ" } : f));
    expect(fieldDefsDirty(renamed, saved)).toBe(true);
  });

  const editKind = (patch: (f: EditableField) => Partial<EditableField>) =>
    saved
      .map((d) => toEditableField(d, true))
      .map((f) => (f.id === "kind" ? { ...f, ...patch(f) } : f));

  it("選択肢の並べ替え・非表示の切り替え・multiple の変更・選択肢の追加で dirty になる", () => {
    expect(
      fieldDefsDirty(editKind((f) => ({ options: [...f.options].reverse() })), saved),
    ).toBe(true);
    expect(
      fieldDefsDirty(
        editKind((f) => ({
          options: f.options.map((o) => (o.id === "b" ? { ...o, archived: false } : o)),
        })),
        saved,
      ),
    ).toBe(true);
    expect(fieldDefsDirty(editKind(() => ({ archived: true })), saved)).toBe(true);
    expect(fieldDefsDirty(editKind(() => ({ multiple: true })), saved)).toBe(true);
    expect(
      fieldDefsDirty(
        editKind((f) => ({
          options: [...f.options, { id: "c", label: "新", archived: false, saved: false }],
        })),
        saved,
      ),
    ).toBe(true);
  });

  it("option のキー順が違うだけでは dirty にならない", () => {
    const editing = saved.map((d) => toEditableField(d, true));
    const reordered = saved.map((d) =>
      d.options
        ? {
            ...d,
            options: d.options.map((o) =>
              o.archived
                ? { archived: o.archived, label: o.label, id: o.id }
                : { label: o.label, id: o.id },
            ),
          }
        : d,
    );
    expect(fieldDefsDirty(editing, reordered)).toBe(false);
  });
});

describe("fieldDefErrors", () => {
  const editable = (def: FieldDef, saved = false) => toEditableField(def, saved);

  it("名前のある項目・有効な選択肢のある選択項目はエラーにしない", () => {
    expect(fieldDefErrors([editable(kind), editable(weight), editable(memo)]).size).toBe(0);
    expect(fieldDefErrors([]).size).toBe(0);
  });

  it("項目名が空 (空白だけ) なら label", () => {
    const errors = fieldDefErrors([
      editable({ ...weight, label: "  " }),
      editable({ ...kind, label: "" }),
    ]);
    expect([...errors]).toEqual([
      ["weight", "label"],
      ["kind", "label"],
    ]);
  });

  it("名前のある選択肢が 0 件の選択項目は options", () => {
    const errors = fieldDefErrors([
      editable({ ...kind, id: "none", options: [] }),
      editable({ ...kind, id: "blank", options: [{ id: "a", label: "#" }] }),
      editable({ ...kind, id: "ok", options: [{ id: "a", label: "#" }, { id: "b", label: "y" }] }),
    ]);
    expect([...errors]).toEqual([
      ["none", "options"],
      ["blank", "options"],
    ]);
  });

  it("選択肢がすべて非表示でも名前があればエラーにしない (sanitize で項目は落ちない)", () => {
    const hidden = editable(
      { ...kind, id: "hidden", options: [{ id: "a", label: "x", archived: true }] },
      true,
    );
    expect(fieldDefErrors([hidden]).size).toBe(0);
    expect(sanitizeFieldsForRecord([toFieldDef(hidden)])).toHaveLength(1);
  });

  it("非表示の項目は対象外", () => {
    expect(
      fieldDefErrors([editable({ ...kind, label: "", options: [], archived: true }, true)]).size,
    ).toBe(0);
  });
});

describe("toggleSelectOption", () => {
  it("multiple はトグルし、追加は末尾", () => {
    expect(toggleSelectOption(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleSelectOption(["a", "b"], "a", true)).toEqual(["b"]);
  });

  it("1 つだけ: 未選択を押すとそれだけになる", () => {
    expect(toggleSelectOption([], "a", false)).toEqual(["a"]);
    expect(toggleSelectOption(["b"], "a", false)).toEqual(["a"]);
  });

  it("1 つだけ: 唯一の選択を押すと解除", () => {
    expect(toggleSelectOption(["a"], "a", false)).toEqual([]);
  });

  it("1 つだけ: 複数選ばれているときに選択済みを押すとそれ 1 つに絞る", () => {
    expect(toggleSelectOption(["a", "b"], "b", false)).toEqual(["b"]);
  });
});

describe("buildNewPostFields", () => {
  it("入力できる項目があり未入力なら []", () => {
    expect(buildNewPostFields([kind, weight], [])).toEqual([]);
  });

  it("値は sanitize して返す", () => {
    expect(
      buildNewPostFields([kind, weight], [num("weight", "60"), select("kind", ["x"])]),
    ).toEqual([num("weight", "60")]);
  });

  it("項目が無い・archived の項目だけなら undefined", () => {
    expect(buildNewPostFields([], [])).toBeUndefined();
    expect(buildNewPostFields([{ ...kind, archived: true }], [])).toBeUndefined();
  });
});

describe("optionLabelTaken", () => {
  const options = [
    { id: "a", label: "ホール" },
    { id: "b", label: "Room" },
  ];

  it("normalizeTag 後に tagKey が一致する他の選択肢があれば true", () => {
    expect(optionLabelTaken(options, "#room")).toBe(true);
    expect(optionLabelTaken(options, " ホール ")).toBe(true);
    expect(optionLabelTaken(options, "周遊")).toBe(false);
  });

  it("exceptId の選択肢自身は除く。空になる名前は重複扱いしない", () => {
    expect(optionLabelTaken(options, "ROOM", "b")).toBe(false);
    expect(optionLabelTaken(options, "#")).toBe(false);
  });
});

describe("restoreBlankLabel", () => {
  it("保存済みで空 (trim 後) なら保存済みの名前に戻し、それ以外はそのまま", () => {
    expect(restoreBlankLabel("  ", "種類")).toBe("種類");
    expect(restoreBlankLabel("", "種類")).toBe("種類");
    expect(restoreBlankLabel("場所", "種類")).toBe("場所");
    expect(restoreBlankLabel("  ", undefined)).toBe("  ");
  });

  it("選択肢は normalizeTag で消える名前 (# や ， だけ) も空とみなす", () => {
    expect(restoreBlankLabel("#", "ホール", isBlankOptionLabel)).toBe("ホール");
    expect(restoreBlankLabel(" ，", "ホール", isBlankOptionLabel)).toBe("ホール");
    expect(restoreBlankLabel("#ルーム", "ホール", isBlankOptionLabel)).toBe("#ルーム");
    // 項目名は trim 判定のまま
    expect(restoreBlankLabel("#", "種類")).toBe("#");
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

describe("レビュー対応で追加", () => {
  const defs = [kind, result, weight, time, memo];

  it("後勝ちでも不正値は勝たない", () => {
    expect(
      sanitizePostFieldsForRecord([num("weight", "10"), num("weight", "abc")], defs),
    ).toEqual([num("weight", "10")]);
  });

  it("fields は 30 件で打ち切る", () => {
    const many: FieldDef[] = Array.from({ length: 31 }, (_, i) => ({
      id: `f${i}`,
      label: `項目${i}`,
      type: "text",
    }));
    const out = sanitizeFieldsForRecord(many);
    expect(out).toHaveLength(30);
    expect(out?.at(-1)?.id).toBe("f29");
  });

  it("id が空・17 文字の def は落ち、16 文字は残る", () => {
    const out = sanitizeFieldsForRecord([
      { id: "", label: "空", type: "text" },
      { id: "a".repeat(17), label: "長", type: "text" },
      { id: "b".repeat(16), label: "可", type: "text" },
    ]);
    expect(out?.map((d) => d.id)).toEqual(["b".repeat(16)]);
  });

  it("scale は 0〜3 の整数以外を除去する", () => {
    const out = sanitizeFieldsForRecord(
      [-1, 0, 3, 4, 1.5].map((scale, i) => ({
        id: `n${i}`,
        label: "数",
        type: "number" as const,
        scale,
      })),
    );
    expect(out?.map((d) => d.scale)).toEqual([undefined, 0, 3, undefined, undefined]);
  });

  it("unit は 8 書記素で切られる", () => {
    // 結合文字を含む書記素 (👨‍👩‍👧) も 1 文字として数える
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    const out = sanitizeFieldsForRecord([
      { id: "n", label: "数", type: "number", unit: `  ${family.repeat(10)} ` },
    ]);
    expect(out?.[0].unit).toBe(family.repeat(8));
  });

  it("変換結果を sanitizeFieldsForRecord に通すと label が trim され、空 group は落ちる", () => {
    const converted = convertTagGroupsToFields([
      { label: "  種類 ", tags: ["ホール"] },
      { label: "空", tags: [] },
    ]);
    const out = sanitizeFieldsForRecord(converted);
    expect(out).toHaveLength(1);
    expect(out?.[0]).toMatchObject({ label: "種類", type: "select", multiple: true });
  });

  it("fields: [] の post は tags があっても fallback しない", () => {
    expect(resolveFieldValues({ tags: ["ホール", "成功"], fields: [] }, [kind, result])).toEqual(
      [],
    );
  });

  it("変換前後で filterPostsByTags と filterPostsByFields の結果が一致する", () => {
    const groups: TagGroup[] = [
      { label: "種類", tags: ["ホール", "ルーム"] },
      { label: "成否", tags: ["成功", "失敗"] },
    ];
    const posts: Post[] = [
      { tags: ["ホール", "成功"] },
      { tags: ["ルーム", "失敗", "東京"] },
      { tags: ["ホール", "ルーム", "成功"] },
      { tags: ["HALL"] },
      { tags: ["東京"] },
      {},
    ];
    const converted = convertTagGroupsToFields(groups);
    const fieldOf = (tag: string) => {
      for (const def of converted) {
        const opt = def.options?.find((o) => tagKey(o.label) === tagKey(tag));
        if (opt) return { fieldId: def.id, optionId: opt.id };
      }
      throw new Error(tag);
    };
    // 1 タグ、および別グループのタグ 2 つの AND
    const cases = [["ホール"], ["ルーム"], ["失敗"], ["ホール", "成功"], ["ルーム", "失敗"]];
    for (const tags of cases) {
      const selection: Record<string, string[]> = {};
      for (const t of tags) {
        const { fieldId, optionId } = fieldOf(t);
        selection[fieldId] = [...(selection[fieldId] ?? []), optionId];
      }
      expect(filterPostsByFields(posts, converted, selection)).toEqual(
        filterPostsByTags(posts, tags.map(tagKey)),
      );
    }
  });
});

describe("fieldValuesFromResolved", () => {
  it("fields と tags の両方から解決した値を FieldValue に戻す", () => {
    const post: Post = {
      fields: [num("weight", "12.5"), dur("time", 90), text("memo", "雨"), select("kind", ["room"])],
    };
    expect(fieldValuesFromResolved(resolveFieldValues(post, [kind, weight, time, memo]))).toEqual([
      select("kind", ["room"]),
      num("weight", "12.5"),
      dur("time", 90),
      text("memo", "雨"),
    ]);
    expect(
      fieldValuesFromResolved(resolveFieldValues({ tags: ["ホール", "成功"] }, [kind, result])),
    ).toEqual([select("kind", ["hall"]), select("result", ["ok"])]);
  });
});

describe("buildEditedPostFields", () => {
  it("tags から読み取っていた選択肢のタグを外し、fields に書く", () => {
    const post: Post = { tags: ["ホール", "東京", "成功"] };
    const values = fieldValuesFromResolved(resolveFieldValues(post, [kind, result]));
    expect(buildEditedPostFields(post, [kind, result], values, post.tags ?? [])).toEqual({
      fields: [select("kind", ["hall"]), select("result", ["ok"])],
      tags: ["東京"],
    });
  });

  const single: FieldDef = {
    id: "kind",
    label: "種類",
    type: "select",
    multiple: false,
    options: [
      { id: "hall", label: "ホール" },
      { id: "room", label: "ルーム" },
      { id: "walk", label: "周遊" },
    ],
  };

  it("1 つだけの項目に旧タグが 2 つ一致し、選択を変えていなければ両方 fields に書きタグから外す", () => {
    const post: Post = { tags: ["ホール", "ルーム", "東京"] };
    const values = fieldValuesFromResolved(resolveFieldValues(post, [single]));
    const expected = { fields: [select("kind", ["hall", "room"])], tags: ["東京"] };
    // タグ欄の値が元の tags でも、初期表示で外した後でも同じ結果になる
    expect(buildEditedPostFields(post, [single], values, post.tags ?? [])).toEqual(expected);
    expect(
      buildEditedPostFields(post, [single], values, initialFreeTagsForEdit(post, [single])),
    ).toEqual(expected);
  });

  it("1 つだけの項目でタグ 2 つ一致から片方を押して 1 値に絞ると、外した側のタグも tags から消える", () => {
    const post: Post = { tags: ["ホール", "ルーム", "東京"] };
    const initial = fieldValuesFromResolved(resolveFieldValues(post, [single]));
    expect(initial).toEqual([select("kind", ["hall", "room"])]);
    // UI でルームを押す: 2 値 → ルームだけ
    const values = [select("kind", toggleSelectOption(["hall", "room"], "room", false))];
    const expected = { fields: [select("kind", ["room"])], tags: ["東京"] };
    expect(buildEditedPostFields(post, [single], values, post.tags ?? [])).toEqual(expected);
    expect(
      buildEditedPostFields(post, [single], values, initialFreeTagsForEdit(post, [single])),
    ).toEqual(expected);
  });

  it("fields に 1 つだけの項目の 2 値がある post: 変えていなければ元の順で保ち、絞れば 1 値", () => {
    const post: Post = { fields: [select("kind", ["room", "hall"])], tags: ["東京"] };
    // UI 側の順序が違っても同じ集合なら変更なし扱い
    expect(
      buildEditedPostFields(post, [single], [select("kind", ["hall", "room"])], ["東京"]),
    ).toEqual({ fields: [select("kind", ["room", "hall"])], tags: ["東京"] });
    expect(
      buildEditedPostFields(post, [single], [select("kind", ["hall"])], ["東京"]),
    ).toEqual({ fields: [select("kind", ["hall"])], tags: ["東京"] });
  });

  it("大文字小文字違いのタグも外す。選択を外した選択肢のタグも外す", () => {
    const def: FieldDef = {
      id: "area",
      label: "地域",
      type: "select",
      options: [{ id: "tky", label: "Tokyo" }],
    };
    const post: Post = { tags: ["TOKYO", "雨"] };
    expect(buildEditedPostFields(post, [def], [], post.tags ?? [])).toEqual({
      fields: [],
      tags: ["雨"],
    });
  });

  it("全項目が未入力なら fields は [] を書く", () => {
    const post: Post = { fields: [num("weight", "10")], tags: ["東京"] };
    expect(buildEditedPostFields(post, [weight], [], ["東京"])).toEqual({
      fields: [],
      tags: ["東京"],
    });
  });

  it("fields を持つ post ではタグを外さない", () => {
    const post: Post = { fields: [num("weight", "10")], tags: ["ホール"] };
    expect(
      buildEditedPostFields(post, [kind, weight], [num("weight", "11")], ["ホール"]),
    ).toEqual({ fields: [num("weight", "11")], tags: ["ホール"] });
  });

  it("archived 項目の値は sanitize で残る", () => {
    const old: FieldDef = { ...memo, archived: true };
    const post: Post = { fields: [text("memo", "雨")] };
    expect(
      buildEditedPostFields(post, [old, weight], [text("memo", "雨"), num("weight", "1")], []),
    ).toEqual({ fields: [text("memo", "雨"), num("weight", "1")], tags: undefined });
  });

  it("入力できる項目が無いスレッドでは fields を触らない", () => {
    const post: Post = { fields: [num("x", "1")], tags: ["ホール"] };
    expect(buildEditedPostFields(post, [], [], ["ホール", "ホール"])).toEqual({
      fields: [num("x", "1")],
      tags: ["ホール"],
    });
    const archivedOnly: FieldDef = { ...kind, archived: true };
    expect(buildEditedPostFields({ tags: ["ホール"] }, [archivedOnly], [], ["ホール"])).toEqual({
      fields: undefined,
      tags: ["ホール"],
    });
  });
});

describe("initialFreeTagsForEdit", () => {
  it("tags から読み取った選択肢のタグを外し、自由タグだけ残す", () => {
    expect(
      initialFreeTagsForEdit({ tags: ["HALL", "東京", "ホール", "成功"] }, [kind, result]),
    ).toEqual(["HALL", "東京"]);
  });

  it("fields を持つ post・入力できる項目が無いスレッドではタグをそのまま返す", () => {
    expect(
      initialFreeTagsForEdit({ tags: ["ホール"], fields: [] }, [kind]),
    ).toEqual(["ホール"]);
    expect(
      initialFreeTagsForEdit({ tags: ["ホール"] }, [{ ...kind, archived: true }]),
    ).toEqual(["ホール"]);
  });
});

describe("stripSelectedOptionTags", () => {
  it("選んだ選択肢の label と一致するタグだけ外す (大文字小文字は区別しない)", () => {
    const area: FieldDef = {
      id: "area",
      label: "地域",
      type: "select",
      options: [
        { id: "tky", label: "Tokyo" },
        { id: "osk", label: "Osaka" },
      ],
    };
    expect(
      stripSelectedOptionTags(["TOKYO", "Osaka", "雨"], [select("area", ["tky"])], [area]),
    ).toEqual(["Osaka", "雨"]);
    expect(stripSelectedOptionTags(["Tokyo"], undefined, [area])).toEqual(["Tokyo"]);
  });
});

// ─── 絞り込みバー ────────────────────────────────────────────

describe("toggleFieldOption", () => {
  it("無ければ足し、あれば外す", () => {
    expect(toggleFieldOption({}, "kind", "hall")).toEqual({ kind: ["hall"] });
    expect(toggleFieldOption({ kind: ["hall"] }, "kind", "room")).toEqual({
      kind: ["hall", "room"],
    });
    expect(toggleFieldOption({ kind: ["hall", "room"] }, "kind", "hall")).toEqual({
      kind: ["room"],
    });
  });

  it("空になったキーは削除する", () => {
    const out = toggleFieldOption({ kind: ["hall"], result: ["ok"] }, "kind", "hall");
    expect(out).toEqual({ result: ["ok"] });
    expect("kind" in out).toBe(false);
  });

  it("入力を変更しない", () => {
    const input: FieldSelection = { kind: ["hall"] };
    toggleFieldOption(input, "kind", "room");
    toggleFieldOption(input, "kind", "hall");
    expect(input).toEqual({ kind: ["hall"] });
  });
});

describe("pruneFieldSelection", () => {
  const posts: Post[] = [
    { fields: [select("kind", ["hall"])] },
    { fields: [select("kind", ["room"]), select("result", ["ok"])] },
  ];

  it("定義に無い項目・選択肢を落とす", () => {
    expect(
      pruneFieldSelection({ gone: ["x"], kind: ["hall", "nope"] }, [kind, result], posts),
    ).toEqual({ kind: ["hall"] });
  });

  it("select 以外の項目 id は落とす", () => {
    expect(pruneFieldSelection({ weight: ["1"] }, [kind, weight], posts)).toEqual({});
  });

  it("全投稿で件数 0 の選択肢を落とす。空になった項目はキーごと消す", () => {
    expect(
      pruneFieldSelection({ kind: ["walk"], result: ["ng"] }, [kind, result], posts),
    ).toEqual({});
  });

  it("FIELD_UNSET は未設定 > 0 のときだけ残す", () => {
    expect(pruneFieldSelection({ result: [FIELD_UNSET] }, [kind, result], posts)).toEqual({
      result: [FIELD_UNSET],
    });
    expect(pruneFieldSelection({ kind: [FIELD_UNSET] }, [kind, result], posts)).toEqual({});
  });

  it("変化が無ければ同じ参照を返す", () => {
    const sel: FieldSelection = { kind: ["hall", "room"], result: [FIELD_UNSET] };
    expect(pruneFieldSelection(sel, [kind, result], posts)).toBe(sel);
    const empty: FieldSelection = {};
    expect(pruneFieldSelection(empty, [kind], posts)).toBe(empty);
  });

  it("defs が空なら {}", () => {
    expect(pruneFieldSelection({ kind: ["hall"] }, [], posts)).toEqual({});
  });
});

describe("countFreeTags", () => {
  it("選択肢と一致するタグ (大文字小文字違い含む) を除く", () => {
    const area: FieldDef = {
      id: "area",
      label: "地域",
      type: "select",
      options: [{ id: "tky", label: "Tokyo" }],
    };
    const posts: Post[] = [{ tags: ["TOKYO", "雨"] }, { tags: ["tokyo"] }, { tags: ["雨"] }];
    expect(countFreeTags(posts, [area])).toEqual([{ tag: "雨", key: "雨", count: 2 }]);
  });

  it("fields: [] の投稿のタグは残る", () => {
    const posts: Post[] = [{ tags: ["ホール", "東京"], fields: [] }, { tags: ["ホール"] }];
    expect(countFreeTags(posts, [kind])).toEqual([
      { tag: "ホール", key: "ホール", count: 1 },
      { tag: "東京", key: "東京", count: 1 },
    ]);
  });

  it("defs が空なら countTags と同じ", () => {
    const posts: Post[] = [{ tags: ["b", "a"] }, { tags: ["A"] }, {}];
    expect(countFreeTags(posts, [])).toEqual(countTags(posts));
  });
});

describe("fieldFilterGroups", () => {
  const kind2: FieldDef = {
    id: "kind",
    label: "種類",
    type: "select",
    multiple: true,
    options: [
      { id: "old", label: "旧", archived: true },
      { id: "hall", label: "ホール" },
      { id: "room", label: "ルーム" },
      { id: "none", label: "誰も使わない" },
    ],
  };
  const posts: Post[] = [
    { fields: [select("kind", ["hall"]), select("result", ["ok"])], tags: ["東京"] },
    { fields: [select("kind", ["hall", "room"]), select("result", ["ng"])] },
    { fields: [select("kind", ["old"]), select("result", ["ok"])], tags: ["東京"] },
    { fields: [select("result", ["ok"])] },
    { fields: [] },
  ];
  const defs = [kind2, weight, result];
  const unusedSel: FieldDef = {
    id: "u",
    label: "未使用",
    type: "select",
    options: [{ id: "x", label: "x" }],
  };

  it("select 以外を無視し、定義順・options 順 (archived は後ろ)・FIELD_UNSET 末尾", () => {
    const groups = fieldFilterGroups(posts, defs, {}, []);
    expect(groups.map((g) => g.field.id)).toEqual(["kind", "result"]);
    expect(groups[0].chips.map((c) => c.optionId)).toEqual([
      "hall",
      "room",
      "old",
      FIELD_UNSET,
    ]);
    expect(groups[0].chips.find((c) => c.optionId === "old")?.archived).toBe(true);
    expect(groups[0].chips.at(-1)).toMatchObject({ label: "未設定", total: 2 });
    expect(groups[1].chips.map((c) => c.optionId)).toEqual(["ok", "ng", FIELD_UNSET]);
  });

  it("total 0 のチップは出ない。選択中なら出る", () => {
    expect(
      fieldFilterGroups(posts, defs, {}, [])[0].chips.some((c) => c.optionId === "none"),
    ).toBe(false);
    const chip = fieldFilterGroups(posts, defs, { kind: ["none"] }, [])[0].chips.find(
      (c) => c.optionId === "none",
    );
    expect(chip).toMatchObject({ total: 0, count: 0, active: true, disabled: false });
  });

  it("count は他項目 + タグを当てた数で、自項目の選択は当てない", () => {
    const groups = fieldFilterGroups(posts, defs, { kind: ["hall"], result: ["ok"] }, []);
    const kindChips = new Map(groups[0].chips.map((c) => [c.optionId, c]));
    // result=ok の 3 件 (hall / old / 未設定) に対する件数
    expect(kindChips.get("hall")).toMatchObject({ total: 2, count: 1, active: true });
    expect(kindChips.get("room")).toMatchObject({ total: 1, count: 0, disabled: true });
    expect(kindChips.get("old")).toMatchObject({ count: 1, disabled: false });
    expect(kindChips.get(FIELD_UNSET)).toMatchObject({ count: 1 });
    // kind=hall の 2 件に対する件数
    const resultChips = new Map(groups[1].chips.map((c) => [c.optionId, c]));
    expect(resultChips.get("ok")?.count).toBe(1);
    expect(resultChips.get("ng")?.count).toBe(1);

    const withTag = fieldFilterGroups(posts, defs, {}, ["東京"]);
    const tagged = new Map(withTag[0].chips.map((c) => [c.optionId, c.count]));
    expect(tagged.get("hall")).toBe(1);
    expect(tagged.get("room")).toBe(0);
    expect(tagged.get("old")).toBe(1);
  });

  it("1 つだけの select で 2 値以上持つ旧投稿は全値を数える", () => {
    const groups = fieldFilterGroups(
      [{ fields: [select("kind", ["hall", "room"])] }],
      [kind],
      {},
      [],
    );
    expect(groups[0].chips.map((c) => [c.optionId, c.total])).toEqual([
      ["hall", 1],
      ["room", 1],
    ]);
  });

  it("chips が空の項目は返さない / defs 空なら []", () => {
    const unused: FieldDef = {
      id: "u",
      label: "未使用",
      type: "select",
      options: [{ id: "x", label: "x" }],
    };
    expect(fieldFilterGroups([], [unused], {}, [])).toEqual([]);
    expect(fieldFilterGroups(posts, [], {}, [])).toEqual([]);
  });

  it("fields: [] の投稿は選択肢名と同じタグがあっても項目側に数えない", () => {
    const tagOnly: Post[] = [{ tags: ["ホール"], fields: [] }];
    // 値が無いので項目ごと出ない
    expect(fieldFilterGroups(tagOnly, [kind], {}, [])).toEqual([]);
    const groups = fieldFilterGroups(tagOnly, [kind], { kind: [FIELD_UNSET] }, []);
    expect(groups[0].chips.map((c) => c.optionId)).toEqual([FIELD_UNSET]);
  });

  it("値の無い項目 (未設定だけ) は出ない", () => {
    const groups = fieldFilterGroups(posts, [kind2, result, unusedSel], {}, []);
    expect(groups.map((g) => g.field.id)).toEqual(["kind", "result"]);
  });

  it("値の無い項目でも未設定を選択中なら出る", () => {
    const groups = fieldFilterGroups(
      posts,
      [kind2, result, unusedSel],
      { u: [FIELD_UNSET] },
      [],
    );
    expect(groups.map((g) => g.field.id)).toEqual(["kind", "result", "u"]);
    expect(groups[2].chips).toEqual([
      expect.objectContaining({ optionId: FIELD_UNSET, total: 5, active: true }),
    ]);
  });

  it("archived 項目は出ない。選択中なら出る", () => {
    const archivedResult: FieldDef = { ...result, archived: true };
    expect(
      fieldFilterGroups(posts, [kind2, archivedResult], {}, []).map((g) => g.field.id),
    ).toEqual(["kind"]);
    const groups = fieldFilterGroups(posts, [kind2, archivedResult], { result: ["ng"] }, []);
    expect(groups.map((g) => g.field.id)).toEqual(["kind", "result"]);
    expect(groups[1].chips.find((c) => c.optionId === "ng")).toMatchObject({
      active: true,
      total: 1,
    });
  });

  it("他項目の絞り込みで 0 件になった項目は出る", () => {
    // result=ng の投稿 (kind: hall + room) に絞ると、color の値はどれも 0 件になる
    const color: FieldDef = {
      id: "color",
      label: "色",
      type: "select",
      options: [{ id: "red", label: "赤" }],
    };
    const withColor: Post[] = [
      ...posts,
      { fields: [select("color", ["red"]), select("result", ["ok"])] },
    ];
    const groups = fieldFilterGroups(withColor, [result, color], { result: ["ng"] }, []);
    expect(groups.map((g) => g.field.id)).toEqual(["result", "color"]);
    expect(groups[1].chips.find((c) => c.optionId === "red")).toMatchObject({
      total: 1,
      count: 0,
      disabled: true,
    });
  });
});

describe("freeTagChips", () => {
  const posts: Post[] = [
    { fields: [select("kind", ["hall"])], tags: ["東京", "雨"] },
    { fields: [select("kind", ["room"])], tags: ["東京"] },
    { fields: [], tags: ["大阪"] },
  ];

  it("facetCount が項目の選択を反映し、0 件なら disabled", () => {
    const chips = freeTagChips(posts, [kind], { kind: ["hall"] }, []);
    const byKey = new Map(chips.map((c) => [c.key, c]));
    expect(chips.map((c) => c.key)).toEqual(["東京", "大阪", "雨"]);
    expect(byKey.get("東京")).toMatchObject({ count: 2, facetCount: 1, disabled: false });
    expect(byKey.get("大阪")).toMatchObject({ count: 1, facetCount: 0, disabled: true });
  });

  it("選択中は facetCount に関わらず disabled にならない", () => {
    const chips = freeTagChips(posts, [kind], { kind: ["hall"] }, ["大阪"]);
    expect(chips.find((c) => c.key === "大阪")).toMatchObject({
      active: true,
      disabled: false,
      facetCount: 0,
    });
  });
});

describe("filterPostsByFieldsAndTags", () => {
  const posts: Post[] = [
    { fields: [select("kind", ["hall"])], tags: ["東京"] },
    { fields: [select("kind", ["hall"])] },
    { fields: [select("kind", ["room"])], tags: ["東京"] },
  ];

  it("両方空なら同じ参照", () => {
    expect(filterPostsByFieldsAndTags(posts, [kind], {}, [])).toBe(posts);
  });

  it("項目とタグは AND", () => {
    expect(
      filterPostsByFieldsAndTags(posts, [kind], { kind: ["hall"] }, ["東京"]),
    ).toEqual([posts[0]]);
    expect(
      filterPostsByFieldsAndTags(posts, [kind], { kind: ["hall", "room"] }, ["東京"]),
    ).toEqual([posts[0], posts[2]]);
  });
});

describe("範囲絞り込み (#74)", () => {
  const height: FieldDef = { id: "height", label: "高さ", type: "number" };
  const oldNum: FieldDef = { id: "oldnum", label: "旧数値", type: "number", archived: true };

  describe("isRangeField", () => {
    it("number だけ。duration・select・text は対象外", () => {
      expect(isRangeField(weight)).toBe(true);
      expect(isRangeField(time)).toBe(false);
      expect(isRangeField(kind)).toBe(false);
      expect(isRangeField(memo)).toBe(false);
    });
  });

  describe("parseRangeBound", () => {
    it("number", () => {
      expect(parseRangeBound("80", weight)).toBe(80);
      expect(parseRangeBound(" 12.5 ", weight)).toBe(12.5);
      expect(parseRangeBound("-5", weight)).toBe(-5);
      expect(parseRangeBound("", weight)).toBeNull();
      expect(parseRangeBound("  ", weight)).toBeNull();
      expect(parseRangeBound("abc", weight)).toBe("invalid");
      expect(parseRangeBound("1e3", weight)).toBe("invalid");
      expect(parseRangeBound("1".repeat(33), weight)).toBe("invalid");
    });
    it("全角数字は NFKC 正規化してから解釈する", () => {
      expect(parseRangeBound("８０", weight)).toBe(80);
      expect(parseRangeBound("　１２．５　", weight)).toBe(12.5);
      expect(parseRangeBound("　", weight)).toBeNull();
    });
    it("範囲項目でない def は常に invalid", () => {
      expect(parseRangeBound("1", kind)).toBe("invalid");
      expect(parseRangeBound("1", time)).toBe("invalid");
      expect(parseRangeBound("", memo)).toBe("invalid");
    });
  });

  describe("effectiveRange", () => {
    it("両方空・入力なしなら null", () => {
      expect(effectiveRange({ min: "", max: " " }, weight)).toBeNull();
      expect(effectiveRange(undefined, weight)).toBeNull();
    });
    it("片側だけ", () => {
      expect(effectiveRange({ min: "80", max: "" }, weight)).toEqual({ min: 80, max: null });
    });
    it("不正な側は無視する", () => {
      expect(effectiveRange({ min: "80", max: "abc" }, weight)).toEqual({ min: 80, max: null });
      expect(effectiveRange({ min: "abc", max: "abc" }, weight)).toBeNull();
    });
  });

  describe("numericValueOf", () => {
    it("number の値", () => {
      expect(numericValueOf({ fields: [num("weight", "80.5")] }, weight)).toBe(80.5);
    });
    it("不正な decimal・値なし・tags のみの投稿は null", () => {
      expect(numericValueOf({ fields: [num("weight", "1e3")] }, weight)).toBeNull();
      expect(numericValueOf({ fields: [] }, weight)).toBeNull();
      expect(numericValueOf({ tags: ["80"] }, weight)).toBeNull();
    });
    it("duration は対象外なので null", () => {
      expect(numericValueOf({ fields: [dur("time", 90)] }, time)).toBeNull();
    });
  });

  describe("setRangeBound", () => {
    it("追加 / 片側だけ空に / 両方空でキー削除。入力は変更しない", () => {
      const empty: RangeSelection = {};
      const a = setRangeBound(empty, "weight", "min", "80");
      expect(a).toEqual({ weight: { min: "80", max: "" } });
      expect(empty).toEqual({});
      const b = setRangeBound(a, "weight", "max", "90");
      expect(b).toEqual({ weight: { min: "80", max: "90" } });
      const c = setRangeBound(b, "weight", "min", "");
      expect(c).toEqual({ weight: { min: "", max: "90" } });
      expect(b).toEqual({ weight: { min: "80", max: "90" } });
      expect(setRangeBound(c, "weight", "max", "")).toEqual({});
    });
    it("空白だけの入力は空として扱う", () => {
      const a = setRangeBound({}, "weight", "min", "  ");
      expect(a).toEqual({});
      expect(hasRangeInput(a)).toBe(false);
      expect(
        setRangeBound({ weight: { min: "", max: "90" } }, "weight", "max", "  "),
      ).toEqual({});
      expect(
        setRangeBound({ weight: { min: "80", max: "" } }, "weight", "max", "  "),
      ).toEqual({ weight: { min: "80", max: "" } });
    });
  });

  describe("pruneRangeSelection", () => {
    it("定義に無い id・範囲項目でない id・archived・両方空を落とす", () => {
      const ranges: RangeSelection = {
        weight: { min: "1", max: "" },
        gone: { min: "1", max: "" },
        kind: { min: "1", max: "" },
        time: { min: "1", max: "" },
        oldnum: { min: "1", max: "" },
        height: { min: "", max: "" },
      };
      expect(
        pruneRangeSelection(ranges, [weight, kind, time, oldNum, height]),
      ).toEqual({ weight: { min: "1", max: "" } });
    });
    it("変化が無ければ同じ参照", () => {
      const ranges: RangeSelection = { weight: { min: "abc", max: "" } };
      expect(pruneRangeSelection(ranges, [weight])).toBe(ranges);
    });
  });

  describe("hasRangeInput", () => {
    it("不正値でも true、空なら false", () => {
      expect(hasRangeInput({})).toBe(false);
      expect(hasRangeInput({ weight: { min: "", max: "" } })).toBe(false);
      expect(hasRangeInput({ weight: { min: "", max: "abc" } })).toBe(true);
    });
  });

  describe("filterPostsByRanges", () => {
    const posts: Post[] = [
      { fields: [num("weight", "70"), num("height", "150")] },
      { fields: [num("weight", "80"), num("height", "170")] },
      { fields: [num("weight", "90")] },
      { fields: [num("weight", "100"), num("height", "180")] },
      { fields: [] },
    ];
    const defs = [weight, height];

    it("両端を含み、値の無い投稿は一致しない", () => {
      expect(
        filterPostsByRanges(posts, defs, { weight: { min: "80", max: "" } }),
      ).toEqual([posts[1], posts[2], posts[3]]);
      expect(
        filterPostsByRanges(posts, defs, { weight: { min: "", max: "80" } }),
      ).toEqual([posts[0], posts[1]]);
      expect(
        filterPostsByRanges(posts, defs, { weight: { min: "80", max: "90" } }),
      ).toEqual([posts[1], posts[2]]);
    });
    it("項目間 AND", () => {
      expect(
        filterPostsByRanges(posts, defs, {
          weight: { min: "80", max: "" },
          height: { min: "160", max: "" },
        }),
      ).toEqual([posts[1], posts[3]]);
    });
    it("条件なし・不正入力だけなら同じ参照", () => {
      expect(filterPostsByRanges(posts, defs, {})).toBe(posts);
      expect(
        filterPostsByRanges(posts, defs, { weight: { min: "abc", max: "" } }),
      ).toBe(posts);
    });
    it("不正な側は無視して有効な側だけ当てる", () => {
      expect(
        filterPostsByRanges(posts, defs, { weight: { min: "95", max: "abc" } }),
      ).toEqual([posts[3]]);
    });
  });

  describe("rangeFilterRows", () => {
    const posts: Post[] = [
      { fields: [select("kind", ["hall"]), num("weight", "70"), num("height", "150")], tags: ["東京"] },
      { fields: [select("kind", ["hall"]), num("weight", "80"), num("height", "170")] },
      { fields: [select("kind", ["room"]), num("weight", "90")], tags: ["東京"] },
      { fields: [select("kind", ["room"]), num("oldnum", "1")] },
      { fields: [] },
    ];
    const unused: FieldDef = { id: "unused", label: "未使用", type: "number" };
    const defs = [kind, height, time, oldNum, unused, weight];

    it("定義順。archived・値なしで入力も空なら出ない。duration は出ない", () => {
      const rows = rangeFilterRows(posts, defs, {}, [], {});
      expect(rows.map((r) => r.field.id)).toEqual(["height", "weight"]);
      expect(rows[0]).toMatchObject({
        input: EMPTY_RANGE_INPUT,
        active: false,
        invalid: { min: false, max: false },
        span: { min: 150, max: 170 },
        count: 5,
        withValue: 2,
      });
    });
    it("入力があれば archived・値なしでも出る", () => {
      const rows = rangeFilterRows(posts, defs, {}, [], {
        oldnum: { min: "1", max: "" },
        unused: { min: "", max: "x" },
      });
      expect(rows.map((r) => r.field.id)).toEqual(["height", "oldnum", "unused", "weight"]);
      expect(rows[2]).toMatchObject({
        span: null,
        active: false,
        invalid: { min: false, max: true },
      });
    });
    it("span は全投稿基準、count は他条件 (select・タグ・他項目の範囲) を当て自項目の範囲で数える", () => {
      const ranges: RangeSelection = {
        weight: { min: "80", max: "" },
        height: { min: "160", max: "" },
      };
      const rows = rangeFilterRows(posts, defs, { kind: ["hall"] }, [], ranges);
      const w = rows.find((r) => r.field.id === "weight")!;
      // hall かつ height >= 160 → posts[1] だけ。その中で weight >= 80 は 1
      expect(w).toMatchObject({ span: { min: 70, max: 90 }, active: true, count: 1, withValue: 1 });
      const h = rows.find((r) => r.field.id === "height")!;
      // hall かつ weight >= 80 → posts[1]。height >= 160 は 1
      expect(h).toMatchObject({ span: { min: 150, max: 170 }, count: 1, withValue: 1 });

      const tagged = rangeFilterRows(posts, defs, {}, [tagKey("東京")], {
        weight: { min: "80", max: "" },
      });
      // 東京 → posts[0], posts[2]。weight >= 80 は posts[2]
      expect(tagged.find((r) => r.field.id === "weight")).toMatchObject({
        count: 1,
        withValue: 2,
      });
    });
  });

  describe("既存関数に ranges を渡す", () => {
    const posts: Post[] = [
      { fields: [select("kind", ["hall"]), num("weight", "70")], tags: ["東京"] },
      { fields: [select("kind", ["hall"]), num("weight", "90")], tags: ["東京"] },
      { fields: [select("kind", ["room"]), num("weight", "95")] },
    ];
    const defs = [kind, weight];
    const ranges: RangeSelection = { weight: { min: "80", max: "" } };

    it("fieldFilterGroups: 件数が範囲を反映し、省略時は従来どおり", () => {
      const counts = (g: ReturnType<typeof fieldFilterGroups>) =>
        Object.fromEntries(g[0].chips.map((c) => [c.optionId, c.count]));
      expect(counts(fieldFilterGroups(posts, defs, {}, []))).toEqual({ hall: 2, room: 1 });
      expect(counts(fieldFilterGroups(posts, defs, {}, [], ranges))).toEqual({ hall: 1, room: 1 });
      expect(fieldFilterGroups(posts, defs, {}, [], {})).toEqual(
        fieldFilterGroups(posts, defs, {}, []),
      );
    });
    it("freeTagChips: facetCount が範囲を反映する", () => {
      expect(freeTagChips(posts, defs, {}, [])[0].facetCount).toBe(2);
      expect(freeTagChips(posts, defs, {}, [], ranges)[0].facetCount).toBe(1);
    });
    it("filterPostsByFieldsAndTags: 項目 → タグ → 範囲。すべて空なら同じ参照", () => {
      expect(filterPostsByFieldsAndTags(posts, defs, {}, [], {})).toBe(posts);
      expect(
        filterPostsByFieldsAndTags(posts, defs, { kind: ["hall"] }, ["東京"], ranges),
      ).toEqual([posts[1]]);
      expect(filterPostsByFieldsAndTags(posts, defs, {}, [], ranges)).toEqual([
        posts[1],
        posts[2],
      ]);
    });
  });

  describe("formatRangeBound", () => {
    it("String(n)", () => {
      expect(formatRangeBound(12.5)).toBe("12.5");
      expect(formatRangeBound(80)).toBe("80");
    });
  });
});

describe("投稿画面からの選択肢追加", () => {
  const place: FieldDef = {
    id: "place",
    label: "場所",
    type: "select",
    options: [
      { id: "tokyo", label: "東京" },
      { id: "old", label: "大阪", archived: true },
    ],
  };
  const pending = (fieldId: string, id: string, label: string) => ({
    fieldId,
    option: { id, label },
  });

  describe("findOptionByLabel", () => {
    it("前後空白・先頭の # を除いて一致する archived でない選択肢を返す", () => {
      expect(findOptionByLabel([{ id: "a", label: "温泉" }], " #温泉 ")?.id).toBe(
        "a",
      );
    });
    it("大文字小文字は区別しない (ABC がある所に abc → 既存を選ぶ)", () => {
      expect(findOptionByLabel([{ id: "a", label: "ABC" }], "abc")?.id).toBe("a");
    });
    it("archived でない選択肢が無ければ archived の選択肢を返す", () => {
      expect(findOptionByLabel(place.options!, "大阪")?.id).toBe("old");
    });
    it("archived と archived でない両方があれば archived でない方を返す", () => {
      const options = [
        { id: "a", label: "大阪", archived: true },
        { id: "b", label: "大阪" },
      ];
      expect(findOptionByLabel(options, "大阪")?.id).toBe("b");
    });
    it("一致しなければ undefined", () => {
      expect(findOptionByLabel(place.options!, "京都")).toBeUndefined();
    });
  });

  it("mergePendingOptions は項目の末尾に足し、元の定義は変えない", () => {
    const merged = mergePendingOptions([place, kind], [pending("place", "p1", "京都")]);
    expect(merged[0].options!.map((o) => o.id)).toEqual(["tokyo", "old", "p1"]);
    expect(merged[1]).toBe(kind);
    expect(place.options).toHaveLength(2);
  });

  it("mergePendingOptions は unarchive の選択肢の archived を外す (末尾には足さない)", () => {
    const merged = mergePendingOptions(
      [place],
      [{ ...pending("place", "old", "大阪"), unarchive: true }],
    );
    expect(merged[0].options).toEqual([
      { id: "tokyo", label: "東京" },
      { id: "old", label: "大阪" },
    ]);
    expect(place.options![1].archived).toBe(true);
  });

  it("selectedPendingOptions は選ばれていないものを落とす", () => {
    const p = [pending("place", "p1", "京都"), pending("place", "p2", "奈良")];
    expect(selectedPendingOptions(p, [select("place", ["p2"])])).toEqual([p[1]]);
    expect(selectedPendingOptions(p, [])).toEqual([]);
  });

  describe("appendPendingOptions", () => {
    it("末尾に追加する", () => {
      const res = appendPendingOptions([place, kind], [pending("place", "p1", "京都")]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.fields[0].options).toEqual([
        ...place.options!,
        { id: "p1", label: "京都" },
      ]);
      expect(res.idMap.get("p1")).toBe("p1");
      expect(place.options).toHaveLength(2);
    });

    it("同じ名前の既存の選択肢があればその id を使う", () => {
      const res = appendPendingOptions([place], [pending("place", "p1", " 東京 ")]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.fields[0].options).toHaveLength(2);
      expect(res.idMap.get("p1")).toBe("tokyo");
    });

    const unarchiveOld = { ...pending("place", "old", "大阪"), unarchive: true };

    it("unarchive: fresh でも archived なら archived を外して既存 id を使う", () => {
      const res = appendPendingOptions([place], [unarchiveOld]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.fields[0].options).toEqual([
        { id: "tokyo", label: "東京" },
        { id: "old", label: "大阪" },
      ]);
      expect(res.idMap.get("old")).toBe("old");
      expect(place.options![1].archived).toBe(true);
    });

    it("unarchive: fresh で既に archived でなければそのまま使う", () => {
      const restored: FieldDef = {
        ...place,
        options: [{ id: "tokyo", label: "東京" }, { id: "old", label: "大阪" }],
      };
      const res = appendPendingOptions([restored], [unarchiveOld]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.fields[0].options).toEqual(restored.options);
      expect(res.idMap.get("old")).toBe("old");
    });

    it("新規の追加待ちでも、fresh で同じ名前が archived されていれば外して使う", () => {
      const res = appendPendingOptions([place], [pending("place", "p1", "大阪")]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.fields[0].options!.map((o) => [o.id, o.archived])).toEqual([
        ["tokyo", undefined],
        ["old", undefined],
      ]);
      expect(res.idMap.get("p1")).toBe("old");
    });

    it("archived を外すだけなら選択肢数の上限で止めない", () => {
      const full: FieldDef = {
        ...place,
        options: Array.from({ length: MAX_FIELD_OPTIONS }, (_, i) => ({
          id: i === 0 ? "old" : `o${i}`,
          label: i === 0 ? "大阪" : `選択肢${i}`,
          archived: i === 0 ? true : undefined,
        })),
      };
      const res = appendPendingOptions([full], [unarchiveOld]);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.fields[0].options).toHaveLength(MAX_FIELD_OPTIONS);
      expect(res.fields[0].options![0]).toEqual({ id: "old", label: "大阪" });
    });

    it("項目が無ければ失敗", () => {
      expect(appendPendingOptions([kind], [pending("place", "p1", "京都")])).toEqual({
        ok: false,
        reason: "missing",
        fieldId: "place",
      });
    });

    it("項目が archived なら失敗", () => {
      expect(
        appendPendingOptions(
          [{ ...place, archived: true }],
          [pending("place", "p1", "京都")],
        ),
      ).toEqual({ ok: false, reason: "archived", fieldId: "place" });
    });

    it("選択肢数が上限なら失敗", () => {
      const full: FieldDef = {
        ...place,
        options: Array.from({ length: MAX_FIELD_OPTIONS }, (_, i) => ({
          id: `o${i}`,
          label: `選択肢${i}`,
        })),
      };
      expect(appendPendingOptions([full], [pending("place", "p1", "京都")])).toEqual({
        ok: false,
        reason: "full",
        fieldId: "place",
      });
    });
  });

  it("remapSelectValues は select の id を置き換えて重複をまとめる", () => {
    const idMap = new Map([["p1", "tokyo"]]);
    expect(
      remapSelectValues([select("place", ["tokyo", "p1"]), num("result", "1")], idMap),
    ).toEqual([select("place", ["tokyo"]), num("result", "1")]);
  });
});
