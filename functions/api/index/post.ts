/**
 * POST /api/index/post  { "postUri": "at://did:.../net.shino3.trailcast.post/<rkey>" }
 *
 * 投稿・編集・削除の直後にクライアントから叩く write-through 入口 (#14 の方式 A)。
 * リクエストは at-uri だけを受け取り、実在するか / どのスレッドに属するか /
 * そのスレッドが Public かは Worker が PDS に問い合わせて判定する。
 * したがってクライアント認証は不要で、嘘の紐付けは書き込めない。
 *
 * PDS 上に無ければ (= 削除済み) インデックスからも消すので、削除の伝播も兼ねる。
 */

import { errorJson, json, preflight, requireDb } from "../../_index-db";
import {
  deleteStatement,
  upsertStatement,
  verifyPostUri,
} from "../../_index-db";
import type { PagesFunctionContext } from "../../_types";

export const onRequestOptions = () => preflight();

export const onRequestPost = async (
  ctx: PagesFunctionContext,
): Promise<Response> => {
  const db = requireDb(ctx.env);
  if (db instanceof Response) return db;

  let postUri: unknown;
  try {
    const body = (await ctx.request.json()) as { postUri?: unknown };
    postUri = body?.postUri;
  } catch {
    return errorJson("JSON ボディを読めませんでした", 400);
  }
  if (typeof postUri !== "string" || !postUri) {
    return errorJson("postUri が必要です", 400);
  }

  const outcome = await verifyPostUri(postUri);

  switch (outcome.status) {
    case "indexed":
      await upsertStatement(db, outcome.row, new Date().toISOString()).run();
      return json({ postUri, indexed: true });

    case "gone":
      // PDS 上で削除済み。インデックスからも消す (削除の伝播)
      await deleteStatement(db, postUri).run();
      return json({ postUri, indexed: false, deleted: true });

    case "skipped":
      // Private スレッドに移された等。載せず、既存行があれば消す
      await deleteStatement(db, postUri).run();
      return json({ postUri, indexed: false, reason: outcome.reason });

    case "error":
      return errorJson(outcome.reason, 400);
  }
};
