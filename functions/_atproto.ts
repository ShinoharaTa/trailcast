/**
 * Cloudflare Pages Functions (Workers) で動かす atproto 読み取りヘルパー。
 *
 * 認証不要で OGP 構築に必要な最小限の情報だけを取りに行く:
 *   - handle → DID 解決 (`com.atproto.identity.resolveHandle`)
 *   - DID → PDS 解決 (DID document)
 *   - 任意 PDS から getRecord
 *   - bsky AppView から getProfile (avatar 等)
 *
 * Workers 環境向けに `fetch` のみで実装し、ブラウザ／Node 専用 API は使わない。
 * クライアント側の `src/lib/pds/*` と機能が重複するが、edge から import すると
 * トランスパイル経路や localStorage 依存などで噛み合わない箇所があるため、
 * functions ツリー内で完結する小さな実装を別に持つ。
 */

const IDENTITY_ENDPOINT = "https://bsky.social";
const APPVIEW_ENDPOINT = "https://public.api.bsky.app";
const DEFAULT_PDS = "https://bsky.social";

const NSID_THREAD = "net.shino3.trailcast.thread";

export interface BlobRef {
  $type?: string;
  ref?: { $link?: string } | unknown;
  cid?: string;
  mimeType?: string;
  size?: number;
}

export interface ThreadRecord {
  title: string;
  description?: string;
  visibility: "private" | "public";
  coverImage?: BlobRef;
  ogImage?: BlobRef;
  createdAt: string;
  sortOrder?: "asc" | "desc";
}

export interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  banner?: string;
}

const FETCH_OPTS: RequestInit = {
  // Cloudflare の edge cache を活用 (CF-Worker は cf プロパティを受け付ける)
  cf: { cacheEverything: true, cacheTtl: 3600 },
} as RequestInit;

function isDid(s: string): boolean {
  return s.startsWith("did:");
}

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/$/, "");
}

/**
 * BlobRef から CID 文字列を抜く。
 */
export function extractBlobCid(blob: BlobRef | undefined | null): string | null {
  if (!blob || typeof blob !== "object") return null;
  const ref = blob.ref;
  if (ref && typeof ref === "object") {
    const link = (ref as { $link?: unknown }).$link;
    if (typeof link === "string" && link.length > 0) return link;
  }
  if (typeof blob.cid === "string" && blob.cid.length > 0) return blob.cid;
  return null;
}

/**
 * handle (foo.bsky.social など) を DID に解決する。
 * すでに DID なら何もしない。
 */
export async function resolveIdentifier(identifier: string): Promise<string> {
  if (isDid(identifier)) return identifier;
  const url = new URL(
    "/xrpc/com.atproto.identity.resolveHandle",
    IDENTITY_ENDPOINT,
  );
  url.searchParams.set("handle", identifier);
  const res = await fetch(url.toString(), FETCH_OPTS);
  if (!res.ok) throw new Error(`resolveHandle failed: ${res.status}`);
  const data = (await res.json()) as { did?: string };
  if (!data.did) throw new Error(`resolveHandle returned no did`);
  return data.did;
}

/**
 * DID document を取得して PDS endpoint を返す。
 * did:plc → plc.directory、did:web → well-known。失敗時は DEFAULT_PDS。
 */
export async function resolveDidPds(did: string): Promise<string> {
  let url: string;
  if (did.startsWith("did:plc:")) {
    url = `https://plc.directory/${did}`;
  } else if (did.startsWith("did:web:")) {
    const rest = did.slice("did:web:".length);
    const parts = rest.split(":");
    const host = parts[0];
    const path = parts.slice(1).join("/");
    url = path
      ? `https://${host}/${path}/did.json`
      : `https://${host}/.well-known/did.json`;
  } else {
    return DEFAULT_PDS;
  }

  try {
    const res = await fetch(url, FETCH_OPTS);
    if (!res.ok) return DEFAULT_PDS;
    const doc = (await res.json()) as {
      service?: Array<{
        id?: string;
        type?: string;
        serviceEndpoint?: string;
      }>;
    };
    const services = doc.service ?? [];
    for (const s of services) {
      if (typeof s.serviceEndpoint !== "string") continue;
      if (s.type === "AtprotoPersonalDataServer" || s.id === "#atproto_pds") {
        return normalizeEndpoint(s.serviceEndpoint);
      }
    }
    return DEFAULT_PDS;
  } catch {
    return DEFAULT_PDS;
  }
}

/**
 * 指定 DID の PDS から `com.atproto.repo.getRecord` で 1 レコード取得。
 */
export async function getRecord<T = unknown>(
  did: string,
  collection: string,
  rkey: string,
): Promise<{ uri: string; cid: string; value: T } | null> {
  const pds = await resolveDidPds(did);
  const url = new URL("/xrpc/com.atproto.repo.getRecord", pds);
  url.searchParams.set("repo", did);
  url.searchParams.set("collection", collection);
  url.searchParams.set("rkey", rkey);
  const res = await fetch(url.toString(), FETCH_OPTS);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    uri: string;
    cid?: string;
    value: T;
  };
  return { uri: data.uri, cid: data.cid ?? "", value: data.value };
}

export async function getThreadRecord(
  did: string,
  rkey: string,
): Promise<ThreadRecord | null> {
  const rec = await getRecord<ThreadRecord>(did, NSID_THREAD, rkey);
  return rec?.value ?? null;
}

/**
 * AppView の getProfile を叩いて表示名・avatar 等を返す。失敗時は null。
 */
export async function getProfile(
  didOrHandle: string,
): Promise<ProfileView | null> {
  const url = new URL("/xrpc/app.bsky.actor.getProfile", APPVIEW_ENDPOINT);
  url.searchParams.set("actor", didOrHandle);
  try {
    const res = await fetch(url.toString(), FETCH_OPTS);
    if (!res.ok) return null;
    return (await res.json()) as ProfileView;
  } catch {
    return null;
  }
}

/**
 * PDS URL + DID + CID から com.atproto.sync.getBlob URL を組み立てる。
 */
export async function buildBlobUrl(
  did: string,
  cid: string,
): Promise<string> {
  const pds = await resolveDidPds(did);
  return `${normalizeEndpoint(pds)}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cid)}`;
}
