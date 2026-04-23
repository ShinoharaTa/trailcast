// DID から PDS を解決して at-proto の `com.atproto.sync.getBlob` URL を組み立てる。
//
// Bluesky の did:plc ユーザーは bsky.social ではなく *.host.bsky.network 等の
// shard PDS にいるため、DID ドキュメントから AtprotoPersonalDataServer の
// service endpoint を取得してからでないと blob を取得できない。

const DEFAULT_PDS = "https://bsky.social";
const STORAGE_PREFIX = "trailcast_pds_";

const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function loadFromStorage(did: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + did);
  } catch {
    return null;
  }
}

function saveToStorage(did: string, pds: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + did, pds);
  } catch {
    // quota / denied: silent
  }
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/$/, "");
}

/**
 * BlobRef の形状揺れを吸収して CID を取り出す。
 * - プレーン JSON: `{ ref: { $link: "bafy..." } }`
 * - `@atproto/api` の BlobRef クラス: `{ ref: CID instance, ... }`
 * - 旧/非公式フォーマット: `{ cid: "bafy..." }`
 */
export function extractBlobCid(blobRef: unknown): string | null {
  if (!blobRef || typeof blobRef !== "object") return null;
  const obj = blobRef as Record<string, unknown>;

  const ref = obj.ref;
  if (ref && typeof ref === "object") {
    const asLink = (ref as { $link?: unknown }).$link;
    if (typeof asLink === "string" && asLink.length > 0) return asLink;
    const toString = (ref as { toString?: unknown }).toString;
    if (typeof toString === "function") {
      const s = toString.call(ref);
      if (
        typeof s === "string" &&
        s.length > 10 &&
        s !== "[object Object]"
      ) {
        return s;
      }
    }
  }

  if (typeof obj.cid === "string") return obj.cid;
  return null;
}

/**
 * DID ドキュメントを取得する。did:plc / did:web の両方に対応。
 */
async function fetchDidDoc(did: string): Promise<unknown> {
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
    throw new Error(`Unsupported DID method: ${did}`);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DID doc fetch failed: ${res.status}`);
  return res.json();
}

function extractPdsFromDoc(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return null;
  const services = (doc as { service?: unknown }).service;
  if (!Array.isArray(services)) return null;
  for (const s of services) {
    if (!s || typeof s !== "object") continue;
    const svc = s as { id?: unknown; type?: unknown; serviceEndpoint?: unknown };
    const type = svc.type;
    const id = svc.id;
    const endpoint = svc.serviceEndpoint;
    if (typeof endpoint !== "string") continue;
    if (type === "AtprotoPersonalDataServer" || id === "#atproto_pds") {
      return normalizeEndpoint(endpoint);
    }
  }
  return null;
}

/**
 * 同期的にキャッシュ済み PDS を返す。無ければ null。
 */
export function getCachedPdsUrl(did: string): string | null {
  const mem = memoryCache.get(did);
  if (mem) return mem;
  const stored = loadFromStorage(did);
  if (stored) {
    memoryCache.set(did, stored);
    return stored;
  }
  return null;
}

/**
 * DID を PDS URL に解決する。キャッシュ (memory + localStorage) 付き。
 * 失敗時は DEFAULT_PDS (bsky.social) にフォールバックする。
 */
export async function resolveDidPds(did: string): Promise<string> {
  const cached = getCachedPdsUrl(did);
  if (cached) return cached;

  const pending = inflight.get(did);
  if (pending) return pending;

  const p = (async () => {
    try {
      const doc = await fetchDidDoc(did);
      const pds = extractPdsFromDoc(doc);
      const result = pds ?? DEFAULT_PDS;
      memoryCache.set(did, result);
      saveToStorage(did, result);
      return result;
    } catch (err) {
      console.warn("resolveDidPds failed", did, err);
      memoryCache.set(did, DEFAULT_PDS);
      return DEFAULT_PDS;
    } finally {
      inflight.delete(did);
    }
  })();

  inflight.set(did, p);
  return p;
}

/**
 * PDS URL + DID + CID から blob 取得 URL を組み立てる (同期)。
 */
export function buildBlobUrl(
  pdsUrl: string,
  did: string,
  cid: string,
): string {
  return `${normalizeEndpoint(pdsUrl)}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
}
