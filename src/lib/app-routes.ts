import { NSID_THREAD, buildAtUri, parseAtUri } from "@/lib/types";

export type ScreenId =
  | "login"
  | "auth-callback"
  | "home"
  | "thread-create"
  | "thread-detail"
  | "user-profile";

export interface ScreenParams {
  threadUri?: string;
  userIdentifier?: string; // DID (did:...) または handle (例: foo.bsky.social)
}

export interface Route {
  screen: ScreenId;
  params: ScreenParams;
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function dec(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * URL パスの最上位セグメントとして使う予約ワード。
 * これらにマッチした場合はユーザー識別子としては扱わない。
 * 既存の Bluesky handle は FQDN 形式 (必ず `.` を含む) / DID は `did:` で始まるため、
 * ここに列挙する単語と衝突しない。
 */
const RESERVED_TOP_SEGMENTS: ReadonlySet<string> = new Set([
  "login",
  "new",
  "auth",
]);

/**
 * パス 1 段目の文字列がユーザー識別子 (DID or handle) として解釈できるか。
 * - `did:` プレフィックスを持つ
 * - もしくは `.` を含む FQDN 形式 (handle)
 * 予約セグメントは除外。
 */
function isUserIdentifier(seg: string): boolean {
  if (!seg) return false;
  if (RESERVED_TOP_SEGMENTS.has(seg)) return false;
  if (seg.startsWith("did:")) return true;
  if (seg.includes(".")) return true;
  return false;
}

/**
 * 画面とパラメータから、先頭 / のパスを返す。
 *
 * ルート構造:
 *   - /                    : home
 *   - /login               : login
 *   - /new                 : thread-create
 *   - /{did|handle}        : user-profile
 *   - /{did|handle}/{rkey} : thread-detail
 *
 * 共有・チェックポイント作成などのアクションはモーダルで扱い、独自パスを持たない。
 */
export function screenToPathname(
  screen: ScreenId,
  params: ScreenParams = {},
): string {
  switch (screen) {
    case "home":
      return "/";
    case "login":
      return "/login";
    case "auth-callback":
      return "/auth/callback";
    case "thread-create":
      return "/new";
    case "thread-detail": {
      if (!params.threadUri) return "/";
      const { repo, rkey } = parseAtUri(params.threadUri);
      return `/${enc(repo)}/${enc(rkey)}`;
    }
    case "user-profile": {
      if (!params.userIdentifier) return "/";
      return `/${enc(params.userIdentifier)}`;
    }
    default:
      return "/";
  }
}

/**
 * パスから画面とパラメータを復元する。不明なパスは home。
 */
export function parsePathname(pathname: string): Route {
  const parts = pathname.split("/").filter(Boolean).map(dec);

  if (parts.length === 0) {
    return { screen: "home", params: {} };
  }

  // 予約トップ: /login, /new
  if (parts.length === 1) {
    if (parts[0] === "login") return { screen: "login", params: {} };
    if (parts[0] === "new") return { screen: "thread-create", params: {} };
    if (isUserIdentifier(parts[0])) {
      return {
        screen: "user-profile",
        params: { userIdentifier: parts[0] },
      };
    }
    return { screen: "home", params: {} };
  }

  // /auth/callback : OAuth 認可後のリダイレクト先
  if (parts.length >= 2 && parts[0] === "auth" && parts[1] === "callback") {
    return { screen: "auth-callback", params: {} };
  }

  // /{did|handle}/{rkey} (それ以上のサブパスが付いていても thread-detail として扱う)
  if (parts.length >= 2 && isUserIdentifier(parts[0])) {
    const repo = parts[0];
    const rkey = parts[1];
    const threadUri = buildAtUri(repo, NSID_THREAD, rkey);
    return { screen: "thread-detail", params: { threadUri } };
  }

  return { screen: "home", params: {} };
}

/**
 * スレッド詳細用のルート相対リンク（`<a href>` に直接渡せる）
 */
export function getThreadDetailHref(threadUri: string): string {
  return screenToPathname("thread-detail", { threadUri });
}

/**
 * ユーザープロフィール用のルート相対リンク
 */
export function getUserProfileHref(userIdentifier: string): string {
  return screenToPathname("user-profile", { userIdentifier });
}

/**
 * 共有などで使う絶対 URL
 */
export function getAbsoluteUrl(
  screen: ScreenId,
  params: ScreenParams = {},
  siteOrigin?: string,
): string {
  const origin =
    siteOrigin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://trailcast.shino3.net");
  return `${origin}${screenToPathname(screen, params)}`;
}
