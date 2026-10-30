// 自分の旧投稿をタグから記録項目へ書き換える (#62)。
//
// post.fields を持たず、tags から記録項目の値を読み取っている自分の投稿を対象に、
// 編集画面で何も触らずに保存したのと同じ fields / tags を 1 件ずつ書き戻す。
// 仕様は docs/remaining-spec.md §3、書き込みルールは docs/custom-fields.md §3。

import {
  buildEditedPostFields,
  fieldValuesFromResolved,
  resolveFieldValues,
} from "@/lib/fields";
import { rewritePost } from "@/lib/pds/posts";
import { sortByCheckpoint, splitPostText } from "@/lib/record";
import { tagKey } from "@/lib/tags";
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
 * - post.fields がプロパティとして存在する → null
 * - defs に入力できる項目（非 archived）が無い → null（buildEditedPostFields が fields を書かないため）
 * - resolveFieldValues(post, defs) に source "tags" の値が無い → null
 * 書き込み内容は buildEditedPostFields(post, defs, fieldValuesFromResolved(resolved), post.tags ?? []) と同一
 */
export function planFieldMigration(
  post: PostWithMeta,
  defs: FieldDef[],
): MigrationPlan | null {
  if (post.fields !== undefined) return null;
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
