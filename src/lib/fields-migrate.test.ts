import { describe, expect, it, vi } from "vitest";

// 実 PDS に書かないよう、既定の write (rewritePost) は必ず落ちるモックにしておく
vi.mock("@/lib/pds/posts", () => ({
  rewritePost: vi.fn(async () => {
    throw new Error("rewritePost must not be called in tests");
  }),
}));

import {
  migratedPostRecord,
  migrationFailureMessage,
  migrationRowTitle,
  planFieldMigration,
  planFieldMigrations,
  runFieldMigration,
  type MigrationPlan,
  type MigrationProgress,
} from "@/lib/fields-migrate";
import {
  buildEditedPostFields,
  buildImportedPostFields,
  fieldValuesFromResolved,
  resolveFieldValues,
} from "@/lib/fields";
import type { FieldDef, FieldValue, PostWithMeta } from "@/lib/types";

const ME = "did:plc:me";
const OTHER = "did:plc:other";

const select = (field: string, options: string[]): FieldValue => ({
  $type: "net.shino3.trailcast.post#selectValue",
  field,
  options,
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
  multiple: false,
  options: [
    { id: "ok", label: "成功" },
    { id: "ng", label: "失敗" },
  ],
};
const defs = [kind, result];

let seq = 0;
function post(
  over: Partial<PostWithMeta> & { repo?: string } = {},
): PostWithMeta {
  const { repo = ME, ...rest } = over;
  const rkey = rest.rkey ?? `r${++seq}`;
  return {
    thread: `at://${ME}/net.shino3.trailcast.thread/t1`,
    text: "タイトル\n本文",
    checkpointAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    uri: `at://${repo}/net.shino3.trailcast.post/${rkey}`,
    cid: `cid-${rkey}`,
    rkey,
    ...rest,
  };
}

function plan(p: PostWithMeta): MigrationPlan {
  const out = planFieldMigration(p, defs);
  if (!out) throw new Error("expected a plan");
  return out;
}

describe("planFieldMigration", () => {
  it("tags だけで一致がある投稿は対象。選択肢のタグを fields に移す", () => {
    const p = post({ tags: ["ホール", "東京", "成功"] });
    const out = plan(p);
    expect(out.fields).toEqual([select("kind", ["hall"]), select("result", ["ok"])]);
    expect(out.tags).toEqual(["東京"]);
    expect(out.movedTags).toEqual(["ホール", "成功"]);
    expect(out.moved.map((m) => [m.field.id, m.labels])).toEqual([
      ["kind", ["ホール"]],
      ["result", ["成功"]],
    ]);
  });

  it("一致するタグが無い投稿は対象外 (fields: [] を書かない)", () => {
    expect(planFieldMigration(post({ tags: ["東京"] }), defs)).toBeNull();
    expect(planFieldMigration(post({}), defs)).toBeNull();
  });

  it("入力できる項目が無い (全項目 archived) なら対象外", () => {
    const archived = defs.map((d) => ({ ...d, archived: true }));
    expect(planFieldMigration(post({ tags: ["ホール"] }), archived)).toBeNull();
  });

  it("自由タグだけが残る。全部移れば tags は undefined", () => {
    expect(plan(post({ tags: ["東京", "ルーム", "夜"] })).tags).toEqual(["東京", "夜"]);
    expect(plan(post({ tags: ["ルーム"] })).tags).toBeUndefined();
  });

  it("1 つだけの select に 2 つ一致すると両方残り、両タグが外れる", () => {
    const out = plan(post({ tags: ["成功", "失敗"] }));
    expect(out.fields).toEqual([select("result", ["ok", "ng"])]);
    expect(out.tags).toBeUndefined();
    expect(out.movedTags).toEqual(["成功", "失敗"]);
  });

  it("大文字小文字違いのタグも外れる (元の表記で movedTags に入る)", () => {
    const en: FieldDef = {
      id: "day",
      label: "日",
      type: "select",
      options: [{ id: "d2", label: "Day2" }],
    };
    const out = planFieldMigration(post({ tags: ["day2", "free"] }), [en]);
    expect(out?.fields).toEqual([select("day", ["d2"])]);
    expect(out?.tags).toEqual(["free"]);
    expect(out?.movedTags).toEqual(["day2"]);
  });

  it("archived の選択肢に一致するタグも移る", () => {
    const out = plan(post({ tags: ["周遊"] }));
    expect(out.fields).toEqual([select("kind", ["walk"])]);
    expect(out.moved).toEqual([{ field: kind, labels: ["周遊"] }]);
  });

  it("moved は項目の定義順 (タグの順ではない)", () => {
    const out = plan(post({ tags: ["失敗", "ルーム"] }));
    expect(out.moved.map((m) => m.field.id)).toEqual(["kind", "result"]);
  });

  it("結果の fields / tags は buildEditedPostFields と同一", () => {
    const cases = [
      ["ホール", "東京", "成功"],
      ["成功", "失敗", "#夜"],
      ["ルーム", "ホール", "周遊"],
      ["HALL", "ルーム"],
    ];
    for (const tags of cases) {
      const p = post({ tags });
      const out = planFieldMigration(p, defs);
      if (!out) continue;
      const expected = buildEditedPostFields(
        p,
        defs,
        fieldValuesFromResolved(resolveFieldValues(p, defs)),
        p.tags ?? [],
      );
      expect(JSON.stringify({ fields: out.fields, tags: out.tags })).toBe(
        JSON.stringify(expected),
      );
    }
  });
});

describe("planFieldMigration (fields あり, #104)", () => {
  const tagsDef: FieldDef = {
    id: "tags",
    label: "分類",
    type: "select",
    multiple: true,
    options: [
      { id: "solved", label: "解けた" },
      { id: "hint", label: "ヒント" },
      { id: "old", label: "旧", archived: true },
    ],
  };
  const all = [tagsDef, result];

  it("fields: [] + 一致 1 件 (multiple) を書き、タグを外す。自由タグは残る", () => {
    const out = planFieldMigration(post({ tags: ["解けた", "東京"], fields: [] }), all);
    expect(out?.fields).toEqual([select("tags", ["solved"])]);
    expect(out?.tags).toEqual(["東京"]);
    expect(out?.movedTags).toEqual(["解けた"]);
    expect(out?.moved).toEqual([{ field: tagsDef, labels: ["解けた"] }]);
  });

  it("multiple は既存の選択 + 一致 (定義順) を書く", () => {
    const p = post({
      tags: ["ヒント", "解けた"],
      fields: [select("result", ["ok"]), select("tags", ["hint"])],
    });
    const out = planFieldMigration(p, all);
    expect(out?.fields).toEqual([select("result", ["ok"]), select("tags", ["hint", "solved"])]);
    expect(out?.tags).toBeUndefined();
    expect(out?.movedTags).toEqual(["ヒント", "解けた"]);
    expect(out?.moved).toEqual([{ field: tagsDef, labels: ["解けた", "ヒント"] }]);
  });

  it("single で値なし + 一致 1 件なら書く (値なし / options: [] の両方)", () => {
    for (const fields of [[], [select("result", [])]]) {
      const out = planFieldMigration(post({ tags: ["成功", "夜"], fields }), all);
      expect(out?.fields).toEqual([select("result", ["ok"])]);
      expect(out?.tags).toEqual(["夜"]);
      expect(out?.movedTags).toEqual(["成功"]);
    }
  });

  it("single で別の値があれば null (上書きしない)", () => {
    const p = post({ tags: ["成功"], fields: [select("result", ["ng"])] });
    expect(planFieldMigration(p, all)).toBeNull();
  });

  it("single に 2 件一致すれば null (決めない)", () => {
    expect(planFieldMigration(post({ tags: ["成功", "失敗"], fields: [] }), all)).toBeNull();
  });

  it("single をスキップしても他の項目は書く。スキップした項目のタグは残る", () => {
    const p = post({ tags: ["成功", "失敗", "解けた"], fields: [] });
    const out = planFieldMigration(p, all);
    expect(out?.fields).toEqual([select("tags", ["solved"])]);
    expect(out?.tags).toEqual(["成功", "失敗"]);
    expect(out?.moved.map((m) => m.field.id)).toEqual(["tags"]);
  });

  it("一致する選択肢が archived なら null", () => {
    expect(planFieldMigration(post({ tags: ["旧"], fields: [] }), all)).toBeNull();
  });

  it("項目が archived なら null", () => {
    const archived = [{ ...tagsDef, archived: true }];
    expect(planFieldMigration(post({ tags: ["解けた"], fields: [] }), archived)).toBeNull();
  });

  it("既に選択済みの選択肢と同名のタグは tags から外すだけ (fields は変わらない)", () => {
    const fields = [select("result", ["ok"])];
    const out = planFieldMigration(post({ tags: ["成功", "東京"], fields }), all);
    expect(out?.fields).toEqual(fields);
    expect(out?.tags).toEqual(["東京"]);
    expect(out?.movedTags).toEqual(["成功"]);
    expect(out?.moved).toEqual([{ field: result, labels: ["成功"] }]);
  });

  it("single で選択済みと同名のタグは外し、別の一致は残す", () => {
    const fields = [select("result", ["ok"])];
    const out = planFieldMigration(post({ tags: ["成功", "失敗"], fields }), all);
    expect(out?.fields).toEqual(fields);
    expect(out?.tags).toEqual(["失敗"]);
  });

  it("一致するタグが無い・タグが無いなら null", () => {
    expect(planFieldMigration(post({ tags: ["東京"], fields: [] }), all)).toBeNull();
    expect(planFieldMigration(post({ fields: [] }), all)).toBeNull();
  });

  it("大文字小文字違いのタグも一致し、元の表記で movedTags に入る", () => {
    const en: FieldDef = {
      id: "day",
      label: "日",
      type: "select",
      multiple: true,
      options: [{ id: "d2", label: "Day2" }],
    };
    const out = planFieldMigration(post({ tags: ["day2", "free"], fields: [] }), [en]);
    expect(out?.fields).toEqual([select("day", ["d2"])]);
    expect(out?.tags).toEqual(["free"]);
    expect(out?.movedTags).toEqual(["day2"]);
  });

  it("触らない 1 つだけの select に複数入っていても絞らない", () => {
    const fields = [select("result", ["ok", "ng"])];
    const out = planFieldMigration(post({ tags: ["解けた"], fields }), all);
    expect(out?.fields).toEqual([select("result", ["ok", "ng"]), select("tags", ["solved"])]);
  });

  describe("既存の fields に理解できない値があれば null", () => {
    const memo: FieldDef = { id: "memo", label: "メモ", type: "text" };
    const defs2 = [tagsDef, result, memo];
    const cases: [string, FieldValue[]][] = [
      ["定義に無い項目 (ghost field)", [select("ghost", ["x"])]],
      ["single の未知の選択肢 id", [select("result", ["zzz"])]],
      [
        "text の前後空白",
        [{ $type: "net.shino3.trailcast.post#textValue", field: "memo", text: " 夜 " }],
      ],
      ["書き換える multiple の未知の選択肢 id", [select("tags", ["zzz"])]],
      ["書き換えない multiple の未知の選択肢 id", [select("tags", ["hint", "zzz"])]],
      [
        "未知の $type",
        [{ $type: "net.shino3.trailcast.post#unknown", field: "memo" } as unknown as FieldValue],
      ],
      ["同じ項目の重複", [select("result", ["ok"]), select("result", ["ok"])]],
    ];
    for (const [name, fields] of cases) {
      it(name, () => {
        const p = post({ tags: ["解けた", "ヒント", "成功"], fields });
        expect(planFieldMigration(p, defs2)).toBeNull();
      });
    }

    it("理解できる値だけなら対象 (text もそのまま残る)", () => {
      const text: FieldValue = {
        $type: "net.shino3.trailcast.post#textValue",
        field: "memo",
        text: "夜",
      };
      const out = planFieldMigration(post({ tags: ["解けた"], fields: [text] }), defs2);
      expect(out?.fields).toEqual([text, select("tags", ["solved"])]);
    });
  });

  it("タグは normalizeTag してから突合する (#解けた も一致)", () => {
    const out = planFieldMigration(post({ tags: ["#解けた", " 東京 "], fields: [] }), all);
    expect(out?.fields).toEqual([select("tags", ["solved"])]);
    expect(out?.tags).toEqual(["東京"]);
    expect(out?.movedTags).toEqual(["#解けた"]);
  });

  it("planFieldMigrations でも他人の repo の投稿は除く", () => {
    const mine = post({ tags: ["解けた"], fields: [] });
    const theirs = post({ tags: ["解けた"], fields: [], repo: OTHER });
    expect(planFieldMigrations([mine, theirs], all, ME).map((p) => p.post)).toEqual([mine]);
  });
});

describe("planFieldMigration (同じ名前の選択肢が複数の項目にある)", () => {
  const a: FieldDef = {
    id: "a",
    label: "A",
    type: "select",
    options: [
      { id: "rain", label: "雨" },
      { id: "sun", label: "晴" },
    ],
  };
  const b: FieldDef = {
    id: "b",
    label: "B",
    type: "select",
    options: [{ id: "rain", label: "雨" }],
  };
  const shared: FieldDef[] = [a, b];

  it("同じ tagKey が複数の項目に一致するタグはどの項目にも書かない", () => {
    expect(planFieldMigration(post({ tags: ["雨"], fields: [] }), shared)).toBeNull();
    expect(planFieldMigration(post({ tags: ["雨", "晴"], fields: [] }), shared)).toBeNull();
  });

  it("1 つの項目にだけある名前は書く", () => {
    const out = planFieldMigration(post({ tags: ["晴", "雨"], fields: [] }), [
      { ...a, multiple: true },
      b,
    ]);
    expect(out?.fields).toEqual([select("a", ["sun"])]);
    expect(out?.tags).toEqual(["雨"]);
  });

  it("インポート直後の投稿 (buildImportedPostFields) は移行候補に出ない", () => {
    const cases: [string[], FieldDef[]][] = [
      [["雨", "晴"], shared],
      [["雨"], shared],
      [["晴", "東京"], shared],
      [["ホール", "ルーム", "成功"], defs],
      [["ホール", "東京", "失敗"], defs],
      [["ホール", "ルーム"], [{ ...kind, multiple: true }]],
    ];
    for (const [tags, d] of cases) {
      const imported = buildImportedPostFields(tags, d);
      const p = post({ tags: imported.tags, fields: imported.fields });
      expect(planFieldMigration(p, d), tags.join(",")).toBeNull();
    }
  });
});

describe("planFieldMigrations", () => {
  it("他人の repo の投稿を除く", () => {
    const mine = post({ tags: ["ホール"] });
    const theirs = post({ tags: ["ホール"], repo: OTHER });
    expect(planFieldMigrations([mine, theirs], defs, ME).map((p) => p.post)).toEqual([mine]);
  });

  it("myDid が null なら []", () => {
    expect(planFieldMigrations([post({ tags: ["ホール"] })], defs, null)).toEqual([]);
  });

  it("checkpointAt 昇順。対象外は除く", () => {
    const a = post({ tags: ["ホール"], checkpointAt: "2026-03-01T00:00:00.000Z" });
    const b = post({ tags: ["東京"], checkpointAt: "2026-01-01T00:00:00.000Z" });
    const c = post({ tags: ["成功"], checkpointAt: "2026-02-01T00:00:00.000Z" });
    expect(planFieldMigrations([a, b, c], defs, ME).map((p) => p.post)).toEqual([c, a]);
  });
});

describe("migratedPostRecord", () => {
  const extra = {
    images: [{ $type: "blob", ref: { $link: "bafy" }, mimeType: "image/jpeg", size: 1 }],
    exif: { Make: "X" },
    sourceRef: "at://did:plc:me/app.bsky.feed.post/abc",
    location: { latitude: 35.1, longitude: 139.2 },
  } as unknown as Partial<PostWithMeta>;

  it("uri / cid / rkey を含まず、他のプロパティはそのまま", () => {
    const p = post({ tags: ["ホール", "東京"], ...extra });
    const record = migratedPostRecord(plan(p));
    expect(record).not.toHaveProperty("uri");
    expect(record).not.toHaveProperty("cid");
    expect(record).not.toHaveProperty("rkey");
    expect(record).toEqual({
      thread: p.thread,
      text: p.text,
      checkpointAt: p.checkpointAt,
      createdAt: p.createdAt,
      ...extra,
      tags: ["東京"],
      fields: [select("kind", ["hall"])],
    });
  });

  it("tags が undefined ならキー自体が無い", () => {
    const record = migratedPostRecord(plan(post({ tags: ["ホール"] })));
    expect("tags" in record).toBe(false);
    expect(record.fields).toEqual([select("kind", ["hall"])]);
  });
});

describe("runFieldMigration", () => {
  const plans = () => [
    plan(post({ tags: ["ホール"], text: "一件目" })),
    plan(post({ tags: ["ルーム"], text: "二件目" })),
    plan(post({ tags: ["成功"], text: "三件目" })),
  ];

  it("全成功", async () => {
    const write = vi.fn(async () => {});
    const ps = plans();
    const res = await runFieldMigration(ps, { write });
    expect(write).toHaveBeenCalledTimes(3);
    expect(write.mock.calls.map((c) => (c as unknown[])[0])).toEqual(ps);
    expect(res).toEqual({
      total: 3,
      done: 3,
      succeeded: 3,
      failed: 0,
      aborted: false,
      failures: [],
      currentUri: undefined,
    });
  });

  it("2 件目が reject しても続行し、failures に message を積む", async () => {
    const ps = plans();
    const write = vi.fn(async (p: MigrationPlan) => {
      if (p === ps[1]) throw new Error("network down");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await runFieldMigration(ps, { write });
    warn.mockRestore();
    expect(write).toHaveBeenCalledTimes(3);
    expect(res.succeeded).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.done).toBe(3);
    expect(res.failures).toEqual([
      { uri: ps[1].post.uri, title: "二件目", message: "network down" },
    ]);
  });

  it("1 件目の後に abort すると次に進まず aborted", async () => {
    const ctrl = new AbortController();
    const write = vi.fn(async () => {
      ctrl.abort();
    });
    const res = await runFieldMigration(plans(), { write, signal: ctrl.signal });
    expect(write).toHaveBeenCalledTimes(1);
    expect(res.done).toBe(1);
    expect(res.succeeded).toBe(1);
    expect(res.aborted).toBe(true);
  });

  it("onProgress は開始・各件の前後・終了で呼ばれ、最後の値が結果と同じ", async () => {
    const calls: MigrationProgress[] = [];
    const ps = plans();
    const res = await runFieldMigration(ps, {
      write: async () => {},
      onProgress: (p) => calls.push(p),
    });
    // 開始 1 + (前 1 + 後 1) × 3 + 終了 1
    expect(calls).toHaveLength(8);
    expect(calls[1].currentUri).toBe(ps[0].post.uri);
    expect(calls[2].done).toBe(1);
    expect(calls.at(-1)).toEqual(res);
  });

  it("write を渡さなければ rewritePost を使う (テストではモック)", async () => {
    const { rewritePost } = await import("@/lib/pds/posts");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await runFieldMigration(plans().slice(0, 1));
    warn.mockRestore();
    expect(rewritePost).toHaveBeenCalledTimes(1);
    expect(res.failed).toBe(1);
  });

  it("既定の write は uri / 書き込む record / 読んだ cid を rewritePost に渡す", async () => {
    const { rewritePost } = await import("@/lib/pds/posts");
    const mock = vi.mocked(rewritePost);
    mock.mockClear();
    mock.mockResolvedValueOnce({} as PostWithMeta);
    const [p] = plans();
    const res = await runFieldMigration([p]);
    expect(res.succeeded).toBe(1);
    expect(mock).toHaveBeenCalledWith(p.post.uri, migratedPostRecord(p), p.post.cid);
  });

  it("InvalidSwap は他で編集された旨の文言で failures に積む", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ps = plans().slice(0, 1);
    const res = await runFieldMigration(ps, {
      write: async () => {
        throw Object.assign(new Error("Record was at bafy..."), { error: "InvalidSwap" });
      },
    });
    warn.mockRestore();
    expect(res.failures).toEqual([
      { uri: ps[0].post.uri, title: "一件目", message: "他で編集されたため書き換えませんでした" },
    ]);
  });
});

describe("migrationFailureMessage", () => {
  it("InvalidSwap だけ専用の文言、それ以外は message", () => {
    expect(migrationFailureMessage({ error: "InvalidSwap" })).toBe(
      "他で編集されたため書き換えませんでした",
    );
    expect(migrationFailureMessage(new Error("network down"))).toBe("network down");
    expect(migrationFailureMessage("x")).toBe("x");
  });
});

describe("migrationRowTitle", () => {
  it("本文の先頭行。空なら（本文なし）", () => {
    expect(migrationRowTitle(plan(post({ tags: ["ホール"], text: "\n見出し\n続き" })))).toBe("見出し");
    expect(migrationRowTitle(plan(post({ tags: ["ホール"], text: undefined })))).toBe("（本文なし）");
  });
});
