// 他人の repo を読むための、PDS 直叩きの XRPC ヘルパー。
//
// 背景:
//   `getAgent()` のシングルトン AtpAgent は service URL が固定 (未ログイン時は
//   bsky.social、ログイン時はログインユーザー自身の PDS) で、対象 repo を
//   持たない PDS に対して `com.atproto.repo.getRecord` / `listRecords` を
//   投げると `InvalidRequest: Could not find repo: did:plc:...` で失敗する。
//   bsky.social は `com.atproto.repo.*` を他 PDS にプロキシしないため、
//   読み取り対象の DID から PDS を解決して直接 fetch する必要がある。
//
// `com.atproto.repo.getRecord` / `listRecords` は認証不要・CORS 許可なので、
// プレーンな fetch で十分。
//
// 書き込み (putRecord / deleteRecord / uploadBlob) は引き続き
// `getAgent()` 経由 (= ログインユーザー自身の PDS) で行う。

import { resolveDidPds } from "@/lib/pds/blob-url";

export interface XrpcRecord<T = unknown> {
  uri: string;
  cid: string;
  value: T;
}

export interface XrpcListResponse<T = unknown> {
  records: Array<XrpcRecord<T>>;
  cursor?: string;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.message || body.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

/**
 * 指定 DID の PDS に直接 `com.atproto.repo.getRecord` を投げて 1 レコード取得する。
 */
export async function getRecordViaPds<T = unknown>(
  did: string,
  collection: string,
  rkey: string,
): Promise<XrpcRecord<T>> {
  const pds = await resolveDidPds(did);
  const url = new URL("/xrpc/com.atproto.repo.getRecord", pds);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", collection);
  url.searchParams.set("rkey", rkey);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`getRecord failed: ${await readErrorMessage(res)}`);
  }
  const data = (await res.json()) as {
    uri: string;
    cid?: string;
    value: T;
  };
  return {
    uri: data.uri,
    cid: data.cid ?? "",
    value: data.value,
  };
}

export interface ListRecordsOptions {
  limit?: number;
  cursor?: string;
  reverse?: boolean;
}

/**
 * 指定 DID の PDS に直接 `com.atproto.repo.listRecords` を投げて
 * 該当 collection のレコードを取得する。
 */
export async function listRecordsViaPds<T = unknown>(
  did: string,
  collection: string,
  opts: ListRecordsOptions = {},
): Promise<XrpcListResponse<T>> {
  const pds = await resolveDidPds(did);
  const url = new URL("/xrpc/com.atproto.repo.listRecords", pds);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", collection);
  if (opts.limit != null) url.searchParams.set("limit", String(opts.limit));
  if (opts.cursor) url.searchParams.set("cursor", opts.cursor);
  if (opts.reverse) url.searchParams.set("reverse", "true");
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`listRecords failed: ${await readErrorMessage(res)}`);
  }
  const data = (await res.json()) as {
    records: Array<{ uri: string; cid?: string; value: T }>;
    cursor?: string;
  };
  return {
    records: data.records.map((r) => ({
      uri: r.uri,
      cid: r.cid ?? "",
      value: r.value,
    })),
    cursor: data.cursor,
  };
}

/** ページングの暴走を防ぐ安全弁 (100 件/ページ × 50 = 5000 レコード)。 */
const MAX_LIST_PAGES = 50;

/**
 * `listRecordsViaPds` を cursor が尽きるまで辿り、collection の全レコードを返す。
 *
 * `com.atproto.repo.listRecords` は 1 回で最大 100 件しか返さないため、
 * 1 ページだけ取って絞り込む実装だと repo 全体が 100 件を超えた時点で
 * 古いレコードが取りこぼされる (#12)。repo 全体を走査する必要がある
 * 用途では必ずこちらを使う。
 */
export async function listAllRecordsViaPds<T = unknown>(
  did: string,
  collection: string,
  opts: Omit<ListRecordsOptions, "cursor"> = {},
): Promise<Array<XrpcRecord<T>>> {
  const limit = opts.limit ?? 100;
  const all: Array<XrpcRecord<T>> = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const res = await listRecordsViaPds<T>(did, collection, {
      ...opts,
      limit,
      cursor,
    });
    all.push(...res.records);
    // cursor が無ければ終端。レコード 0 件で cursor だけ返る PDS もあるので
    // そちらも終端として扱う (無限ループ防止)。
    if (!res.cursor || res.records.length === 0) return all;
    cursor = res.cursor;
  }

  console.warn(
    `listAllRecordsViaPds: ${collection} が ${MAX_LIST_PAGES} ページ上限に達しました (${all.length} 件で打ち切り)`,
  );
  return all;
}
