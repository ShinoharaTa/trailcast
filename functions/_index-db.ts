/**
 * Public スレッドの投稿集約インデックス (#14) の共通処理。
 *
 * 設計上の原則:
 *   - 正本は各ユーザーの PDS。D1 は at-uri の紐付けを持つ導出キャッシュで、
 *     全消ししても各ユーザーの sync で完全に再構築できる。
 *   - クライアントは「この at-uri を見て」と伝えるだけ。行を作る前に必ず
 *     Worker 側が PDS に getRecord して実在と thread フィールドを検証するので、
 *     クライアント認証なしでも嘘の紐付けを書き込めない。
 *   - インデックス対象は Public スレッドのみ。Private は単一 repo で完結し
 *     PDS 直読みで足りるため D1 に載せない。
 */

import {
  NSID_POST,
  NSID_THREAD,
  getRecord,
  getThreadRecord,
  parseAtUri,
  type PostRecord,
} from "./_atproto";
import type { D1Database } from "./_types";

export type VerifyOutcome =
  /** Public スレッドの実在する post。インデックスに載せる */
  | { status: "indexed"; row: PostIndexRow }
  /** PDS 上に無い。インデックスから消す */
  | { status: "gone" }
  /** 実在するがインデックス対象外 (Private スレッド等)。載せず、あれば消す */
  | { status: "skipped"; reason: string }
  /** 一時的な失敗。行はいじらない */
  | { status: "error"; reason: string };

export interface PostIndexRow {
  post_uri: string;
  thread_uri: string;
  author_did: string;
  cid: string;
  checkpoint_at: string;
}

/**
 * post の at-uri が本当に存在し、Public スレッドに紐づいているかを PDS で確認する。
 *
 * `threadVisibilityCache` を渡すと同一スレッドの visibility 解決を使い回す
 * (sync で 100 件走査するときの subrequest 節約)。
 */
export async function verifyPostUri(
  postUri: string,
  threadVisibilityCache?: Map<string, string | null>,
): Promise<VerifyOutcome> {
  const parts = parseAtUri(postUri);
  if (!parts) return { status: "error", reason: "invalid at-uri" };
  if (parts.collection !== NSID_POST) {
    return { status: "error", reason: `not a ${NSID_POST} uri` };
  }

  let record: { cid: string; value: PostRecord } | null;
  try {
    record = await getRecord<PostRecord>(parts.repo, NSID_POST, parts.rkey);
  } catch (e) {
    return { status: "error", reason: `getRecord failed: ${String(e)}` };
  }
  // getRecord は 404 も null で返す。存在しない = PDS 上で削除済み。
  if (!record) return { status: "gone" };

  return verifyPostValue(
    { uri: postUri, cid: record.cid, value: record.value },
    parts.repo,
    threadVisibilityCache,
  );
}

/**
 * 既に手元にある post レコードを検証する (sync で listRecords した直後など、
 * getRecord をやり直さずに済むケース用)。
 */
export async function verifyPostValue(
  record: { uri: string; cid: string; value: PostRecord },
  authorDid: string,
  threadVisibilityCache?: Map<string, string | null>,
): Promise<VerifyOutcome> {
  const threadUri = record.value?.thread;
  const threadParts = parseAtUri(threadUri);
  if (!threadParts || threadParts.collection !== NSID_THREAD) {
    return { status: "skipped", reason: "post.thread が不正" };
  }

  const visibility = await resolveThreadVisibility(
    threadUri,
    threadParts.repo,
    threadParts.rkey,
    threadVisibilityCache,
  );
  if (visibility === null) {
    return { status: "skipped", reason: "スレッドが存在しない" };
  }
  if (visibility !== "public") {
    return { status: "skipped", reason: "Private スレッドは対象外" };
  }

  const checkpointAt = record.value?.checkpointAt;
  if (typeof checkpointAt !== "string" || !checkpointAt) {
    return { status: "skipped", reason: "checkpointAt が無い" };
  }

  return {
    status: "indexed",
    row: {
      post_uri: record.uri,
      thread_uri: threadUri,
      author_did: authorDid,
      cid: record.cid,
      checkpoint_at: checkpointAt,
    },
  };
}

async function resolveThreadVisibility(
  threadUri: string,
  ownerDid: string,
  rkey: string,
  cache?: Map<string, string | null>,
): Promise<string | null> {
  if (cache?.has(threadUri)) return cache.get(threadUri) ?? null;
  let visibility: string | null = null;
  try {
    const thread = await getThreadRecord(ownerDid, rkey);
    visibility = thread ? (thread.visibility ?? null) : null;
  } catch {
    visibility = null;
  }
  cache?.set(threadUri, visibility);
  return visibility;
}

/* ---------- D1 アクセス ---------- */

export function upsertStatement(db: D1Database, row: PostIndexRow, indexedAt: string) {
  return db
    .prepare(
      `INSERT INTO post_index
         (post_uri, thread_uri, author_did, cid, checkpoint_at, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(post_uri) DO UPDATE SET
         thread_uri    = excluded.thread_uri,
         cid           = excluded.cid,
         checkpoint_at = excluded.checkpoint_at,
         indexed_at    = excluded.indexed_at`,
    )
    .bind(
      row.post_uri,
      row.thread_uri,
      row.author_did,
      row.cid,
      row.checkpoint_at,
      indexedAt,
    );
}

export function deleteStatement(db: D1Database, postUri: string) {
  return db.prepare("DELETE FROM post_index WHERE post_uri = ?").bind(postUri);
}

/* ---------- HTTP ヘルパー ---------- */

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  // Tauri の WebView など別 origin からも叩けるようにする
  "access-control-allow-origin": "*",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function errorJson(message: string, status: number): Response {
  return json({ error: message }, status);
}

/** DB バインディング未設定 (D1 未作成 / ローカル未初期化) を 503 で返す */
export function requireDb(env: { DB?: D1Database }): D1Database | Response {
  if (!env.DB) {
    return errorJson(
      "D1 バインディング DB が未設定です。wrangler.toml の database_id を確認してください",
      503,
    );
  }
  return env.DB;
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });
}

/**
 * D1 アクセスの例外を JSON エラーに変換する。
 *
 * 素で throw すると Cloudflare は `error code: 1101` (Worker threw exception)
 * という本文だけを返し、原因が分からない。実際、本番 D1 にスキーマを流し忘れた
 * ときに 1101 しか出ず切り分けに時間がかかったので、少なくとも「何が起きたか」
 * は呼び出し側に伝える。
 */
export async function withDbErrors(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/no such table|no such column/i.test(message)) {
      return errorJson(
        `D1 のスキーマが未適用です。db/schema.sql を実行してください (${message})`,
        500,
      );
    }
    console.error("[index] D1 error", message);
    return errorJson(`D1 エラー: ${message}`, 500);
  }
}
