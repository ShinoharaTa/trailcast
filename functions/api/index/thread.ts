/**
 * GET /api/index/thread?uri=<thread at-uri>[&limit=][&cursor=]
 *
 * スレッドに紐づく post の at-uri を checkpoint_at 昇順で返す。
 * 本文は返さない。クライアントは受け取った at-uri を各 PDS から取得する。
 */

import { NSID_THREAD, parseAtUri } from "../../_atproto";
import { errorJson, json, preflight, requireDb } from "../../_index-db";
import type { PagesFunctionContext } from "../../_types";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

interface Row {
  post_uri: string;
  author_did: string;
  cid: string;
  checkpoint_at: string;
}

export const onRequestOptions = () => preflight();

export const onRequestGet = async (
  ctx: PagesFunctionContext,
): Promise<Response> => {
  const db = requireDb(ctx.env);
  if (db instanceof Response) return db;

  const url = new URL(ctx.request.url);
  const threadUri = url.searchParams.get("uri") ?? "";
  const parts = parseAtUri(threadUri);
  if (!parts || parts.collection !== NSID_THREAD) {
    return errorJson("uri は thread の at-uri を指定してください", 400);
  }

  const limit = clampLimit(url.searchParams.get("limit"));
  // keyset ページング。前ページ末尾の (checkpoint_at, post_uri) を持ち回る
  const decoded = decodeCursor(url.searchParams.get("cursor"));
  if (decoded === "invalid") return errorJson("cursor が不正です", 400);
  const curAt = decoded?.[0] ?? null;
  const curUri = decoded?.[1] ?? "";

  const stmt =
    curAt !== null
      ? db
          .prepare(
            `SELECT post_uri, author_did, cid, checkpoint_at
               FROM post_index
              WHERE thread_uri = ?
                AND (checkpoint_at > ? OR (checkpoint_at = ? AND post_uri > ?))
              ORDER BY checkpoint_at ASC, post_uri ASC
              LIMIT ?`,
          )
          .bind(threadUri, curAt, curAt, curUri, limit)
      : db
          .prepare(
            `SELECT post_uri, author_did, cid, checkpoint_at
               FROM post_index
              WHERE thread_uri = ?
              ORDER BY checkpoint_at ASC, post_uri ASC
              LIMIT ?`,
          )
          .bind(threadUri, limit);

  const { results } = await stmt.all<Row>();
  const last = results.length === limit ? results[results.length - 1] : null;

  return json({
    threadUri,
    posts: results,
    cursor: last ? encodeCursor(last.checkpoint_at, last.post_uri) : undefined,
  });
};

function clampLimit(raw: string | null): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * cursor は (checkpoint_at, post_uri) の組。区切り文字を選ぶと at-uri や
 * ISO 文字列との衝突を毎回気にすることになるので、JSON を base64url に包んで
 * 不透明な文字列として扱う。
 */
function encodeCursor(checkpointAt: string, postUri: string): string {
  const json = JSON.stringify([checkpointAt, postUri]);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeCursor(raw: string | null): [string, string] | null | "invalid" {
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    ) {
      return [parsed[0], parsed[1]];
    }
    return "invalid";
  } catch {
    return "invalid";
  }
}
