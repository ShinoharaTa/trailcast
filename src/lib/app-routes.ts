import { NSID_THREAD, buildAtUri, parseAtUri } from "@/lib/types";

export type ScreenId =
  | "login"
  | "home"
  | "thread-create"
  | "thread-detail";

export interface ScreenParams {
  threadUri?: string;
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
 * 画面とパラメータから、先頭 / のパスを返す。
 * home は "/"、必要な threadUri が無ければ home に落とす。
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
    case "thread-create":
      return "/thread/new";
    case "thread-detail": {
      if (!params.threadUri) return "/";
      const { repo, rkey } = parseAtUri(params.threadUri);
      return `/thread/${enc(repo)}/${enc(rkey)}`;
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
  if (parts.length === 1 && parts[0] === "login") {
    return { screen: "login", params: {} };
  }
  if (parts[0] !== "thread") {
    return { screen: "home", params: {} };
  }

  // /thread/new
  if (parts.length === 2 && parts[1] === "new") {
    return { screen: "thread-create", params: {} };
  }

  // /thread/:repo/:rkey (それ以上のサブパスが付いていても thread-detail として扱う)
  if (parts.length >= 3) {
    const repo = parts[1];
    const rkey = parts[2];
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
