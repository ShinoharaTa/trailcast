// `public/og-image.svg` を `public/og-image.png` にラスタライズするビルドスクリプト。
//
// 各 SNS (X / Bluesky / Slack 等) は og:image に SVG を受け付けないため、
// ソースは SVG のまま保ちつつ、デプロイに含めるのは PNG とする。
//
// CLI: `npm run og:build` (内部で tsx 経由で実行)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SVG_PATH = path.join(ROOT, "public", "og-image.svg");
const PNG_PATH = path.join(ROOT, "public", "og-image.png");

function main(): void {
  const svg = fs.readFileSync(SVG_PATH, "utf8");

  const resvg = new Resvg(svg, {
    background: "#0a0e1a",
    // SVG の viewBox は 1200x630 想定。fitTo で原寸出力。
    fitTo: { mode: "width", value: 1200 },
    font: {
      // macOS / Linux / GitHub Actions runner の標準フォントを拾わせる。
      // Noto Sans CJK / Inter (もしくはフォールバックの sans-serif) で
      // 日本語・英字どちらも描画される。
      loadSystemFonts: true,
      defaultFontFamily: "Noto Sans CJK JP",
    },
    // テキストアウトラインは描画品質維持のため強制 oversample しない
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
  });

  const png = resvg.render().asPng();
  fs.writeFileSync(PNG_PATH, png);

  const sizeKb = (png.byteLength / 1024).toFixed(1);
  const rel = path.relative(ROOT, PNG_PATH);
  console.log(`wrote ${rel} (${sizeKb} KB)`);
}

main();
