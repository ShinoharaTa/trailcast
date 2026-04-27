/**
 * Cloudflare Pages Functions の OGP メタ生成ロジックをローカル Node 上で実行し、
 * 成果物 (OGP メタ JSON / og:image バイナリ) を tmp/og-test/ に書き出す。
 *
 * 使い方:
 *   npm run og:test
 *
 * テストしたい URL は下の TEST_URLS 配列に追加する。本番 / dev / 任意の
 * オリジンどれでも可 (origin はテスト出力に使われ、og:image の解決にも使われる)。
 *
 * 出力:
 *   tmp/og-test/<stem>.meta.json   — middleware が返すのと同じ OGP メタ
 *   tmp/og-test/<stem>.image.<ext> — og:image を実際に取得したバイナリ
 *
 * og:image のソース:
 *   - ogImage blob (PDS) → `cdn.bsky.app` または PDS から取得
 *   - 静的フォールバック (`/og-image.svg`) → dev server が動いていれば fetch、
 *     失敗したらローカルの `public/og-image.svg` から読み込む
 *
 * 注意:
 *   - HTMLRewriter は Cloudflare Workers 限定なので、本スクリプトでは
 *     `rewriteHtmlWithOgp` は呼ばず、`buildOgpMetaForUrl` の戻り値だけを保存する。
 *   - `_atproto.ts` の fetch は `cf:` オプションを付けるが、Node では
 *     未知プロパティとして無視されるため挙動には影響しない。
 *   - PDS / AppView にネットワークアクセスが発生する。
 *   - 動的 SVG 合成は廃止済み (= og:image は blob または静的のどちらか)。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildOgpMetaForUrl, type OgpMeta } from "../functions/_ogp";

// ───────────────────────── ここにテストしたい URL を入れる ─────────────────────────
const TEST_URLS: string[] = [
  // プロフィールページ:
  "http://127.0.0.1:3000/shino3.net",
  "http://127.0.0.1:3000/did%3Aplc%3Arpwpuzu2yyiuufm3232d7pm5",
  "http://127.0.0.1:3000/shino3.bsky.social",

  // スレッド詳細ページ:
  "http://127.0.0.1:3000/did%3Aplc%3Arpwpuzu2yyiuufm3232d7pm5/1if0a65ji0o01",
  "http://127.0.0.1:3000/shino3.net/1ig4f7tjfeolj",
  "http://127.0.0.1:3000/shino3.net/1ig9tubult88d",
];
// ──────────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "..");
const OUT_DIR = path.join(projectRoot, "tmp/og-test");

function safeName(s: string): string {
  return (
    s.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) ||
    "root"
  );
}

function logMeta(meta: OgpMeta) {
  console.log(`    title       : ${meta.title}`);
  console.log(`    description : ${meta.description}`);
  console.log(`    image       : ${meta.image}`);
  if (meta.imageType) console.log(`    image type  : ${meta.imageType}`);
  console.log(`    type        : ${meta.type}`);
  console.log(`    url         : ${meta.url}`);
}

const MIME_TO_EXT: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function extFromMime(mime: string | undefined): string {
  if (!mime) return "bin";
  const m = mime.split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[m] ?? "bin";
}

function extFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const m = u.pathname.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * og:image を取得してバイナリ + 推定 MIME を返す。
 *
 * ローカル origin (127.0.0.1 / localhost) の `/og-image.svg` のような
 * 静的アセットは dev server が動いていないと fetch できないので、
 * その場合は `public/<同名>` から直接読み込む。
 */
async function fetchOgImage(
  imageUrl: string,
  origin: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  // 1) fetch を試す
  try {
    const res = await fetch(imageUrl);
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      const mime = (
        res.headers.get("content-type") || "application/octet-stream"
      )
        .split(";")[0]
        .trim()
        .toLowerCase();
      return { bytes: buf, mime };
    }
    console.warn(`    fetch ${imageUrl} -> HTTP ${res.status}`);
  } catch (err) {
    console.warn(`    fetch failed: ${imageUrl}`, (err as Error).message);
  }

  // 2) origin 配下の静的アセットなら public/ から読み込む
  try {
    const u = new URL(imageUrl);
    if (u.origin === origin && u.pathname.startsWith("/")) {
      const localPath = path.join(projectRoot, "public", u.pathname);
      if (fs.existsSync(localPath)) {
        const bytes = new Uint8Array(fs.readFileSync(localPath));
        const ext = path.extname(localPath).slice(1).toLowerCase();
        const mime =
          Object.entries(MIME_TO_EXT).find(([, e]) => e === ext)?.[0] ??
          "application/octet-stream";
        console.log(`    → public/${u.pathname.replace(/^\//, "")} (local)`);
        return { bytes, mime };
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

async function processUrl(input: string): Promise<void> {
  const url = new URL(input);
  const origin = url.origin;
  const stem = safeName(url.pathname);
  console.log(`\n→ ${input}`);

  const meta = await buildOgpMetaForUrl(url, origin).catch((e) => {
    console.error("  buildOgpMetaForUrl threw:", e);
    return null;
  });

  if (!meta) {
    console.log("  meta : null (OGP 対象外パス)");
    return;
  }
  logMeta(meta);
  fs.writeFileSync(
    path.join(OUT_DIR, `${stem}.meta.json`),
    JSON.stringify(meta, null, 2) + "\n",
  );
  console.log(`  saved: tmp/og-test/${stem}.meta.json`);

  const fetched = await fetchOgImage(meta.image, origin);
  if (!fetched) {
    console.log(`  image: skipped (取得失敗)`);
    return;
  }
  // 拡張子は (1) meta.imageType を優先、(2) 実際の Content-Type、(3) URL
  const ext =
    extFromMime(meta.imageType) !== "bin"
      ? extFromMime(meta.imageType)
      : extFromMime(fetched.mime) !== "bin"
        ? extFromMime(fetched.mime)
        : (extFromUrl(meta.image) ?? "bin");
  const outFile = path.join(OUT_DIR, `${stem}.image.${ext}`);
  fs.writeFileSync(outFile, fetched.bytes);
  console.log(
    `  saved: tmp/og-test/${stem}.image.${ext} (${fetched.bytes.byteLength} bytes, ${fetched.mime})`,
  );
}

async function main() {
  if (TEST_URLS.length === 0) {
    console.error(
      "TEST_URLS が空です。scripts/og-test.ts を開いて URL を追加してください。",
    );
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const url of TEST_URLS) {
    try {
      await processUrl(url);
    } catch (err) {
      console.error(`  error processing ${url}:`, err);
    }
  }
  console.log(`\n出力先: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
