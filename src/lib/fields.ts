// 記録項目 (カスタムフィールド) を扱う純関数群。仕様は docs/custom-fields.md。
//
// 保存形式:
//   - 定義は thread.fields、値は post.fields に field id / option id で持つ
//   - 選択した option は post.tags に書かない (二重書きのドリフトを避ける)
//   - post.fields を持たない投稿 (旧データ・他クライアント・参加者) は、
//     読み取り時に tags を option.label と tagKey で完全一致させて補う
//
// id で参照するのは、選択肢の改名・並べ替えで既存の投稿を書き換えずに済ませるため。

import type {
  FieldDef,
  FieldOption,
  FieldType,
  FieldValue,
  TagGroup,
} from "@/lib/types";
import {
  dedupeTags,
  normalizeTag,
  sanitizeTagsForRecord,
  sliceGraphemes,
  tagKey,
} from "@/lib/tags";

/** 1 スレッドに定義できる項目数 (lexicon の maxLength と一致させる) */
export const MAX_FIELDS = 30;
/** 1 項目の選択肢数 (lexicon の maxLength と一致させる) */
export const MAX_FIELD_OPTIONS = 50;
/** 項目名の最大長 (grapheme 単位) */
export const MAX_FIELD_LABEL_LENGTH = 20;
/** id の最大長 (lexicon の maxLength と一致させる) */
export const MAX_FIELD_ID_LENGTH = 16;
/** 単位の最大長 */
export const MAX_FIELD_UNIT_LENGTH = 8;
/** number の値 (10 進文字列) の最大長 */
export const MAX_NUMBER_VALUE_LENGTH = 32;
/** text の値の最大長 (grapheme 単位) */
export const MAX_TEXT_VALUE_LENGTH = 200;

/** 絞り込み・集計で「値が無い」を表すキー。option id と衝突しない */
export const FIELD_UNSET = "__unset__";

const VALUE_TYPES = {
  select: "net.shino3.trailcast.post#selectValue",
  number: "net.shino3.trailcast.post#numberValue",
  duration: "net.shino3.trailcast.post#durationValue",
  text: "net.shino3.trailcast.post#textValue",
} as const satisfies Record<FieldType, FieldValue["$type"]>;

const FIELD_TYPES = new Set<string>(Object.keys(VALUE_TYPES));

/** 指数表記や先頭の `+` は受けない。lexicon の値をそのまま読める形に限る */
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** field / option 用のランダム id (base32 小文字 8 文字)。label からは作らない。 */
export function generateFieldId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += BASE32[b & 31];
  return out;
}

function isValidId(id: unknown): id is string {
  return (
    typeof id === "string" && id.length > 0 && id.length <= MAX_FIELD_ID_LENGTH
  );
}

function isValidDecimal(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_NUMBER_VALUE_LENGTH &&
    DECIMAL_PATTERN.test(value)
  );
}

// ─── 書き込み前のサニタイズ ──────────────────────────────────

/**
 * thread.fields の保存直前のサニタイズ。
 * 型ごとに使わないプロパティは落とす。有効な項目が無ければ undefined を返し、
 * 空の `fields: []` をレコードに書き込まないようにする (tagGroups と同じ慣習)。
 */
export function sanitizeFieldsForRecord(
  defs: FieldDef[],
): FieldDef[] | undefined {
  const out: FieldDef[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    if (out.length >= MAX_FIELDS) break;
    // id 重複は後ろを落とす (先に定義された方が既存の値を持っている)
    if (!isValidId(def.id) || seen.has(def.id)) continue;
    if (!FIELD_TYPES.has(def.type)) continue;
    const label = sliceGraphemes(def.label.trim(), MAX_FIELD_LABEL_LENGTH);
    if (!label) continue;

    const next: FieldDef = { id: def.id, label, type: def.type };
    if (def.type === "select") {
      const options = sanitizeOptions(def.options ?? []);
      if (options.length === 0) continue;
      if (def.multiple) next.multiple = true;
      next.options = options;
    }
    if (def.type === "number") {
      const unit = sliceGraphemes(def.unit?.trim() ?? "", MAX_FIELD_UNIT_LENGTH);
      if (unit) next.unit = unit;
      if (
        typeof def.scale === "number" &&
        Number.isInteger(def.scale) &&
        def.scale >= 0 &&
        def.scale <= 3
      ) {
        next.scale = def.scale;
      }
    }
    if (def.archived) next.archived = true;

    seen.add(def.id);
    out.push(next);
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeOptions(options: FieldOption[]): FieldOption[] {
  const out: FieldOption[] = [];
  const seen = new Set<string>();
  for (const opt of options) {
    if (out.length >= MAX_FIELD_OPTIONS) break;
    if (!isValidId(opt.id) || seen.has(opt.id)) continue;
    // クロスポストでハッシュタグにするので、タグと同じ正規化を通す
    const label = normalizeTag(opt.label);
    if (!label) continue;
    const next: FieldOption = { id: opt.id, label };
    if (opt.archived) next.archived = true;
    seen.add(opt.id);
    out.push(next);
  }
  return out;
}

/**
 * post.fields の保存直前のサニタイズ。
 * - 定義に無い field は落とす (archived でも定義にあれば残す)
 * - 同じ field が複数あれば後勝ちで 1 件にする (不正で落ちた値は勝たない)
 * - $type が定義の型と合わない値は落とす
 * - 空になれば undefined
 */
export function sanitizePostFieldsForRecord(
  values: FieldValue[],
  defs: FieldDef[],
): FieldValue[] | undefined {
  const defById = new Map(defs.map((d) => [d.id, d]));
  const byField = new Map<string, FieldValue>();
  for (const value of values) {
    const def = defById.get(value.field);
    if (!def) continue;
    const next = sanitizeValue(value, def);
    if (!next) continue;
    // 有効な値どうしで後勝ち。位置も後ろに寄せる
    byField.delete(value.field);
    byField.set(value.field, next);
  }
  const out = [...byField.values()].slice(0, MAX_FIELDS);
  return out.length > 0 ? out : undefined;
}

function sanitizeValue(value: FieldValue, def: FieldDef): FieldValue | null {
  if (value.$type !== VALUE_TYPES[def.type]) return null;
  switch (value.$type) {
    case VALUE_TYPES.select: {
      const known = new Set((def.options ?? []).map((o) => o.id));
      const ids = [...new Set(value.options)].filter((id) => known.has(id));
      const options = def.multiple
        ? ids.slice(0, MAX_FIELD_OPTIONS)
        : ids.slice(0, 1);
      if (options.length === 0) return null;
      return { $type: value.$type, field: def.id, options };
    }
    case VALUE_TYPES.number:
      if (!isValidDecimal(value.value)) return null;
      return { $type: value.$type, field: def.id, value: value.value };
    case VALUE_TYPES.duration:
      if (!Number.isInteger(value.seconds) || value.seconds < 0) return null;
      return { $type: value.$type, field: def.id, seconds: value.seconds };
    case VALUE_TYPES.text: {
      const text = sliceGraphemes(value.text.trim(), MAX_TEXT_VALUE_LENGTH);
      if (!text) return null;
      return { $type: value.$type, field: def.id, text };
    }
  }
  return null;
}

// ─── 読み取り ────────────────────────────────────────────────

interface HasFieldValues {
  tags?: string[];
  fields?: FieldValue[];
}

export interface ResolvedValue {
  field: FieldDef;
  /** 値の出どころ。"tags" は post.fields を持たない投稿の fallback */
  source: "fields" | "tags";
  /** select */
  optionIds?: string[];
  /** number (10 進文字列) */
  value?: string;
  /** duration */
  seconds?: number;
  /** text */
  text?: string;
}

/**
 * 投稿の値を現在の定義で解決する。定義の順で返す。
 *
 * - post.fields があればそれを使う (定義に無い field・型の合わない値は除く)
 * - post.fields が無い投稿に限り、select 定義ごとに tags を option.label と
 *   tagKey で完全一致させて補う (archived の option も対象)。曖昧一致はしない
 */
export function resolveFieldValues(
  post: HasFieldValues,
  defs: FieldDef[],
): ResolvedValue[] {
  if (post.fields) {
    const byField = new Map<string, FieldValue>();
    for (const v of post.fields) byField.set(v.field, v);
    const out: ResolvedValue[] = [];
    for (const def of defs) {
      const v = byField.get(def.id);
      if (!v || v.$type !== VALUE_TYPES[def.type]) continue;
      const resolved: ResolvedValue = { field: def, source: "fields" };
      switch (v.$type) {
        case VALUE_TYPES.select:
          resolved.optionIds = v.options;
          break;
        case VALUE_TYPES.number:
          resolved.value = v.value;
          break;
        case VALUE_TYPES.duration:
          resolved.seconds = v.seconds;
          break;
        case VALUE_TYPES.text:
          resolved.text = v.text;
          break;
      }
      out.push(resolved);
    }
    return out;
  }

  const tagKeys = new Set((post.tags ?? []).map(tagKey));
  if (tagKeys.size === 0) return [];
  const out: ResolvedValue[] = [];
  for (const def of defs) {
    if (def.type !== "select") continue;
    const optionIds = (def.options ?? [])
      .filter((o) => tagKeys.has(tagKey(o.label)))
      .map((o) => o.id);
    if (optionIds.length === 0) continue;
    out.push({ field: def, source: "tags", optionIds });
  }
  return out;
}

/**
 * Bluesky クロスポストに載せるタグ。自由タグ + 選択した option の label。
 * 大文字小文字違いの重複は先に現れた表記を残す。
 */
export function crosspostTagsFor(
  post: HasFieldValues,
  defs: FieldDef[],
): string[] {
  const labels: string[] = [];
  for (const r of resolveFieldValues(post, defs)) {
    if (!r.optionIds) continue;
    const byId = new Map((r.field.options ?? []).map((o) => [o.id, o]));
    for (const id of r.optionIds) {
      const opt = byId.get(id);
      if (opt) labels.push(opt.label);
    }
  }
  return dedupeTags([...(post.tags ?? []), ...labels]);
}

/**
 * 解決済みの値を入力 UI の初期値 (FieldValue[]) に戻す。定義の順のまま返す。
 * tags から読み取った選択も、選択済みの値として含める。
 */
export function fieldValuesFromResolved(
  resolved: ResolvedValue[],
): FieldValue[] {
  const out: FieldValue[] = [];
  for (const r of resolved) {
    const field = r.field.id;
    switch (r.field.type) {
      case "select":
        if (r.optionIds) {
          out.push({ $type: VALUE_TYPES.select, field, options: r.optionIds });
        }
        break;
      case "number":
        if (r.value !== undefined) {
          out.push({ $type: VALUE_TYPES.number, field, value: r.value });
        }
        break;
      case "duration":
        if (r.seconds !== undefined) {
          out.push({ $type: VALUE_TYPES.duration, field, seconds: r.seconds });
        }
        break;
      case "text":
        if (r.text !== undefined) {
          out.push({ $type: VALUE_TYPES.text, field, text: r.text });
        }
        break;
    }
  }
  return out;
}

/**
 * 編集画面で保存する post.fields / post.tags を組み立てる。
 *
 * スレッドに入力できる項目 (archived 以外) が 1 件以上あるとき:
 * - fields は sanitize 結果。空なら `[]` を書く (プロパティを消すと tags からの
 *   読み取りが復活し、未設定に戻せなくなるため)
 * - tags から読み取っていた選択肢は fields に移るので、その label と tagKey が
 *   一致するタグを tags から外す。それ以外の自由タグは残す
 *
 * 項目が無いスレッドでは fields は元の投稿のまま触らない。
 * tags は sanitizeTagsForRecord 済みで返す。
 */
export function buildEditedPostFields(
  post: HasFieldValues,
  defs: FieldDef[],
  values: FieldValue[],
  tags: string[],
): { fields: FieldValue[] | undefined; tags: string[] | undefined } {
  if (!defs.some((d) => !d.archived)) {
    return { fields: post.fields, tags: sanitizeTagsForRecord(tags) };
  }

  const movedKeys = new Set<string>();
  for (const r of resolveFieldValues(post, defs)) {
    if (r.source !== "tags" || !r.optionIds) continue;
    const ids = new Set(r.optionIds);
    for (const opt of r.field.options ?? []) {
      if (ids.has(opt.id)) movedKeys.add(tagKey(opt.label));
    }
  }

  return {
    fields: sanitizePostFieldsForRecord(values, defs) ?? [],
    tags: sanitizeTagsForRecord(tags.filter((t) => !movedKeys.has(tagKey(t)))),
  };
}

// ─── 移行 ────────────────────────────────────────────────────

/**
 * tagGroups を select 項目に変換する。1 グループ → 1 項目、タグ → 選択肢。
 * single / multiple はタグからは判定できないので、既定は広い方の multiple。
 * 戻り値は未サニタイズ。保存前に必ず sanitizeFieldsForRecord を通すこと。
 */
export function convertTagGroupsToFields(
  groups: TagGroup[],
  opts?: { multiple?: (group: TagGroup) => boolean },
): FieldDef[] {
  return groups.map((group) => ({
    id: generateFieldId(),
    label: group.label,
    type: "select",
    multiple: opts?.multiple ? opts.multiple(group) : true,
    options: group.tags.map((label) => ({ id: generateFieldId(), label })),
  }));
}

// ─── 絞り込み / 集計 ──────────────────────────────────────────

/**
 * 投稿が持つ、その select 項目の option id (定義にあるものだけ、重複なし)。
 * single でも先頭に絞らず全値を返す (データを切り捨てない)。
 */
function selectedOptionIds(post: HasFieldValues, def: FieldDef): string[] {
  const resolved = resolveFieldValues(post, [def])[0];
  if (!resolved?.optionIds) return [];
  const known = new Set((def.options ?? []).map((o) => o.id));
  return [...new Set(resolved.optionIds)].filter((id) => known.has(id));
}

/**
 * select 項目の選択肢ごとの件数。定義の options 順で返し、最後に FIELD_UNSET。
 * multiple は延べ数。single でも 2 値以上ある投稿は全値を数える。
 * どの選択肢も持たない投稿は FIELD_UNSET に数える。
 */
export function countSelectOptions(
  posts: HasFieldValues[],
  def: FieldDef,
): { optionId: string | typeof FIELD_UNSET; count: number }[] {
  const counts = new Map<string, number>(
    (def.options ?? []).map((o) => [o.id, 0]),
  );
  let unset = 0;
  for (const post of posts) {
    const ids = selectedOptionIds(post, def);
    if (ids.length === 0) unset += 1;
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [
    ...[...counts.entries()].map(([optionId, count]) => ({ optionId, count })),
    { optionId: FIELD_UNSET, count: unset },
  ];
}

/**
 * select 項目での絞り込み。`selection` は field id → option id の配列。
 * 同じ項目内は OR、項目間は AND。FIELD_UNSET を含む項目は値の無い投稿にも一致する。
 * 選択が空の項目、定義に無い・select でない項目は条件にしない。
 */
export function filterPostsByFields<T extends HasFieldValues>(
  posts: T[],
  defs: FieldDef[],
  selection: Record<string, string[]>,
): T[] {
  const conditions = defs
    .filter((d) => d.type === "select" && (selection[d.id]?.length ?? 0) > 0)
    .map((def) => ({ def, wanted: new Set(selection[def.id]) }));
  if (conditions.length === 0) return posts;
  return posts.filter((post) =>
    conditions.every(({ def, wanted }) => {
      const ids = selectedOptionIds(post, def);
      if (ids.length === 0) return wanted.has(FIELD_UNSET);
      return ids.some((id) => wanted.has(id));
    }),
  );
}

export interface NumericSummary {
  count: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
}

function summarize(values: number[]): NumericSummary {
  if (values.length === 0) {
    return { count: 0, sum: null, avg: null, min: null, max: null };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    sum,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

/** number 項目の件数・合計・平均・最小・最大。値が無ければ count 0、他は null。 */
export function summarizeNumber(
  posts: HasFieldValues[],
  def: FieldDef,
): NumericSummary {
  const values: number[] = [];
  for (const post of posts) {
    const value = resolveFieldValues(post, [def])[0]?.value;
    if (!isValidDecimal(value)) continue;
    values.push(Number(value));
  }
  return summarize(values);
}

/** duration 項目の件数・合計・平均・最小・最大 (秒)。値が無ければ count 0、他は null。 */
export function summarizeDuration(
  posts: HasFieldValues[],
  def: FieldDef,
): NumericSummary {
  const values: number[] = [];
  for (const post of posts) {
    const seconds = resolveFieldValues(post, [def])[0]?.seconds;
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) continue;
    values.push(seconds);
  }
  return summarize(values);
}
