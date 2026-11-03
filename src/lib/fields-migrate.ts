// 自分の旧投稿をタグから記録項目へ書き換える (#62)。
//
// post.fields を持たず、tags から記録項目の値を読み取っている自分の投稿を対象に、
// 編集画面で何も触らずに保存したのと同じ fields / tags を 1 件ずつ書き戻す。
// post.fields を持つ投稿も、tags に選択肢と同名のタグが残っていれば対象にする (#104)。
// 仕様は docs/remaining-spec.md §3、書き込みルールは docs/custom-fields.md §3。

import {
  buildEditedPostFields,
  fieldValuesFromResolved,
  resolveFieldValues,
  sanitizePostFieldsForRecord,
} from "@/lib/fields";
import { rewritePost } from "@/lib/pds/posts";
import { sortByCheckpoint, splitPostText } from "@/lib/record";
import { normalizeTag, sanitizeTagsForRecord, tagKey } from "@/lib/tags";
import type { FieldDef, FieldValue, PostRecord, PostWithMeta } from "@/lib/types";
import { parseAtUri, stripRecordMeta } from "@/lib/types";

export interface MigrationPlan {
  post: PostWithMeta;
  /** 書き込む fields（sanitize 済み。空でも [] — custom-fields §3 のルール） */
  fields: FieldValue[];
  /** 書き込む tags（sanitize 済み）。空なら undefined（キーを書かない） */
  tags: string[] | undefined;
  /** tags から外れるタグ（元の表記、元の順） */
  movedTags: string[];
  /** プレビュー用: 項目ごとに移る選択肢名 */
  moved: { field: FieldDef; labels: string[] }[];
}

/**
 * 対象なら計画、対象外なら null。
 * - post.fields がプロパティとして存在する → planTaggedFieldsMigration (#104)
 * - defs に入力できる項目（非 archived）が無い → null（buildEditedPostFields が fields を書かないため）
 * - resolveFieldValues(post, defs) に source "tags" の値が無い → null
 * 書き込み内容は buildEditedPostFields(post, defs, fieldValuesFromResolved(resolved), post.tags ?? []) と同一
 */
export function planFieldMigration(
  post: PostWithMeta,
  defs: FieldDef[],
): MigrationPlan | null {
  if (post.fields !== undefined) return planTaggedFieldsMigration(post, defs);
  if (!defs.some((d) => !d.archived)) return null;
  const resolved = resolveFieldValues(post, defs);
  const fromTags = resolved.filter((r) => r.source === "tags" && r.optionIds);
  if (fromTags.length === 0) return null;

  const built = buildEditedPostFields(
    post,
    defs,
    fieldValuesFromResolved(resolved),
    post.tags ?? [],
  );
  const fields = built.fields ?? [];
  const tags = built.tags;

  // fields に書かれた選択肢だけを「移る」ものとして数える
  const written = new Map<string, Set<string>>();
  for (const v of fields) {
    if ("options" in v) written.set(v.field, new Set(v.options));
  }
  const moved: MigrationPlan["moved"] = [];
  const movedKeys = new Set<string>();
  for (const r of fromTags) {
    const ids = written.get(r.field.id);
    if (!ids) continue;
    const byId = new Map((r.field.options ?? []).map((o) => [o.id, o]));
    const labels: string[] = [];
    for (const id of r.optionIds ?? []) {
      const opt = byId.get(id);
      if (!opt || !ids.has(id)) continue;
      labels.push(opt.label);
      movedKeys.add(tagKey(opt.label));
    }
    if (labels.length > 0) moved.push({ field: r.field, labels });
  }
  const kept = new Set((tags ?? []).map(tagKey));
  const movedTags = (post.tags ?? []).filter(
    (t) => movedKeys.has(tagKey(t)) && !kept.has(tagKey(t)),
  );

  return { post, fields, tags, movedTags, moved };
}

/**
 * post.fields を持つ投稿で、tags に選択肢と同名のタグが残っているもの (#104)。
 * - 対象は非 archived の select 項目の、非 archived の選択肢で、tagKey が post.tags に一致するもの
 * - 既に選択済みの選択肢と同名のタグは tags から外すだけ (fields は変わらない)
 * - multiple: 既存の選択 + 一致した選択肢 (定義順)
 * - 1 つだけ: 既存の値が空で一致がちょうど 1 件のときだけ書く。値あり・一致 2 件以上は
 *   その項目をスキップしてタグを残す (明示的な選択を上書きしない／曖昧なものを決めない)
 * - 同じ tagKey の選択肢が複数の項目にあるタグは、どの項目にも書かずタグを残す
 *   (どの項目の値か決められないため。1 つだけの項目の一致件数には含める。
 *   インポート (buildImportedPostFields) で残したタグを移行候補に出さないため)
 * - 書く項目も外すタグも無ければ null
 * - 既存の fields に理解できない値 (定義に無い項目・型違い・sanitize で変わる値・
 *   未知の選択肢 id・同じ項目の重複) があれば null。理解できないものは触らない
 * タグの突合は normalizeTag → tagKey で行う (`#解けた` も一致する)
 */
function planTaggedFieldsMigration(
  post: PostWithMeta,
  defs: FieldDef[],
): MigrationPlan | null {
  const postFields = post.fields ?? [];
  const keyOf = (tag: string): string | null => {
    const normalized = normalizeTag(tag);
    return normalized === null ? null : tagKey(normalized);
  };
  const tagKeys = new Set(
    (post.tags ?? []).map(keyOf).filter((k): k is string => k !== null),
  );
  if (tagKeys.size === 0) return null;

  // 同じ tagKey の選択肢を持つ項目の数 (非 archived の select・選択肢のみ)
  const fieldCountByKey = new Map<string, number>();
  for (const def of defs) {
    if (def.type !== "select" || def.archived) continue;
    const keys = new Set<string>();
    for (const o of def.options ?? []) {
      const key = o.archived ? null : keyOf(o.label);
      if (key !== null) keys.add(key);
    }
    for (const key of keys) {
      fieldCountByKey.set(key, (fieldCountByKey.get(key) ?? 0) + 1);
    }
  }
  const sharedKey = (o: { label: string }) =>
    (fieldCountByKey.get(keyOf(o.label) ?? "") ?? 0) > 1;

  const updated = new Map<string, FieldValue>();
  const moved: MigrationPlan["moved"] = [];
  const movedKeys = new Set<string>();
  for (const def of defs) {
    if (def.type !== "select" || def.archived) continue;
    const current = postFields.find((v) => v.field === def.id);
    const selected = current && "options" in current ? current.options : [];
    const selectedSet = new Set(selected);
    const hits = (def.options ?? []).filter(
      (o) => {
        const key = keyOf(o.label);
        return !o.archived && key !== null && tagKeys.has(key);
      },
    );
    // 既に選んである選択肢: タグを外すだけ
    const redundant = hits.filter((o) => selectedSet.has(o.id));
    let added = hits.filter((o) => !selectedSet.has(o.id));
    if (!def.multiple && (selected.length > 0 || added.length !== 1)) added = [];
    added = added.filter((o) => !sharedKey(o));
    if (added.length > 0) {
      updated.set(def.id, {
        $type: "net.shino3.trailcast.post#selectValue",
        field: def.id,
        options: [...selected, ...added.map((o) => o.id)],
      });
    }
    const labels = hits
      .filter((o) => selectedSet.has(o.id) || added.includes(o))
      .map((o) => o.label);
    if (labels.length === 0) continue;
    for (const o of [...redundant, ...added]) {
      const key = keyOf(o.label);
      if (key !== null) movedKeys.add(key);
    }
    moved.push({ field: def, labels });
  }
  if (moved.length === 0) return null;
  if (!existingFieldsUnderstood(postFields, defs, updated)) return null;

  const merged = postFields.map((v) => updated.get(v.field) ?? v);
  for (const [id, v] of updated) {
    if (!postFields.some((x) => x.field === id)) merged.push(v);
  }
  // 触っていない項目は元の値のまま (1 つだけの select に複数入っていても絞らない)
  const keepMultiple = new Set(
    postFields.map((v) => v.field).filter((id) => !updated.has(id)),
  );
  const fields = sanitizePostFieldsForRecord(merged, defs, { keepMultiple }) ?? [];
  const isMoved = (t: string) => {
    const key = keyOf(t);
    return key !== null && movedKeys.has(key);
  };
  const tags = sanitizeTagsForRecord((post.tags ?? []).filter((t) => !isMoved(t)));
  const movedTags = (post.tags ?? []).filter(isMoved);
  return { post, fields, tags, movedTags, moved };
}

/**
 * 既存の fields がそのまま書き戻せるか。
 * - 書き換えない値: 単独で sanitize して (keepMultiple) 前後が deep-equal
 * - 書き換える select の値: 選択肢 id がすべて定義にあり重複が無い (空は可)
 * - 定義に無い項目・同じ項目の重複は不可
 */
function existingFieldsUnderstood(
  postFields: FieldValue[],
  defs: FieldDef[],
  updated: Map<string, FieldValue>,
): boolean {
  const defById = new Map(defs.map((d) => [d.id, d]));
  const seen = new Set<string>();
  for (const v of postFields) {
    const def = defById.get(v.field);
    if (!def || seen.has(v.field)) return false;
    seen.add(v.field);
    if (updated.has(v.field)) {
      if (!("options" in v) || !Array.isArray(v.options)) return false;
      const known = new Set((def.options ?? []).map((o) => o.id));
      if (new Set(v.options).size !== v.options.length) return false;
      if (!v.options.every((id) => known.has(id))) return false;
      continue;
    }
    const sanitized = sanitizePostFieldsForRecord([v], defs, {
      keepMultiple: new Set([v.field]),
    });
    if (!sanitized || !sameValue(sanitized[0], v)) return false;
  }
  return true;
}

/** キー順を無視した JSON 値の比較 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** 自分の repo の投稿だけを対象に。checkpointAt 昇順（sortByCheckpoint "asc"）。myDid が null なら [] */
export function planFieldMigrations(
  posts: PostWithMeta[],
  defs: FieldDef[],
  myDid: string | null,
): MigrationPlan[] {
  if (!myDid) return [];
  const plans: MigrationPlan[] = [];
  for (const post of sortByCheckpoint(posts, "asc")) {
    // 参加者の投稿は自分の repo に無いので書けない
    if (parseAtUri(post.uri).repo !== myDid) continue;
    const plan = planFieldMigration(post, defs);
    if (plan) plans.push(plan);
  }
  return plans;
}

/** putRecord する record。{ ...stripRecordMeta(post), fields, tags }。tags が undefined ならキーを削除する */
export function migratedPostRecord(plan: MigrationPlan): PostRecord {
  const record: PostRecord = {
    ...stripRecordMeta(plan.post),
    fields: plan.fields,
    tags: plan.tags,
  };
  if (record.tags === undefined) delete record.tags;
  return record;
}

export interface MigrationFailure {
  uri: string;
  title: string;
  message: string;
}

export interface MigrationProgress {
  total: number;
  /** 成功 + 失敗 */
  done: number;
  succeeded: number;
  failed: number;
  /** 停止で途中終了した */
  aborted: boolean;
  failures: MigrationFailure[];
  currentUri?: string;
}

/**
 * 1 件ずつ順に書く。失敗は failures に積んで続行。signal.aborted なら次に進まず aborted = true。
 * write は差し替え可能（テスト用）。既定は rewritePost(plan.post.uri, migratedPostRecord(plan), plan.post.cid)。
 * 各件の前後で onProgress を呼ぶ（og/backfill.ts と同じ）。
 */
export async function runFieldMigration(
  plans: MigrationPlan[],
  opts: {
    onProgress?: (p: MigrationProgress) => void;
    signal?: AbortSignal;
    write?: (plan: MigrationPlan) => Promise<void>;
  } = {},
): Promise<MigrationProgress> {
  const write =
    opts.write ??
    (async (plan: MigrationPlan) => {
      await rewritePost(plan.post.uri, migratedPostRecord(plan), plan.post.cid);
    });
  const progress: MigrationProgress = {
    total: plans.length,
    done: 0,
    succeeded: 0,
    failed: 0,
    aborted: false,
    failures: [],
  };
  const report = () =>
    opts.onProgress?.({ ...progress, failures: [...progress.failures] });
  report();

  for (const plan of plans) {
    if (opts.signal?.aborted) {
      progress.aborted = true;
      break;
    }
    progress.currentUri = plan.post.uri;
    report();
    try {
      await write(plan);
      progress.succeeded += 1;
    } catch (e) {
      console.warn("[fields-migrate] failed for", plan.post.uri, e);
      progress.failed += 1;
      progress.failures.push({
        uri: plan.post.uri,
        title: migrationRowTitle(plan),
        message: migrationFailureMessage(e),
      });
    } finally {
      progress.done += 1;
      report();
    }
  }
  progress.currentUri = undefined;
  report();
  return { ...progress, failures: [...progress.failures] };
}

/**
 * 失敗理由の表示文言。swapRecord の不一致 (InvalidSwap) は読んだ後に他で編集されたことを示す。
 * @atproto/api の InvalidSwapError は XRPCError で error === "InvalidSwap" を持つ。
 */
export function migrationFailureMessage(e: unknown): string {
  if (
    typeof e === "object" &&
    e !== null &&
    (e as { error?: unknown }).error === "InvalidSwap"
  ) {
    return "他で編集されたため書き換えませんでした";
  }
  return e instanceof Error ? e.message : String(e);
}

/** プレビュー行の見出し。splitPostText(post.text).title を使う */
export function migrationRowTitle(plan: MigrationPlan): string {
  return splitPostText(plan.post.text).title;
}
