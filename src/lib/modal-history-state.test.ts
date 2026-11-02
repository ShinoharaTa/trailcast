import { describe, expect, it } from "vitest";
import {
  isOwnModalOnTop,
  readModalKind,
  withModal,
  withoutModal,
} from "@/lib/modal-history-state";

describe("readModalKind", () => {
  it.each([null, undefined, "x", 1, {}, { modal: 1 }])("%s → null", (s) => {
    expect(readModalKind(s)).toBeNull();
  });

  it("modal が文字列ならそれを返す", () => {
    expect(readModalKind({ modal: "share", __NA: true })).toBe("share");
  });
});

describe("withModal / withoutModal", () => {
  it("既存のキーを残して modal を足し引きする", () => {
    const base = { __NA: true, tree: [1] };
    const pushed = withModal(base, "checkpoint-post");
    expect(pushed).toEqual({ __NA: true, tree: [1], modal: "checkpoint-post" });
    expect(base).toEqual({ __NA: true, tree: [1] });
    expect(withoutModal(pushed)).toEqual(base);
  });

  it("state が null でも扱える", () => {
    expect(withModal(null, "share")).toEqual({ modal: "share" });
    expect(withoutModal(null)).toEqual({});
  });

  it("上書きすると種類だけ変わる", () => {
    expect(withModal({ modal: "share" }, "login")).toEqual({ modal: "login" });
  });
});

describe("isOwnModalOnTop", () => {
  it("積んだ種類と state が一致するときだけ true", () => {
    expect(isOwnModalOnTop({ modal: "share" }, "share")).toBe(true);
    expect(isOwnModalOnTop({ modal: "login" }, "share")).toBe(false);
    expect(isOwnModalOnTop({}, "share")).toBe(false);
    expect(isOwnModalOnTop({ modal: "share" }, null)).toBe(false);
  });
});
