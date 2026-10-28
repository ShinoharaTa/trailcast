import { describe, expect, it } from "vitest";
import bookmark from "./net.shino3.trailcast.bookmark.json";
import post from "./net.shino3.trailcast.post.json";
import tagIndex from "./net.shino3.trailcast.tagIndex.json";
import thread from "./net.shino3.trailcast.thread.json";
import {
  MAX_FIELDS,
  MAX_FIELD_ID_LENGTH,
  MAX_FIELD_LABEL_LENGTH,
  MAX_FIELD_OPTIONS,
  MAX_FIELD_UNIT_LENGTH,
  MAX_NUMBER_VALUE_LENGTH,
  MAX_TEXT_VALUE_LENGTH,
} from "@/lib/fields";
import {
  MAX_DEFAULT_TAGS,
  MAX_TAGS_PER_POST,
  MAX_TAGS_PER_THREAD,
  MAX_TAG_GROUP_LABEL_LENGTH,
  MAX_TAG_INDEX_ENTRIES,
  MAX_TAG_LENGTH,
} from "@/lib/tags";

// lexicon JSON とコード側の上限定数の整合を固定する (#64, remaining-spec.md §1.8)。

type Node = Record<string, unknown>;

interface Lexicon {
  id: string;
  defs: Record<string, unknown>;
}

const LEXICONS = [bookmark, post, tagIndex, thread] as Lexicon[];

/**
 * def 内のスキーマを再帰で走査する。path は def 名 (main は NSID の末尾) から
 * プロパティ名と "items" をつないだもの (例: "thread.tagGroups.items.label")。
 */
function walk(node: unknown, path: string, visit: (n: Node, path: string) => void): void {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  const n = node as Node;
  visit(n, path);
  if (n.type === "record") walk(n.record, path, visit);
  if (n.type === "object" && n.properties && typeof n.properties === "object") {
    for (const [key, child] of Object.entries(n.properties as Node)) {
      walk(child, `${path}.${key}`, visit);
    }
  }
  if (n.type === "array") walk(n.items, `${path}.items`, visit);
}

function collect(): Map<string, Node> {
  const out = new Map<string, Node>();
  for (const lex of LEXICONS) {
    const name = lex.id.split(".").pop()!;
    for (const [defName, def] of Object.entries(lex.defs)) {
      walk(def, defName === "main" ? name : defName, (n, path) => out.set(path, n));
    }
  }
  return out;
}

const NODES = collect();

function node(path: string): Node {
  const n = NODES.get(path);
  if (!n) throw new Error(`lexicon に ${path} が無い`);
  return n;
}

/** ASCII 固定なので maxGraphemes を付けない string (D-1) */
const ASCII_ONLY_STRINGS = new Set([
  "fieldDef.id",
  "fieldOption.id",
  "selectValue.field",
  "selectValue.options.items",
  "numberValue.field",
  "numberValue.value",
  "durationValue.field",
  "textValue.field",
]);

describe("lexicon の string 長", () => {
  const strings = [...NODES].filter(([, n]) => n.type === "string");

  it("maxGraphemes を持つ string は maxLength が maxGraphemes * 4 以上", () => {
    const withGraphemes = strings.filter(([, n]) => n.maxGraphemes !== undefined);
    expect(withGraphemes.length).toBeGreaterThan(0);
    for (const [path, n] of withGraphemes) {
      expect(typeof n.maxGraphemes, path).toBe("number");
      expect(typeof n.maxLength, path).toBe("number");
      expect(n.maxLength as number, path).toBeGreaterThanOrEqual((n.maxGraphemes as number) * 4);
    }
  });

  it("maxGraphemes を持たない長さ付き string は ASCII 固定の許可リストに限る", () => {
    const bare = strings
      .filter(([, n]) => n.maxLength !== undefined && n.maxGraphemes === undefined)
      .map(([path]) => path);
    expect(bare.sort()).toEqual([...ASCII_ONLY_STRINGS].sort());
  });

  it("日本語で上限いっぱいの値が maxLength (UTF-8 バイト) に収まる", () => {
    const bytes = (s: string) => new TextEncoder().encode(s).length;
    const cases: [string, string][] = [
      ["fieldDef.label", "あ".repeat(20)],
      ["fieldDef.unit", "あ".repeat(8)],
      ["post.tags.items", "あ".repeat(64)],
    ];
    for (const [path, value] of cases) {
      const n = node(path);
      expect([...new Intl.Segmenter().segment(value)].length, path).toBeLessThanOrEqual(
        n.maxGraphemes as number,
      );
      expect(bytes(value), path).toBeLessThanOrEqual(n.maxLength as number);
    }
  });
});

describe("lexicon とコード側の定数の一致", () => {
  it("文字列の上限", () => {
    for (const path of [
      "post.tags.items",
      "thread.tags.items",
      "thread.defaultTags.items",
      "thread.tagGroups.items.tags.items",
      "fieldOption.label",
      "tagEntry.tag",
    ]) {
      expect(node(path).maxGraphemes, path).toBe(MAX_TAG_LENGTH);
    }
    expect(node("thread.tagGroups.items.label").maxGraphemes).toBe(MAX_TAG_GROUP_LABEL_LENGTH);
    expect(node("fieldDef.label").maxGraphemes).toBe(MAX_FIELD_LABEL_LENGTH);
    expect(node("fieldDef.unit").maxGraphemes).toBe(MAX_FIELD_UNIT_LENGTH);
    expect(node("textValue.text").maxGraphemes).toBe(MAX_TEXT_VALUE_LENGTH);
    expect(node("numberValue.value").maxLength).toBe(MAX_NUMBER_VALUE_LENGTH);
    expect(node("fieldDef.id").maxLength).toBe(MAX_FIELD_ID_LENGTH);
  });

  it("配列の上限", () => {
    expect(node("post.tags").maxLength).toBe(MAX_TAGS_PER_POST);
    expect(node("thread.fields").maxLength).toBe(MAX_FIELDS);
    expect(node("post.fields").maxLength).toBe(MAX_FIELDS);
    expect(node("fieldDef.options").maxLength).toBe(MAX_FIELD_OPTIONS);
    expect(node("tagIndex.tags").maxLength).toBe(MAX_TAG_INDEX_ENTRIES);
    expect(node("thread.tags").maxLength).toBe(MAX_TAGS_PER_THREAD);
    expect(node("thread.defaultTags").maxLength).toBe(MAX_DEFAULT_TAGS);
  });
});
