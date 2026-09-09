/**
 * GET /api/index/status?did=<did>
 *
 * 設定画面に出す、そのユーザーのインデックス状態。
 * まだ一度も同期していなければ lastSyncedAt は null。
 */

import { errorJson, json, preflight, requireDb } from "../../_index-db";
import type { PagesFunctionContext } from "../../_types";

export const onRequestOptions = () => preflight();

export const onRequestGet = async (
  ctx: PagesFunctionContext,
): Promise<Response> => {
  const db = requireDb(ctx.env);
  if (db instanceof Response) return db;

  const did = new URL(ctx.request.url).searchParams.get("did") ?? "";
  if (!did.startsWith("did:")) return errorJson("did が必要です", 400);

  const state = await db
    .prepare(
      "SELECT last_synced_at, post_count FROM sync_state WHERE author_did = ?",
    )
    .bind(did)
    .first<{ last_synced_at: string; post_count: number }>();

  // sync_state は最後の同期時点のスナップショット。write-through で増えた分も
  // 見せたいので、件数は post_index から数え直す。
  const live = await db
    .prepare("SELECT COUNT(*) AS n FROM post_index WHERE author_did = ?")
    .bind(did)
    .first<{ n: number }>();

  return json({
    did,
    lastSyncedAt: state?.last_synced_at ?? null,
    postCount: live?.n ?? 0,
    lastSyncedPostCount: state?.post_count ?? null,
  });
};
