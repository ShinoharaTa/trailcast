import { describe, expect, it } from "vitest";
import {
  EMPTY_RECORD_FILTER,
  NO_TEXT_TITLE,
  applyRecordFilter,
  countUnrecorded,
  defaultViewForRecord,
  defaultViewToSave,
  effectiveDefaultView,
  isPostUnrecorded,
  isRecordFilterActive,
  parseQuery,
  postSearchText,
  searchPosts,
  sortByCheckpoint,
  splitPostText,
  type PostLike,
  type RecordFilter,
} from "@/lib/record";
import type { FieldDef, FieldValue, ThreadView } from "@/lib/types";

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

const kind: FieldDef = {
  id: "kind",
  label: "種類",
  type: "select",
  options: [
    { id: "hall", label: "ホール" },
    { id: "room", label: "ルーム" },
  ],
};
const oldField: FieldDef = {
  id: "old",
  label: "旧項目",
  type: "select",
  archived: true,
  options: [{ id: "x", label: "エックス" }],
};
const distance: FieldDef = {
  id: "dist",
  label: "距離",
  type: "number",
  unit: "km",
};
const defs = [kind, oldField, distance];

const at = "2026-06-01T10:00:00+09:00";
const post = (p: Partial<PostLike>): PostLike => ({ checkpointAt: at, ...p });

describe("effectiveDefaultView", () => {
  it("未設定は timeline", () => {
    expect(effectiveDefaultView({})).toBe("timeline");
  });
  it("未知の文字列は timeline", () => {
    expect(
      effectiveDefaultView({ defaultView: "grid" as unknown as ThreadView }),
    ).toBe("timeline");
  });
  it("review が available に無ければ log", () => {
    expect(
      effectiveDefaultView({ defaultView: "review" }, ["timeline", "log"]),
    ).toBe("log");
  });
  it("review が available にあれば review", () => {
    expect(effectiveDefaultView({ defaultView: "review" })).toBe("review");
  });
  it("log はそのまま", () => {
    expect(effectiveDefaultView({ defaultView: "log" }, ["timeline", "log"])).toBe(
      "log",
    );
  });
});

describe("defaultViewForRecord", () => {
  it("timeline は書かない", () => {
    expect(defaultViewForRecord("timeline")).toBeUndefined();
  });
  it("log は書く", () => {
    expect(defaultViewForRecord("log")).toBe("log");
  });
});

describe("defaultViewToSave", () => {
  it("未変更なら review を保持する", () => {
    expect(defaultViewToSave("review", "log", "log")).toBe("review");
  });
  it("未変更なら未知の値を保持する", () => {
    const unknown = "grid" as unknown as ThreadView;
    expect(defaultViewToSave(unknown, "timeline", "timeline")).toBe(unknown);
  });
  it("未変更で未設定なら undefined のまま", () => {
    expect(defaultViewToSave(undefined, "timeline", "timeline")).toBeUndefined();
  });
  it("timeline に変えたら書かない", () => {
    expect(defaultViewToSave("log", "log", "timeline")).toBeUndefined();
  });
  it("log に変えたら log", () => {
    expect(defaultViewToSave(undefined, "timeline", "log")).toBe("log");
  });
});

describe("isRecordFilterActive", () => {
  it("空なら false", () => {
    expect(isRecordFilterActive(EMPTY_RECORD_FILTER)).toBe(false);
  });
  it("空白だけの query は絞り込みではない", () => {
    expect(isRecordFilterActive({ ...EMPTY_RECORD_FILTER, query: " 　" })).toBe(
      false,
    );
  });
  it("timeline: true なら query / unrecorded を見ない", () => {
    const f: RecordFilter = { ...EMPTY_RECORD_FILTER, query: "a", unrecorded: true };
    expect(isRecordFilterActive(f)).toBe(true);
    expect(isRecordFilterActive(f, { timeline: true })).toBe(false);
    expect(
      isRecordFilterActive({ ...f, tags: ["t"] }, { timeline: true }),
    ).toBe(true);
  });
  it("範囲の生文字列だけで true (timeline でも、不正値でも)", () => {
    const f: RecordFilter = {
      ...EMPTY_RECORD_FILTER,
      ranges: { dist: { min: "abc", max: "" } },
    };
    expect(isRecordFilterActive(f)).toBe(true);
    expect(isRecordFilterActive(f, { timeline: true })).toBe(true);
  });
});

describe("isPostUnrecorded / countUnrecorded", () => {
  it("defs が空なら false", () => {
    expect(isPostUnrecorded({ fields: [] }, [])).toBe(false);
    expect(countUnrecorded([{ fields: [] }], [])).toBe(0);
  });
  it("tags の fallback で解決できる旧投稿は記録あり", () => {
    expect(isPostUnrecorded({ tags: ["ホール"] }, defs)).toBe(false);
  });
  it("fields: [] は未記録 (タグが選択肢名と同じでも)", () => {
    expect(isPostUnrecorded({ fields: [], tags: ["ホール"] }, defs)).toBe(true);
  });
  it("archived 項目にだけ値があれば記録あり", () => {
    expect(isPostUnrecorded({ fields: [select("old", ["x"])] }, defs)).toBe(
      false,
    );
  });
  it("タグも fields も無い投稿は未記録", () => {
    expect(isPostUnrecorded({}, defs)).toBe(true);
  });
  it("件数", () => {
    expect(
      countUnrecorded(
        [{}, { fields: [] }, { fields: [num("dist", "3")] }, { tags: ["ルーム"] }],
        defs,
      ),
    ).toBe(2);
  });
});

describe("parseQuery", () => {
  it("全角空白でも分割する", () => {
    expect(parseQuery("赤坂　ホール")).toEqual(["赤坂", "ホール"]);
  });
  it("小文字にして前後の空白を落とす", () => {
    expect(parseQuery("  Tokyo  ESCAPE ")).toEqual(["tokyo", "escape"]);
  });
  it("空なら []", () => {
    expect(parseQuery("")).toEqual([]);
    expect(parseQuery(" 　 ")).toEqual([]);
  });
  it("全角英数を半角・小文字にする (NFKC)", () => {
    expect(parseQuery("ＮＡＮＩＣＡ　１２")).toEqual(["nanica", "12"]);
  });
  it("半角カナを全角にする (NFKC)", () => {
    expect(parseQuery("ｶﾌｪ ﾊﾟﾝ")).toEqual(["カフェ", "パン"]);
  });
});

describe("postSearchText / searchPosts", () => {
  const posts: PostLike[] = [
    post({ text: "赤坂で Escape 成功", fields: [select("kind", ["hall"])] }),
    post({ text: "雨の日", tags: ["Tokyo"], fields: [] }),
    post({ text: "旧データ", tags: ["ルーム"] }),
    post({ text: "朝ラン", fields: [num("dist", "12.5")] }),
  ];

  it("本文 (大小文字無視)", () => {
    expect(searchPosts(posts, defs, "escape")).toEqual([posts[0]]);
  });
  it("自由タグ", () => {
    expect(searchPosts(posts, defs, "tokyo")).toEqual([posts[1]]);
  });
  it("選択肢名 (fallback の投稿も)", () => {
    expect(searchPosts(posts, defs, "ホール")).toEqual([posts[0]]);
    expect(searchPosts(posts, defs, "ルーム")).toEqual([posts[2]]);
  });
  it("選択肢扱いのタグは自由タグとして二重に入れない", () => {
    expect(postSearchText(posts[2], defs)).toBe("旧データ\nルーム");
  });
  it("number の値と単位", () => {
    expect(searchPosts(posts, defs, "12.5")).toEqual([posts[3]]);
    expect(searchPosts(posts, defs, "km")).toEqual([posts[3]]);
  });
  it("項目名では一致しない", () => {
    expect(searchPosts(posts, defs, "種類")).toEqual([]);
    expect(searchPosts(posts, defs, "距離")).toEqual([]);
  });
  it("2 語は AND", () => {
    expect(searchPosts(posts, defs, "赤坂 ホール")).toEqual([posts[0]]);
    expect(searchPosts(posts, defs, "赤坂 ルーム")).toEqual([]);
  });
  it("空 query は同じ参照", () => {
    expect(searchPosts(posts, defs, "  ")).toBe(posts);
  });
  it("全角英数・半角カナは NFKC で揃えて一致する", () => {
    const wide = [
      post({ text: "NANICA に行った" }),
      post({ text: "ｶﾌｪ で休憩" }),
      post({ text: "カフェ巡り", tags: ["ＴＯＫＹＯ"] }),
    ];
    expect(searchPosts(wide, defs, "ＮＡＮＩＣＡ")).toEqual([wide[0]]);
    expect(searchPosts(wide, defs, "nanica")).toEqual([wide[0]]);
    expect(searchPosts(wide, defs, "ｶﾌｪ")).toEqual([wide[1], wide[2]]);
    expect(searchPosts(wide, defs, "カフェ")).toEqual([wide[1], wide[2]]);
    expect(searchPosts(wide, defs, "tokyo")).toEqual([wide[2]]);
    expect(postSearchText(wide[1], defs)).toBe("カフェ で休憩");
  });
  it("全角空白区切りも AND", () => {
    expect(searchPosts(posts, defs, "赤坂　ホール")).toEqual([posts[0]]);
    expect(searchPosts(posts, defs, "赤坂　ルーム")).toEqual([]);
  });
});

describe("applyRecordFilter", () => {
  const posts: PostLike[] = [
    post({ text: "a hall", fields: [select("kind", ["hall"])], tags: ["x"] }),
    post({ text: "b room", fields: [select("kind", ["room"])], tags: ["x"] }),
    post({ text: "c none", fields: [], tags: ["x"] }),
    post({ text: "d none", fields: [] }),
  ];

  it("何も当てなければ同じ参照", () => {
    expect(applyRecordFilter(posts, defs, EMPTY_RECORD_FILTER)).toBe(posts);
  });
  it("条件はすべて AND", () => {
    const f: RecordFilter = {
      fields: {},
      tags: ["x"],
      ranges: {},
      query: "none",
      unrecorded: true,
    };
    expect(applyRecordFilter(posts, defs, f)).toEqual([posts[2]]);
    expect(
      applyRecordFilter(posts, defs, { ...f, fields: { kind: ["hall"] } }),
    ).toEqual([]);
    expect(
      applyRecordFilter(posts, defs, {
        ...EMPTY_RECORD_FILTER,
        fields: { kind: ["hall", "room"] },
        query: "room",
      }),
    ).toEqual([posts[1]]);
  });
  it("timeline: true なら query・unrecorded を無視", () => {
    const f: RecordFilter = {
      fields: {},
      tags: ["x"],
      ranges: {},
      query: "none",
      unrecorded: true,
    };
    expect(applyRecordFilter(posts, defs, f, { timeline: true })).toEqual(
      posts.slice(0, 3),
    );
    expect(
      applyRecordFilter(
        posts,
        defs,
        { ...EMPTY_RECORD_FILTER, query: "zzz", unrecorded: true },
        { timeline: true },
      ),
    ).toBe(posts);
  });
  it("ranges は timeline でも効き、unrecorded・query と AND", () => {
    const ps: PostLike[] = [
      post({ text: "a", fields: [num("dist", "5")] }),
      post({ text: "b", fields: [num("dist", "12")] }),
      post({ text: "c", fields: [num("dist", "20")], tags: ["x"] }),
      post({ text: "d", fields: [] }),
    ];
    const f: RecordFilter = {
      ...EMPTY_RECORD_FILTER,
      ranges: { dist: { min: "10", max: "" } },
    };
    expect(applyRecordFilter(ps, defs, f, { timeline: true })).toEqual([
      ps[1],
      ps[2],
    ]);
    expect(applyRecordFilter(ps, defs, { ...f, query: "c" })).toEqual([ps[2]]);
    expect(applyRecordFilter(ps, defs, { ...f, tags: ["x"] })).toEqual([ps[2]]);
    // 値の無い投稿は範囲に一致しないので、未記録とは両立しない
    expect(applyRecordFilter(ps, defs, { ...f, unrecorded: true })).toEqual([]);
  });
});

describe("sortByCheckpoint", () => {
  const a = { id: "a", checkpointAt: "2026-01-01T10:00:00+09:00" };
  const b1 = { id: "b1", checkpointAt: "2026-01-02T10:00:00+09:00" };
  const b2 = { id: "b2", checkpointAt: "2026-01-02T10:00:00+09:00" };
  const bad = { id: "bad", checkpointAt: "not a date" };

  it("昇順 / 降順", () => {
    expect(sortByCheckpoint([b1, a], "asc").map((p) => p.id)).toEqual(["a", "b1"]);
    expect(sortByCheckpoint([a, b1], "desc").map((p) => p.id)).toEqual(["b1", "a"]);
  });
  it("同時刻は入力順のまま (安定)", () => {
    expect(sortByCheckpoint([b2, a, b1], "asc").map((p) => p.id)).toEqual([
      "a",
      "b2",
      "b1",
    ]);
    expect(sortByCheckpoint([b2, a, b1], "desc").map((p) => p.id)).toEqual([
      "b2",
      "b1",
      "a",
    ]);
  });
  it("不正な日付は末尾", () => {
    expect(sortByCheckpoint([bad, b1, a], "asc").map((p) => p.id)).toEqual([
      "a",
      "b1",
      "bad",
    ]);
    expect(sortByCheckpoint([bad, a, b1], "desc").map((p) => p.id)).toEqual([
      "b1",
      "a",
      "bad",
    ]);
  });
  it("入力を変更しない", () => {
    const input = [b1, a];
    sortByCheckpoint(input, "asc");
    expect(input).toEqual([b1, a]);
  });
});

describe("splitPostText", () => {
  it("1 行", () => {
    expect(splitPostText("赤坂の公演")).toEqual({ title: "赤坂の公演" });
  });
  it("複数行", () => {
    expect(splitPostText("タイトル\n1 行目\n\n2 行目\n")).toEqual({
      title: "タイトル",
      note: "1 行目\n\n2 行目",
    });
  });
  it("空", () => {
    expect(splitPostText(undefined)).toEqual({ title: NO_TEXT_TITLE });
    expect(splitPostText("  \n ")).toEqual({ title: NO_TEXT_TITLE });
  });
  it("先頭の空行を飛ばす", () => {
    expect(splitPostText("\n\n  見出し  \nメモ")).toEqual({
      title: "見出し",
      note: "メモ",
    });
  });
});
