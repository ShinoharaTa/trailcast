// `public/favicon.svg` から PWA / iOS 用の PNG アイコンを生成するビルドスクリプト。
//
// - public/icons/icon-192.png          (192, 透過)
// - public/icons/icon-512.png          (512, 透過)
// - public/icons/icon-512-maskable.png (512, 背景色ベタ + アイコンを 60% に縮小して中央配置)
// - public/apple-touch-icon.png        (180, 背景色ベタ。iOS は透過を無視して黒で埋めるため)
//
// maskable は OS 側で円形などに切り抜かれるため、中央 80% のセーフゾーンに
// 収まるようアイコン本体を 60% に縮小している。
//
// CLI: `npm run icons:build` (内部で tsx 経由で実行)。生成物はコミットする。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SVG_PATH = path.join(ROOT, "public", "favicon.svg");

const BACKGROUND = "#020617";
const MASKABLE_SCALE = 0.6;

interface IconSpec {
  out: string;
  size: number;
  /** 指定時は背景色で塗りつぶし、アイコンを scale 倍にして中央配置する */
  background?: { color: string; scale: number };
}

const ICONS: IconSpec[] = [
  { out: "public/icons/icon-192.png", size: 192 },
  { out: "public/icons/icon-512.png", size: 512 },
  {
    out: "public/icons/icon-512-maskable.png",
    size: 512,
    background: { color: BACKGROUND, scale: MASKABLE_SCALE },
  },
  {
    out: "public/apple-touch-icon.png",
    size: 180,
    background: { color: BACKGROUND, scale: 1 },
  },
];

/** favicon.svg を背景付きの正方形キャンバスに入れ子 <svg> で配置した SVG を作る */
function wrapWithBackground(svg: string, color: string, scale: number): string {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  const inner = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1];
  if (!viewBox || inner === undefined) {
    throw new Error("favicon.svg の viewBox / 本体を解析できません");
  }
  const canvas = 1000;
  const iconSize = canvas * scale;
  const offset = (canvas - iconSize) / 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}">`,
    `<rect width="${canvas}" height="${canvas}" fill="${color}"/>`,
    `<svg x="${offset}" y="${offset}" width="${iconSize}" height="${iconSize}" viewBox="${viewBox}">`,
    inner,
    `</svg>`,
    `</svg>`,
  ].join("");
}

function main(): void {
  const source = fs.readFileSync(SVG_PATH, "utf8");

  for (const icon of ICONS) {
    const svg = icon.background
      ? wrapWithBackground(source, icon.background.color, icon.background.scale)
      : source;
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: icon.size },
    });
    const png = resvg.render().asPng();
    const outPath = path.join(ROOT, icon.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, png);

    const sizeKb = (png.byteLength / 1024).toFixed(1);
    console.log(`wrote ${icon.out} (${icon.size}x${icon.size}, ${sizeKb} KB)`);
  }
}

main();
