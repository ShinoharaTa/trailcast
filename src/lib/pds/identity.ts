// Bluesky / AT Protocol の handle / DID / profile 解決ヘルパー。
//
// 認証不要の公開エンドポイントを直接 fetch する (セッション有無に依存せず動かす)。
// - resolveHandle: https://bsky.social/xrpc/com.atproto.identity.resolveHandle
// - getProfile:    https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile

const IDENTITY_ENDPOINT = "https://bsky.social";
const APPVIEW_ENDPOINT = "https://public.api.bsky.app";

const handleToDidCache = new Map<string, string>();
const handleInflight = new Map<string, Promise<string>>();

export interface ProfileView {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  banner?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

const profileCache = new Map<string, ProfileView>();
const profileInflight = new Map<string, Promise<ProfileView>>();

function isDid(s: string): boolean {
  return s.startsWith("did:");
}

/**
 * handle を DID に解決する。handle/DID どちらが来ても DID を返す。
 */
export async function resolveIdentifier(identifier: string): Promise<string> {
  if (isDid(identifier)) return identifier;
  return resolveHandle(identifier);
}

export async function resolveHandle(handle: string): Promise<string> {
  const key = handle.toLowerCase();
  const cached = handleToDidCache.get(key);
  if (cached) return cached;
  const pending = handleInflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    const url = new URL(
      "/xrpc/com.atproto.identity.resolveHandle",
      IDENTITY_ENDPOINT,
    );
    url.searchParams.set("handle", handle);
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`handle を解決できませんでした (${handle})`);
    }
    const data = (await res.json()) as { did?: string };
    if (!data.did) throw new Error(`handle を解決できませんでした (${handle})`);
    handleToDidCache.set(key, data.did);
    return data.did;
  })().finally(() => {
    handleInflight.delete(key);
  });

  handleInflight.set(key, p);
  return p;
}

/**
 * DID または handle から Bluesky プロフィールを取得する。
 * AppView の公開エンドポイントを直接叩くので認証不要。
 */
export async function getProfile(didOrHandle: string): Promise<ProfileView> {
  const key = didOrHandle.toLowerCase();
  const cached = profileCache.get(key);
  if (cached) return cached;
  const pending = profileInflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    const url = new URL("/xrpc/app.bsky.actor.getProfile", APPVIEW_ENDPOINT);
    url.searchParams.set("actor", didOrHandle);
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`プロフィール取得に失敗しました (${didOrHandle})`);
    }
    const data = (await res.json()) as ProfileView;
    profileCache.set(key, data);
    // DID でもキャッシュしておく (handle 入口で取得したときの後続アクセス高速化)
    if (data.did) profileCache.set(data.did.toLowerCase(), data);
    return data;
  })().finally(() => {
    profileInflight.delete(key);
  });

  profileInflight.set(key, p);
  return p;
}
