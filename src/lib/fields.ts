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
  countTags,
  countWithTagAdded,
  dedupeTags,
  filterPostsByTags,
  normalizeTag,
  sanitizeTagsForRecord,
  sliceGraphemes,
  tagKey,
  type TagCount,
} from "@/lib/tags";

/** 1 スレッドに定義できる項目数 (lexicon の maxLength と一致させる) */
export const MAX_FIELDS = 30;
/** 1 項目の選択肢数 (lexicon の maxLength と一致させる) */
export const MAX_FIELD_OPTIONS = 50;
/** 項目名の最大長 (grapheme 単位。lexicon の maxGraphemes と一致させる) */
export const MAX_FIELD_LABEL_LENGTH = 20;
/** id の最大長 (ASCII のみなので lexicon の maxLength (バイト) と一致させる) */
export const MAX_FIELD_ID_LENGTH = 16;
/** 単位の最大長 (grapheme 単位。lexicon の maxGraphemes と一致させる) */
export const MAX_FIELD_UNIT_LENGTH = 8;
/** number の値 (10 進文字列) の最大長 (ASCII のみなので lexicon の maxLength (バイト) と一致させる) */
export const MAX_NUMBER_VALUE_LENGTH = 32;
/** text の値の最大長 (grapheme 単位。lexicon の maxGraphemes と一致させる) */
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
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

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
 * - 1 つだけの select は先頭 1 件に絞る。`keepMultiple` に含む項目 id は絞らない
 *   (既に複数選ばれていて値を変えていない項目のデータを消さないため)
 * - 空になれば undefined
 */
export function sanitizePostFieldsForRecord(
  values: FieldValue[],
  defs: FieldDef[],
  opts?: { keepMultiple?: Set<string> },
): FieldValue[] | undefined {
  const defById = new Map(defs.map((d) => [d.id, d]));
  const byField = new Map<string, FieldValue>();
  for (const value of values) {
    const def = defById.get(value.field);
    if (!def) continue;
    const next = sanitizeValue(
      value,
      def,
      opts?.keepMultiple?.has(def.id) ?? false,
    );
    if (!next) continue;
    // 有効な値どうしで後勝ち。位置も後ろに寄せる
    byField.delete(value.field);
    byField.set(value.field, next);
  }
  const out = [...byField.values()].slice(0, MAX_FIELDS);
  return out.length > 0 ? out : undefined;
}

function sanitizeValue(
  value: FieldValue,
  def: FieldDef,
  keepMultiple: boolean,
): FieldValue | null {
  if (value.$type !== VALUE_TYPES[def.type]) return null;
  switch (value.$type) {
    case VALUE_TYPES.select: {
      const known = new Set((def.options ?? []).map((o) => o.id));
      const ids = [...new Set(value.options)].filter((id) => known.has(id));
      const options =
        def.multiple || keepMultiple
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

export interface HasFieldValues {
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

/** 入力できる項目 (archived 以外) があるか。投稿・編集で fields を書くかどうかの判定 */
function hasInputFields(defs: FieldDef[]): boolean {
  return defs.some((d) => !d.archived);
}

/**
 * 入力できる項目があるスレッドで書く post.fields。sanitize 結果が空でも `[]` を書く
 * (プロパティが無いと tags からの読み取りが効き、自由タグが選択扱いになるため)。
 */
function postFieldsForInputThread(
  defs: FieldDef[],
  values: FieldValue[],
  opts?: { keepMultiple?: Set<string> },
): FieldValue[] {
  return sanitizePostFieldsForRecord(values, defs, opts) ?? [];
}

/**
 * 新規投稿で書く post.fields。入力できる項目 (archived 以外) があれば
 * sanitize 結果 (未入力なら `[]`)、無ければ undefined (プロパティを書かない)。
 */
export function buildNewPostFields(
  defs: FieldDef[],
  values: FieldValue[],
): FieldValue[] | undefined {
  return hasInputFields(defs)
    ? postFieldsForInputThread(defs, values)
    : undefined;
}

/**
 * select の選択肢を押したときの新しい選択。
 * - multiple: あれば外し、無ければ末尾に足す
 * - 1 つだけ: 未選択ならそれだけにする。選択済みで他に選択が無ければ解除。
 *   他にも選択がある (旧データで複数選ばれている) ならそれ 1 つに絞る
 */
export function toggleSelectOption(
  current: string[],
  optionId: string,
  multiple: boolean,
): string[] {
  const selected = current.includes(optionId);
  if (multiple) {
    return selected
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
  }
  if (!selected) return [optionId];
  return current.length === 1 ? [] : [optionId];
}

/** tags から読み取った選択肢の label の tagKey。fields に移すときに tags から外す */
function tagKeysMovedToFields(
  post: HasFieldValues,
  defs: FieldDef[],
): Set<string> {
  const keys = new Set<string>();
  for (const r of resolveFieldValues(post, defs)) {
    if (r.source !== "tags" || !r.optionIds) continue;
    const ids = new Set(r.optionIds);
    for (const opt of r.field.options ?? []) {
      if (ids.has(opt.id)) keys.add(tagKey(opt.label));
    }
  }
  return keys;
}

/**
 * 編集画面のタグ欄の初期値。項目があるスレッドでは、tags から読み取った
 * 選択肢のタグを外す (項目のチップ側にだけ出す)。
 * タイムラインでも、項目のチップと重複するタグを隠すのに使う。
 */
export function initialFreeTagsForEdit(
  post: HasFieldValues,
  defs: FieldDef[],
): string[] {
  const tags = post.tags ?? [];
  if (!hasInputFields(defs)) return [...tags];
  const moved = tagKeysMovedToFields(post, defs);
  return tags.filter((t) => !moved.has(tagKey(t)));
}

/**
 * 編集画面で保存する post.fields / post.tags を組み立てる。
 *
 * スレッドに入力できる項目 (archived 以外) が 1 件以上あるとき:
 * - fields は sanitize 結果。空なら `[]` を書く (プロパティを消すと tags からの
 *   読み取りが復活し、未設定に戻せなくなるため)
 * - 1 つだけの select で、元の投稿の選択と UI の選択が同じ集合 (順序は問わない)
 *   なら先頭に絞らず、元の選択を元の順のまま書く (値を変えていない項目を壊さない)
 * - tags から読み取っていた選択肢のうち、fields に残ったもの・UI で選択を
 *   外したものは、その label と tagKey が一致するタグを tags から外す
 * - UI では選ばれたままなのに sanitize で落ちたもの (1 つだけの項目に旧タグが
 *   2 つ以上一致していた場合など) は、元のタグを tags に戻す。データを消さないため
 *
 * `tags` はタグ欄の値 (initialFreeTagsForEdit で外した後でも、元の post.tags でもよい)。
 * 項目が無いスレッドでは fields は元の投稿のまま触らない。
 * tags は sanitizeTagsForRecord 済みで返す。
 */
export function buildEditedPostFields(
  post: HasFieldValues,
  defs: FieldDef[],
  values: FieldValue[],
  tags: string[],
): { fields: FieldValue[] | undefined; tags: string[] | undefined } {
  if (!hasInputFields(defs)) {
    return { fields: post.fields, tags: sanitizeTagsForRecord(tags) };
  }

  const optionIdsOf = (list: FieldValue[], fieldId: string): Set<string> => {
    const v = list.find((x) => x.field === fieldId);
    return new Set(v?.$type === VALUE_TYPES.select ? v.options : []);
  };
  const resolved = resolveFieldValues(post, defs);

  // 値を変えていない 1 つだけの select は、元の選択を元の順で書く
  const original = new Map<string, string[]>();
  for (const r of resolved) {
    if (r.field.type !== "select" || r.field.multiple || !r.optionIds) continue;
    const before = new Set(r.optionIds);
    const after = optionIdsOf(values, r.field.id);
    const same =
      before.size === after.size && [...before].every((id) => after.has(id));
    if (same) {
      original.set(r.field.id, r.optionIds);
    }
  }
  const fields = postFieldsForInputThread(
    defs,
    values.map((v) => {
      const options = original.get(v.field);
      return options && v.$type === VALUE_TYPES.select ? { ...v, options } : v;
    }),
    { keepMultiple: new Set(original.keys()) },
  );

  const removeKeys = new Set<string>();
  const restoreKeys = new Set<string>();
  for (const r of resolved) {
    if (r.source !== "tags" || !r.optionIds) continue;
    const kept = optionIdsOf(fields, r.field.id);
    const selected = optionIdsOf(values, r.field.id);
    const ids = new Set(r.optionIds);
    for (const opt of r.field.options ?? []) {
      if (!ids.has(opt.id)) continue;
      const key = tagKey(opt.label);
      if (kept.has(opt.id) || !selected.has(opt.id)) removeKeys.add(key);
      else restoreKeys.add(key);
    }
  }

  const current = new Set(tags.map(tagKey));
  // 戻すタグは元の post.tags の順で先頭に置く
  const restored = (post.tags ?? []).filter(
    (t) => restoreKeys.has(tagKey(t)) && !current.has(tagKey(t)),
  );
  return {
    fields,
    tags: sanitizeTagsForRecord([
      ...restored,
      ...tags.filter((t) => !removeKeys.has(tagKey(t))),
    ]),
  };
}

/**
 * 新規投稿の tags から、選んだ選択肢の label と tagKey が一致するタグを外す。
 * 選択の値は fields 側にだけ書く (tags との二重書きを避ける)。
 * `fields` は sanitizePostFieldsForRecord 済みのものを渡す。
 */
export function stripSelectedOptionTags(
  tags: string[],
  fields: FieldValue[] | undefined,
  defs: FieldDef[],
): string[] {
  const keys = new Set<string>();
  for (const r of resolveFieldValues({ fields: fields ?? [] }, defs)) {
    if (!r.optionIds) continue;
    const ids = new Set(r.optionIds);
    for (const opt of r.field.options ?? []) {
      if (ids.has(opt.id)) keys.add(tagKey(opt.label));
    }
  }
  return tags.filter((t) => !keys.has(tagKey(t)));
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

/**
 * 他のスレッドの定義を複製する。archived の項目・選択肢は持ち込まず、
 * 項目と選択肢の id はすべて振り直す (コピー後は元のスレッドと独立させる)。
 * archived を除くと選択肢が無くなる select は落とす。MAX_FIELDS 件で打ち切る。
 * 戻り値は未サニタイズ。保存前に必ず sanitizeFieldsForRecord を通すこと。
 */
export function copyFieldDefs(defs: FieldDef[]): FieldDef[] {
  const out: FieldDef[] = [];
  for (const def of defs) {
    if (out.length >= MAX_FIELDS) break;
    if (def.archived) continue;
    const next: FieldDef = { ...def, id: generateFieldId() };
    if (def.type === "select") {
      next.options = (def.options ?? [])
        .filter((o) => !o.archived)
        .map((o) => ({ id: generateFieldId(), label: o.label }));
      if (next.options.length === 0) continue;
    }
    out.push(next);
  }
  return out;
}

// ─── 定義エディタ (スレッド編集画面) ───────────────────────────

/** 編集中の選択肢。並べ替えても入力が壊れないよう id を key にする */
export interface EditableFieldOption {
  id: string;
  label: string;
  archived: boolean;
  /** 保存済みの選択肢か。保存済みは削除せず非表示 (archived) にする */
  saved: boolean;
  /** 保存済みの名前。空のまま入力欄を離れたら戻す。未保存は undefined */
  savedLabel?: string;
}

/** 編集中の記録項目。型ごとに使わない値も持っておき、保存時に sanitize で落とす */
export interface EditableField {
  id: string;
  label: string;
  type: FieldType;
  multiple: boolean;
  options: EditableFieldOption[];
  unit: string;
  /** 未設定 (= 0 桁) は undefined。保存済みの値は 0 も含めてそのまま保つ */
  scale?: number;
  archived: boolean;
  /** 保存済みの項目か。保存済みは種類を変えられず、削除せず非表示にする */
  saved: boolean;
  /** 保存時点の multiple。複数 → 1 つだけ に変えたときの注記に使う */
  savedMultiple: boolean;
  /** 保存済みの名前。空のまま入力欄を離れたら戻す。未保存は undefined */
  savedLabel?: string;
}

export function toEditableField(def: FieldDef, saved: boolean): EditableField {
  return {
    id: def.id,
    label: def.label,
    type: def.type,
    multiple: Boolean(def.multiple),
    options: (def.options ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      archived: Boolean(o.archived),
      saved,
      savedLabel: saved ? o.label : undefined,
    })),
    unit: def.unit ?? "",
    scale: def.scale,
    archived: Boolean(def.archived),
    saved,
    savedMultiple: saved && Boolean(def.multiple),
    savedLabel: saved ? def.label : undefined,
  };
}

export function toFieldDef(f: EditableField): FieldDef {
  return {
    id: f.id,
    label: f.label,
    type: f.type,
    multiple: f.multiple,
    options: f.options.map((o) => ({
      id: o.id,
      label: o.label,
      archived: o.archived || undefined,
    })),
    unit: f.unit,
    scale: f.scale,
    archived: f.archived || undefined,
  };
}

/** 表示・保存の順。非表示の項目は最後にまとめる (それぞれの中の順は保つ) */
export function orderFields<T extends { archived?: boolean }>(fields: T[]): T[] {
  return [
    ...fields.filter((f) => !f.archived),
    ...fields.filter((f) => f.archived),
  ];
}

/**
 * 編集中の定義が保存済みの定義から変わったか。両辺を同じ順序規則と
 * sanitize に通してから比べる (PDS は record を DAG-CBOR の正準キー順で返すので、
 * 生の record と JSON で比べるとキー順の違いだけで常に差分になる)。
 */
export function fieldDefsDirty(
  editing: EditableField[],
  saved: FieldDef[] | undefined,
): boolean {
  const next = sanitizeFieldsForRecord(orderFields(editing).map(toFieldDef));
  const prev = sanitizeFieldsForRecord(orderFields(saved ?? []));
  return JSON.stringify(next ?? []) !== JSON.stringify(prev ?? []);
}

/** 選択肢名の比較キー。保存時と同じ normalizeTag を通してから tagKey を取る */
function optionLabelKey(label: string): string | null {
  const normalized = normalizeTag(label);
  return normalized === null ? null : tagKey(normalized);
}

/**
 * 同じ項目内に同じ名前 (normalizeTag 後に tagKey 一致) の選択肢があるか。
 * archived の選択肢も対象。`exceptId` はその選択肢自身を除くため (改名時)。
 */
export function optionLabelTaken(
  options: { id: string; label: string }[],
  label: string,
  exceptId?: string,
): boolean {
  const key = optionLabelKey(label);
  if (key === null) return false;
  return options.some(
    (o) => o.id !== exceptId && optionLabelKey(o.label) === key,
  );
}

/** 項目名の空判定。trim して空なら空 */
export const isBlankFieldLabel = (label: string): boolean => !label.trim();
/** 選択肢名の空判定。保存時の normalizeTag で消える (`#` や `，` だけ等) なら空 */
export const isBlankOptionLabel = (label: string): boolean =>
  normalizeTag(label) === null;

/**
 * 保存を止める定義の不備。項目 id → 理由。archived の項目は対象外。
 * - "label": 項目名が空
 * - "options": select で、名前のある選択肢が 1 件も無い (非表示の選択肢も数える。
 *   sanitizeFieldsForRecord が項目ごと落とす条件と揃える)
 * 空のまま保存すると sanitize で項目ごと落ち、無警告で消えるため保存前に止める。
 */
export function fieldDefErrors(
  editing: EditableField[],
): Map<string, "label" | "options"> {
  const errors = new Map<string, "label" | "options">();
  for (const f of editing) {
    if (f.archived) continue;
    if (isBlankFieldLabel(f.label)) {
      errors.set(f.id, "label");
    } else if (
      f.type === "select" &&
      !f.options.some((o) => !isBlankOptionLabel(o.label))
    ) {
      errors.set(f.id, "options");
    }
  }
  return errors;
}

/**
 * 名前の入力欄を離れたときの値。保存済みの項目・選択肢の名前が空なら
 * 保存済みの名前に戻す (空のまま保存すると sanitize で落ちて実質削除になるため)。
 * 未保存 (`saved` が undefined) はそのまま返す。空判定は既定で trim。
 */
export function restoreBlankLabel(
  label: string,
  saved?: string,
  isBlank: (label: string) => boolean = isBlankFieldLabel,
): string {
  return saved !== undefined && isBlank(label) ? saved : label;
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

// ─── 絞り込みバー (タイムライン / 記録帳) ─────────────────────────
// 仕様は docs/record-mode.md §3.1〜3.2, §4.2。

/** 項目 id → 選択した option id (FIELD_UNSET を含む)。空配列のキーは持たない */
export type FieldSelection = Record<string, string[]>;

/** 選択肢を押したときの新しい選択。あれば外し、無ければ足す。空になったキーは削除。入力は変更しない */
export function toggleFieldOption(
  selection: FieldSelection,
  fieldId: string,
  optionId: string,
): FieldSelection {
  const current = selection[fieldId] ?? [];
  const next = current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
  const out: FieldSelection = { ...selection };
  if (next.length > 0) out[fieldId] = next;
  else delete out[fieldId];
  return out;
}

/**
 * 定義に無い項目・選択肢、全投稿で件数 0 の選択肢を選択から落とす。
 * select 以外の項目 id も落とす (絞り込みの条件にならないため)。
 * 変化が無ければ同じ参照を返す (setState の無駄な更新を避ける)。
 * FIELD_UNSET は未設定件数 > 0 のときだけ残す。
 */
export function pruneFieldSelection(
  selection: FieldSelection,
  defs: FieldDef[],
  posts: HasFieldValues[],
): FieldSelection {
  const defById = new Map(defs.map((d) => [d.id, d]));
  const out: FieldSelection = {};
  let changed = false;
  for (const [fieldId, ids] of Object.entries(selection)) {
    const def = defById.get(fieldId);
    if (!def || def.type !== "select") {
      changed = true;
      continue;
    }
    const available = new Set(
      countSelectOptions(posts, def)
        .filter((c) => c.count > 0)
        .map((c) => c.optionId),
    );
    const kept = ids.filter((id) => available.has(id));
    if (kept.length !== ids.length) changed = true;
    if (kept.length > 0) out[fieldId] = kept;
    else changed = true;
  }
  return changed ? out : selection;
}

/** 自由タグ (選択肢扱いのタグを除く) の件数。countTags と同じ並び */
export function countFreeTags(
  posts: HasFieldValues[],
  defs: FieldDef[],
): TagCount[] {
  if (defs.length === 0) return countTags(posts);
  return countTags(
    posts.map((post) => ({ tags: initialFreeTagsForEdit(post, defs) })),
  );
}

export interface FieldFilterChip {
  /** option id または FIELD_UNSET */
  optionId: string;
  /** option.label / "未設定" */
  label: string;
  archived: boolean;
  /** 全投稿での件数 */
  total: number;
  /** 他条件 (他項目 + タグ) を当てた上での件数 */
  count: number;
  active: boolean;
  /** !active && count === 0 */
  disabled: boolean;
}

export interface FieldFilterGroup {
  field: FieldDef;
  chips: FieldFilterChip[];
}

/**
 * 絞り込みバーに出す select 項目ごとのチップ。
 * - 対象は type === "select" の定義 (archived 含む)。定義順
 * - chips は options 順で非 archived → archived、最後に FIELD_UNSET
 * - total === 0 かつ非選択のチップは含めない。chips が空になった項目は返さない
 * - 項目が archived か、全投稿を通して値が 1 件も無い (未設定だけ) 項目は、
 *   その項目の選択肢 (FIELD_UNSET 含む) が 1 つも選択されていなければ返さない。
 *   値の有無は他条件を当てる前の total で判定する
 * - count は「当該項目以外の選択 + タグ + 範囲」で絞った投稿での件数 (ファセット方式)。
 *   項目内は OR なので、この数がそのチップを足したときに増える件数になる
 */
export function fieldFilterGroups(
  posts: HasFieldValues[],
  defs: FieldDef[],
  selection: FieldSelection,
  tagKeys: string[],
  ranges: RangeSelection = {},
): FieldFilterGroup[] {
  const out: FieldFilterGroup[] = [];
  for (const def of defs) {
    if (def.type !== "select") continue;
    const others: FieldSelection = { ...selection };
    delete others[def.id];
    const base = filterPostsByRanges(
      filterPostsByTags(filterPostsByFields(posts, defs, others), tagKeys),
      defs,
      ranges,
    );
    const totals = new Map(
      countSelectOptions(posts, def).map((c) => [c.optionId, c.count]),
    );
    const counts = new Map(
      countSelectOptions(base, def).map((c) => [c.optionId, c.count]),
    );
    const active = new Set(selection[def.id] ?? []);
    const hasValue = [...totals].some(
      ([optionId, total]) => optionId !== FIELD_UNSET && total > 0,
    );
    if ((def.archived || !hasValue) && active.size === 0) continue;

    const chip = (
      optionId: string,
      label: string,
      archived: boolean,
    ): FieldFilterChip | null => {
      const total = totals.get(optionId) ?? 0;
      const isActive = active.has(optionId);
      if (total === 0 && !isActive) return null;
      const count = counts.get(optionId) ?? 0;
      return {
        optionId,
        label,
        archived,
        total,
        count,
        active: isActive,
        disabled: !isActive && count === 0,
      };
    };

    const chips = [
      ...orderFields(def.options ?? []).map((o) =>
        chip(o.id, o.label, Boolean(o.archived)),
      ),
      chip(FIELD_UNSET, "未設定", false),
    ].filter((c): c is FieldFilterChip => c !== null);
    if (chips.length > 0) out.push({ field: def, chips });
  }
  return out;
}

export interface FreeTagChip extends TagCount {
  active: boolean;
  disabled: boolean;
  /** 項目の選択と範囲で絞った投稿に、このタグを足したときの件数 */
  facetCount: number;
}

/**
 * 自由タグのチップ。並びは countFreeTags (件数順)。
 * facetCount = countWithTagAdded(filterPostsByRanges(filterPostsByFields(posts, defs, selection), defs, ranges), tagKeys, key)
 * disabled = !active && facetCount === 0
 */
export function freeTagChips(
  posts: HasFieldValues[],
  defs: FieldDef[],
  selection: FieldSelection,
  tagKeys: string[],
  ranges: RangeSelection = {},
): FreeTagChip[] {
  const base = filterPostsByRanges(
    filterPostsByFields(posts, defs, selection),
    defs,
    ranges,
  );
  return countFreeTags(posts, defs).map((t) => {
    const active = tagKeys.includes(t.key);
    const facetCount = countWithTagAdded(base, tagKeys, t.key);
    return { ...t, active, facetCount, disabled: !active && facetCount === 0 };
  });
}

/** 項目 → タグ → 範囲の順で絞る。すべて空なら同じ参照を返す */
export function filterPostsByFieldsAndTags<T extends HasFieldValues>(
  posts: T[],
  defs: FieldDef[],
  selection: FieldSelection,
  tagKeys: string[],
  ranges: RangeSelection = {},
): T[] {
  return filterPostsByRanges(
    filterPostsByTags(filterPostsByFields(posts, defs, selection), tagKeys),
    defs,
    ranges,
  );
}

// ─── 範囲絞り込み (#74) ───────────────────────────────────────
// 仕様は docs/record-mode.md §3.1〜3.2。対象は number 項目だけ (duration は対象外)。

/** 入力欄の生文字列。解釈は読み取り側 (effectiveRange) で行う */
export interface RangeInput {
  min: string;
  max: string;
}
/** 項目 id → 入力。両方空のキーは持たない */
export type RangeSelection = Record<string, RangeInput>;
export const EMPTY_RANGE_INPUT: RangeInput = { min: "", max: "" };

/** 範囲で絞れる項目か (number のみ) */
export function isRangeField(def: FieldDef): boolean {
  return def.type === "number";
}

/**
 * 境界 1 つを数値にする。NFKC 正規化 (全角数字 → 半角) と trim の後に空なら null、
 * 解釈できなければ "invalid"。DECIMAL_PATTERN かつ MAX_NUMBER_VALUE_LENGTH 以内なら Number()。
 * 範囲項目でない def には常に "invalid"
 */
export function parseRangeBound(
  raw: string,
  def: FieldDef,
): number | null | "invalid" {
  if (!isRangeField(def)) return "invalid";
  const s = raw.normalize("NFKC").trim();
  if (!s) return null;
  return isValidDecimal(s) ? Number(s) : "invalid";
}

/** 解釈できた境界だけ。両方 null なら null (= 条件にしない)。不正な側は無視する */
export function effectiveRange(
  input: RangeInput | undefined,
  def: FieldDef,
): { min: number | null; max: number | null } | null {
  if (!input) return null;
  const bound = (raw: string) => {
    const v = parseRangeBound(raw, def);
    return v === "invalid" ? null : v;
  };
  const min = bound(input.min);
  const max = bound(input.max);
  return min === null && max === null ? null : { min, max };
}

/** 投稿のその項目の数値。number 項目の有効な 10 進文字列だけ。無ければ null */
export function numericValueOf(
  post: HasFieldValues,
  def: FieldDef,
): number | null {
  if (!isRangeField(def)) return null;
  const value = resolveFieldValues(post, [def])[0]?.value;
  return isValidDecimal(value) ? Number(value) : null;
}

/**
 * 境界を更新した新しい選択。trim 後に空ならその端は空にし、両方空になったキーは削除。
 * 入力は変更しない
 */
export function setRangeBound(
  ranges: RangeSelection,
  fieldId: string,
  bound: "min" | "max",
  raw: string,
): RangeSelection {
  const next: RangeInput = {
    ...(ranges[fieldId] ?? EMPTY_RANGE_INPUT),
    [bound]: raw.trim() ? raw : "",
  };
  const out: RangeSelection = { ...ranges };
  if (next.min || next.max) out[fieldId] = next;
  else delete out[fieldId];
  return out;
}

/**
 * 定義に無い・範囲項目でない・archived の項目 id と、両方空のキーを落とす。
 * 項目を非表示・削除したときに、見えない条件で 0 件のまま抜けられなくなるのを防ぐ。
 * 変化が無ければ同じ参照を返す (setState の無駄な更新を避ける)
 */
export function pruneRangeSelection(
  ranges: RangeSelection,
  defs: FieldDef[],
): RangeSelection {
  const defById = new Map(defs.map((d) => [d.id, d]));
  const out: RangeSelection = {};
  let changed = false;
  for (const [fieldId, input] of Object.entries(ranges)) {
    const def = defById.get(fieldId);
    if (!def || !isRangeField(def) || def.archived || (!input.min && !input.max)) {
      changed = true;
      continue;
    }
    out[fieldId] = input;
  }
  return changed ? out : ranges;
}

/** 生文字列が 1 つでも入っているか (不正値でも true。クリアボタンの表示に使う) */
export function hasRangeInput(ranges: RangeSelection): boolean {
  return Object.values(ranges).some((r) => Boolean(r.min || r.max));
}

/**
 * 範囲で絞る。effectiveRange が null の項目は条件にしない。項目間 AND。
 * 値の無い投稿は一致しない。両端を含む。条件が無ければ同じ参照を返す
 */
export function filterPostsByRanges<T extends HasFieldValues>(
  posts: T[],
  defs: FieldDef[],
  ranges: RangeSelection,
): T[] {
  const conditions = defs.flatMap((def) => {
    const range = effectiveRange(ranges[def.id], def);
    return range ? [{ def, ...range }] : [];
  });
  if (conditions.length === 0) return posts;
  return posts.filter((post) =>
    conditions.every(({ def, min, max }) => {
      const v = numericValueOf(post, def);
      if (v === null) return false;
      return (min === null || v >= min) && (max === null || v <= max);
    }),
  );
}

export interface RangeFilterRow {
  field: FieldDef;
  /** 無ければ EMPTY_RANGE_INPUT */
  input: RangeInput;
  /** effectiveRange !== null */
  active: boolean;
  /** parseRangeBound === "invalid" */
  invalid: { min: boolean; max: boolean };
  /** 全投稿での値の最小・最大 (placeholder 用)。値が無ければ null */
  span: { min: number; max: number } | null;
  /** 他条件 (select・タグ・他項目の範囲) を当てた上で、この範囲に一致する件数 */
  count: number;
  /** 他条件を当てた上で、値を持つ投稿数 */
  withValue: number;
}

/**
 * 絞り込みバーの範囲行。定義順。対象は範囲項目のうち
 * 「archived でなく、全投稿で値を持つ投稿が 1 件以上」か「入力が空でない」もの。
 * count / withValue は select・タグ・当該項目以外の範囲で絞った投稿で数える (ファセット方式)
 */
export function rangeFilterRows(
  posts: HasFieldValues[],
  defs: FieldDef[],
  selection: FieldSelection,
  tagKeys: string[],
  ranges: RangeSelection,
): RangeFilterRow[] {
  const out: RangeFilterRow[] = [];
  let filtered: HasFieldValues[] | null = null;
  for (const def of defs) {
    if (!isRangeField(def)) continue;
    const input = ranges[def.id] ?? EMPTY_RANGE_INPUT;
    const hasInput = Boolean(input.min || input.max);
    const values = posts
      .map((p) => numericValueOf(p, def))
      .filter((v): v is number => v !== null);
    if (!hasInput && (def.archived || values.length === 0)) continue;

    filtered ??= filterPostsByTags(
      filterPostsByFields(posts, defs, selection),
      tagKeys,
    );
    const others: RangeSelection = { ...ranges };
    delete others[def.id];
    const base = filterPostsByRanges(filtered, defs, others);
    const own: RangeSelection = hasInput ? { [def.id]: input } : {};
    out.push({
      field: def,
      input,
      active: effectiveRange(input, def) !== null,
      invalid: {
        min: parseRangeBound(input.min, def) === "invalid",
        max: parseRangeBound(input.max, def) === "invalid",
      },
      span:
        values.length > 0
          ? { min: Math.min(...values), max: Math.max(...values) }
          : null,
      count: filterPostsByRanges(base, defs, own).length,
      withValue: base.filter((p) => numericValueOf(p, def) !== null).length,
    });
  }
  return out;
}

/** 入力欄・placeholder 用の表記 */
export function formatRangeBound(value: number): string {
  return String(value);
}
