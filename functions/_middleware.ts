/**
 * Cloudflare Pages Functions の middleware。
 *
 * 役割: SPA フォールバック。
 *   静的アセット (out/) で 404 が返るリクエストは /index.html を 200 で返し、
 *   クライアントサイドルーター (useNavigation) に処理を任せる。
 *
 * なぜ _redirects だけでは不十分か:
 *   public/_redirects に `/* /index.html 200` を書いても、URL パスに
 *   percent-encoded な文字 (例: did の `:` → `%3A`) が含まれる場合、
 *   Cloudflare Pages はマッチに失敗し 404.html を返してしまう既知挙動がある。
 *   middleware で確実に救うことで、エンコード形式に依存せず動かす。
 */

interface PagesContext {
  request: Request;
  next: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const response = await context.next();
  if (response.status !== 404) return response;

  // Try to serve /index.html as the SPA shell.
  const indexUrl = new URL(context.request.url);
  indexUrl.pathname = "/index.html";
  indexUrl.search = "";

  const indexResponse = await context.next(
    new Request(indexUrl.toString(), {
      method: "GET",
      headers: context.request.headers,
    }),
  );

  if (!indexResponse.ok) return response;

  // 200 で返し、HTML レスポンスはキャッシュさせない (SPA shell)
  const headers = new Headers(indexResponse.headers);
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.set("content-type", "text/html; charset=utf-8");

  return new Response(indexResponse.body, {
    status: 200,
    statusText: "OK",
    headers,
  });
};
