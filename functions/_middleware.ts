/**
 * Cloudflare Pages Functions の middleware。
 *
 * 役割:
 *   1. SPA フォールバック
 *      静的アセット (out/) で 404 が返るリクエストは /index.html を 200 で返し、
 *      クライアントサイドルーター (useNavigation) に処理を任せる。
 *   2. 動的 OGP 注入
 *      `/{did|handle}` (プロフィール) と `/{did|handle}/{rkey}` (スレッド)
 *      に対して、index.html を取得した上で HTMLRewriter で og:* / twitter:*
 *      / description / title を URL 固有の値に書き換えてから返す。
 *      クローラ判定はせず、ブラウザにも同じ HTML を返す (表示には影響しない)。
 *
 * なぜ _redirects だけでは不十分か:
 *   public/_redirects に `/* /index.html 200` を書いても、URL パスに
 *   percent-encoded な文字 (例: did の `:` → `%3A`) が含まれる場合、
 *   Cloudflare Pages はマッチに失敗し 404.html を返してしまう既知挙動がある。
 *   middleware で確実に救うことで、エンコード形式に依存せず動かす。
 */

import { buildOgpMetaForUrl, rewriteHtmlWithOgp } from "./_ogp";

interface PagesContext {
  request: Request;
  next: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
  waitUntil?: (promise: Promise<unknown>) => void;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const reqUrl = new URL(context.request.url);
  const isGet =
    context.request.method === "GET" || context.request.method === "HEAD";

  // 通常通り asset 解決を試みる
  const assetResponse = await context.next();

  // OGP 注入対象か判定 (GET / HEAD のみ、HTML を返す可能性のあるパスのみ)
  const ogpMeta = isGet ? await safeBuildOgpMeta(reqUrl) : null;

  // 200 でアセットが返ってきた場合は基本そのまま (HTML だったら OGP 上書きを試みる)
  if (assetResponse.status !== 404) {
    if (ogpMeta && isHtmlResponse(assetResponse)) {
      return rewriteHtmlWithOgp(assetResponse, ogpMeta);
    }
    return assetResponse;
  }

  // 404 → SPA shell (index.html) フォールバック
  const indexUrl = new URL(context.request.url);
  indexUrl.pathname = "/index.html";
  indexUrl.search = "";
  const indexResponse = await context.next(
    new Request(indexUrl.toString(), {
      method: "GET",
      headers: context.request.headers,
    }),
  );
  if (!indexResponse.ok) return assetResponse;

  if (ogpMeta) {
    return rewriteHtmlWithOgp(indexResponse, ogpMeta);
  }

  // OGP 対象外: 既存挙動通り 200 + no-cache で SPA shell を返す
  const headers = new Headers(indexResponse.headers);
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(indexResponse.body, {
    status: 200,
    statusText: "OK",
    headers,
  });
};

function isHtmlResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("text/html");
}

/**
 * OGP 構築は外部 API を叩くため失敗・遅延しうる。失敗してもページ自体の
 * 配信は止めたくないので、必ず resolve させて null フォールバックにする。
 */
async function safeBuildOgpMeta(url: URL) {
  try {
    return await buildOgpMetaForUrl(url, url.origin);
  } catch (err) {
    console.warn("[trailcast-ogp] failed to build meta", err);
    return null;
  }
}
