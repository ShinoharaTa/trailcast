/**
 * OGP / Twitter Card 用の meta タグを HTMLRewriter で SPA shell に差し込む。
 *
 * 方針:
 *   - レンダリング自体はクライアント (SPA) が行う。
 *   - middleware は index.html の <head> 内 OG/Twitter/description/title を
 *     URL ごとに動的に書き換えて、リンクプレビューが正しく出るようにする。
 *   - クローラかブラウザかは判別せず、両方に同じ HTML を返す。
 */

import {
  buildBlobUrl,
  extractBlobCid,
  getProfile,
  getThreadRecord,
  resolveIdentifier,
} from "./_atproto";

const SITE_NAME = "Trailcast";
// 各 SNS は og:image の SVG を受け付けないため、PNG にラスタライズしたものを
// デフォルト OG として配信する (生成は `npm run og:build`)。
const DEFAULT_OG_IMAGE_PATH = "/og-image.png";
const DEFAULT_OG_IMAGE_TYPE = "image/png";

export interface OgpMeta {
  title: string;
  description: string;
  image: string;
  imageType?: string;
  url: string;
  type: "website" | "profile" | "article";
}

/**
 * URL を見て、サポート対象なら OgpMeta を構築する。
 * 非対応ページ (`/`, `/login`, `/new`, `/auth/callback`) では null を返し、
 * middleware 側は静的な OGP のままにする。
 */
export async function buildOgpMetaForUrl(
  url: URL,
  origin: string,
): Promise<OgpMeta | null> {
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => safeDecode(s));

  if (parts.length === 0) return null;

  const RESERVED = new Set(["login", "new", "auth"]);
  if (RESERVED.has(parts[0])) return null;
  if (!isUserIdentifier(parts[0])) return null;

  const defaultImage = `${origin}${DEFAULT_OG_IMAGE_PATH}`;

  // /{did|handle}
  if (parts.length === 1) {
    return await buildProfileOgp(parts[0], origin, defaultImage);
  }

  // /{did|handle}/{rkey}
  if (parts.length >= 2) {
    return await buildThreadOgp(parts[0], parts[1], origin);
  }

  return null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function isUserIdentifier(seg: string): boolean {
  if (!seg) return false;
  if (seg.startsWith("did:")) return true;
  if (seg.includes(".")) return true;
  return false;
}

async function buildProfileOgp(
  identifier: string,
  origin: string,
  defaultImage: string,
): Promise<OgpMeta> {
  // handle 解決のためだけに AppView を叩く (DID 入力時に @handle 表示のため)。
  const profile = await getProfile(identifier).catch(() => null);
  const handle = profile?.handle ?? identifier;
  const title = `@${handle} | ${SITE_NAME}`;
  const description = `@${handle} が ${SITE_NAME} に残しているチェックポイントの記録`;
  // og:image は OGP サイズ (1200x630) 前提で作られたサイト共通画像を使う。
  // ユーザーアイコンは正方形・低解像度で OGP には向かないため使わない。
  return {
    title,
    description,
    image: defaultImage,
    imageType: DEFAULT_OG_IMAGE_TYPE,
    url: `${origin}/${encodeURIComponent(identifier)}`,
    type: "profile",
  };
}

async function buildThreadOgp(
  identifier: string,
  rkey: string,
  origin: string,
): Promise<OgpMeta | null> {
  // identifier は handle / DID どちらも来る。Thread 取得には DID が要る。
  const did = await resolveIdentifier(identifier).catch(() => null);
  if (!did) return null;

  const thread = await getThreadRecord(did, rkey).catch(
    () => null,
  );
  if (!thread) return null;

  // 公開設定が public 以外は OGP を出さない (検索 / 引用されたくない)
  if (thread.visibility !== "public") return null;

  // description fallback の "@handle" 表示用にプロフィールも取りに行く。
  // 失敗してもスレッド OGP 自体は出したいので catch して continue。
  const profile = await getProfile(identifier).catch(() => null);
  const handle = profile?.handle ?? identifier;

  const rawTitle = thread.title?.trim() ?? "";
  // 空タイトルの場合は "Trailcast | Trailcast" を避けて単独 SITE_NAME に。
  const title = rawTitle ? `${rawTitle} | ${SITE_NAME}` : SITE_NAME;
  const description =
    thread.description?.trim() ||
    `@${handle} が ${SITE_NAME} に残したチェックポイントの記録`;

  // og:image はクライアント側で生成して PDS に保存した `ogImage` blob を最優先。
  // 未生成のスレッドはサイト共通の静的 OGP 画像にフォールバックする。
  // (動的 SVG 合成は廃止: Worker CPU 上限を確実に回避するため、
  //  欠落分は別途 Dashboard のバックフィル UI で生成して PDS に書き戻す)
  const ogCid = extractBlobCid(thread.ogImage);
  const image = ogCid
    ? await buildBlobUrl(did, ogCid)
    : `${origin}${DEFAULT_OG_IMAGE_PATH}`;
  const imageType = ogCid
    ? thread.ogImage?.mimeType || "image/jpeg"
    : DEFAULT_OG_IMAGE_TYPE;

  return {
    title,
    description,
    image,
    imageType,
    url: `${origin}/${encodeURIComponent(identifier)}/${encodeURIComponent(rkey)}`,
    type: "article",
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * <head> に追記する meta タグ群を組み立てる。
 * 既存の og:* / twitter:* / description は HTMLRewriter で削除した上で挿入する。
 *
 * `meta.title` は呼び出し元 (`buildProfileOgp` / `buildThreadOgp`) で既に
 * `"<entity> | Trailcast"` 形式に整形済み。この関数では加工せずそのまま出力する。
 */
function buildMetaTagsHtml(meta: OgpMeta): string {
  const t = escapeHtml(meta.title);
  const d = escapeHtml(meta.description);
  const img = escapeHtml(meta.image);
  const u = escapeHtml(meta.url);
  const type = meta.type;
  const imageType = meta.imageType ? escapeHtml(meta.imageType) : "";
  return [
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="ja_JP" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    imageType
      ? `<meta property="og:image:type" content="${imageType}" />`
      : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<link rel="canonical" href="${u}" />`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 受け取った HTML レスポンスに対し HTMLRewriter で OGP を上書きして返す。
 *
 * 既存タグ:
 *   - <title>          : `meta.title` (= 既に "... | Trailcast" 形式) で上書き
 *   - <meta property="og:*" />  : 全削除
 *   - <meta name="twitter:*" /> : 全削除
 *   - <meta name="description" /> : 削除
 *   - <link rel="canonical">    : 削除
 * ↑を消した上で、`<head>` の末尾に新しい一連の meta を append する。
 */
export function rewriteHtmlWithOgp(
  baseResponse: Response,
  meta: OgpMeta,
): Response {
  const fullTitle = meta.title;
  const metaHtml = buildMetaTagsHtml(meta);

  // SPA shell として返すヘッダ調整
  const headers = new Headers(baseResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  // OGP は edge で 1 時間キャッシュ (Cloudflare の `cf.cacheTtl` だけでなく
  // 共有/中間キャッシュにも効くよう Cache-Control も付ける)
  headers.set("cache-control", "public, max-age=0, s-maxage=3600");

  const stub = new Response(baseResponse.body, {
    status: 200,
    statusText: "OK",
    headers,
  });

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(fullTitle);
      },
    })
    .on('meta[property^="og:"]', {
      element(el) {
        el.remove();
      },
    })
    .on('meta[name^="twitter:"]', {
      element(el) {
        el.remove();
      },
    })
    .on('meta[name="description"]', {
      element(el) {
        el.remove();
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        el.remove();
      },
    })
    .on("head", {
      element(el) {
        el.append(metaHtml, { html: true });
      },
    })
    .transform(stub);
}
