/**
 * POST /api/index/sync  { "did": "did:...", "cursor"?: string, "startedAt"?: string }
 *
 * 指定 repo の post を 1 ページ (100 件) 走査して、Public スレッドのものを
 * インデックスに upsert する (#14 の方式 C)。Worker の subrequest 上限を避けるため
 * 1 リクエスト = 1 ページとし、`cursor` が返る限りクライアントが呼び直す。
 * これがそのまま設定画面の進捗表示になる。
 *
 * 世代管理:
 *   最初の呼び出し (cursor 無し) で `startedAt` を発行し、以降クライアントが
 *   echo する。全ページを走り切った時点で `indexed_at < startedAt` の行を消す。
 *   PDS 側で削除された post、Private に変更されたスレッドの post がこれで落ちる。
 *   途中で中断した場合は消さないので、インデックスが欠けることはない。
 */

import { NSID_POST, listRecords, type PostRecord } from "../../_atproto";
import {
  deleteStatement,
  errorJson,
  json,
  preflight,
  requireDb,
  withDbErrors,
  upsertStatement,
  verifyPostValue,
} from "../../_index-db";
import type { D1PreparedStatement, PagesFunctionContext } from "../../_types";

const PAGE_SIZE = 100;

export const onRequestOptions = () => preflight();

export const onRequestPost = (ctx: PagesFunctionContext): Promise<Response> =>
  withDbErrors(() => handleSync(ctx));

async function handleSync(ctx: PagesFunctionContext): Promise<Response> {
  const db = requireDb(ctx.env);
  if (db instanceof Response) return db;

  let body: { did?: unknown; cursor?: unknown; startedAt?: unknown };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return errorJson("JSON ボディを読めませんでした", 400);
  }

  const did = body.did;
  if (typeof did !== "string" || !did.startsWith("did:")) {
    return errorJson("did が必要です", 400);
  }
  const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
  // 1 ページ目でだけサーバが発行する。以降はクライアントの echo を信用してよい
  // (世代 GC の閾値にしか使わず、古すぎる値は単に GC が効かないだけで害が無い)
  const startedAt =
    cursor && typeof body.startedAt === "string"
      ? body.startedAt
      : new Date().toISOString();

  const page = await listRecords<PostRecord>(did, NSID_POST, {
    limit: PAGE_SIZE,
    cursor,
  });
  if (!page) {
    return errorJson("PDS から listRecords できませんでした", 502);
  }

  const indexedAt = new Date().toISOString();
  const threadVisibility = new Map<string, string | null>();
  const statements: D1PreparedStatement[] = [];
  let indexed = 0;
  let skipped = 0;

  for (const record of page.records) {
    const outcome = await verifyPostValue(record, did, threadVisibility);
    if (outcome.status === "indexed") {
      statements.push(upsertStatement(db, outcome.row, indexedAt));
      indexed++;
    } else {
      // Private スレッド等。既存行が残っていれば落とす
      statements.push(deleteStatement(db, record.uri));
      skipped++;
    }
  }

  if (statements.length > 0) await db.batch(statements);

  // レコード 0 件で cursor だけ返る PDS もあるので、そちらも終端として扱う
  const done = !page.cursor || page.records.length === 0;

  if (done) {
    await db
      .prepare(
        "DELETE FROM post_index WHERE author_did = ? AND indexed_at < ?",
      )
      .bind(did, startedAt)
      .run();

    const row = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM post_index WHERE author_did = ?",
      )
      .bind(did)
      .first<{ n: number }>();
    const postCount = row?.n ?? 0;

    await db
      .prepare(
        `INSERT INTO sync_state (author_did, last_synced_at, post_count)
         VALUES (?, ?, ?)
         ON CONFLICT(author_did) DO UPDATE SET
           last_synced_at = excluded.last_synced_at,
           post_count     = excluded.post_count`,
      )
      .bind(did, indexedAt, postCount)
      .run();

    return json({ did, done: true, scanned: page.records.length, indexed, skipped, postCount });
  }

  return json({
    did,
    done: false,
    scanned: page.records.length,
    indexed,
    skipped,
    cursor: page.cursor,
    startedAt,
  });
};
