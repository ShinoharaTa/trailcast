// 画像選択直後に呼び出して「縮小 + 圧縮」を一気に終わらせるユーティリティ。
//
// 設計意図:
//   1. iOS Safari の `<input type=file>` 由来の File は、選択後に時間が経つと
//      (タブのバックグラウンド遷移、メモリ逼迫、iCloud 経由の遅延ダウンロード等で)
//      "NotReadableError" になることがある。File への再アクセスを最小化するため、
//      選択直後に一度 ArrayBuffer に吸い出してしまい、以降は Blob ベースで扱う。
//   2. PDS / Bluesky への投稿サイズ規約に合わせて、1000px 四方以下 / 1MB 以下に
//      縮小・圧縮する。EXIF 由来の回転は事前に適用してピクセルへ焼き込む
//      (`createImageBitmap` の `imageOrientation: "from-image"`)。
//   3. EXIF の DateTimeOriginal はリエンコード前のバッファから取る (canvas
//      経由のリエンコードでは EXIF が落ちるため)。
//
// 戻り値の `blob` がそのままプレビューにも、PDS アップロードにも使える形。
// 元の File への参照は呼び出し側で保持しなくて良い。

import { extractPhotoMetadata } from "@/lib/exif";
import type { Location } from "@/lib/types";

const MAX_DIMENSION = 1000;
const MAX_BYTES = 1_000_000; // 1MB
const OUTPUT_TYPE = "image/jpeg";

export interface PreparedImage {
  /** 縮小・圧縮済みの画像本体 */
  blob: Blob;
  /** リサイズ後の幅 (Bluesky aspectRatio にそのまま使う) */
  width: number;
  /** リサイズ後の高さ */
  height: number;
  /** 出力 MIME (常に image/jpeg) */
  type: string;
  /** EXIF から取れた撮影日時。なければ null */
  timestamp: Date | null;
  /** EXIF から取れた撮影位置 (GPS)。なければ null */
  location: Location | null;
}

interface DecodedSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decodeImage(blob: Blob): Promise<DecodedSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bm = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
      return {
        source: bm,
        width: bm.width,
        height: bm.height,
        close: () => bm.close(),
      };
    } catch {
      // fallthrough to <img>
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("画像をデコードできませんでした"));
    img.src = url;
  });
  return {
    source: img,
    width: img.naturalWidth || 1,
    height: img.naturalHeight || 1,
    close: () => URL.revokeObjectURL(url),
  };
}

function scaleToFit(
  w: number,
  h: number,
  max: number,
): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("画像のエンコードに失敗しました")),
      type,
      quality,
    );
  });
}

function drawTo(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D コンテキストを取得できませんでした");
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * 1MB 以下になるまで品質を段階的に下げ、それでも収まらない場合は
 * 寸法も 0.85 倍ずつ落として再エンコードする。
 */
async function encodeUnderLimit(
  initialCanvas: HTMLCanvasElement,
): Promise<{ blob: Blob; width: number; height: number }> {
  let canvas = initialCanvas;
  const qualitySteps = [0.92, 0.85, 0.78, 0.7, 0.6, 0.5, 0.4];

  for (let attempt = 0; attempt < 5; attempt++) {
    let blob: Blob | null = null;
    for (const q of qualitySteps) {
      blob = await canvasToBlob(canvas, OUTPUT_TYPE, q);
      if (blob.size <= MAX_BYTES) {
        return { blob, width: canvas.width, height: canvas.height };
      }
    }
    if (canvas.width <= 400 && canvas.height <= 400) {
      // これ以上小さくしないほうが見れる画像になるので最後の blob を返す
      if (blob) {
        return { blob, width: canvas.width, height: canvas.height };
      }
      throw new Error("画像を十分に圧縮できませんでした");
    }
    const nextW = Math.max(1, Math.round(canvas.width * 0.85));
    const nextH = Math.max(1, Math.round(canvas.height * 0.85));
    canvas = drawTo(canvas, nextW, nextH);
  }
  throw new Error("画像を十分に圧縮できませんでした");
}

/**
 * 選択された File を「縮小 + 圧縮 + EXIF 撮影日時抽出」まで終わらせる。
 *
 * 失敗時は `Error` を throw する。呼び出し側は try/catch して
 * 「画像を読み込めませんでした」のような UX 文言にマップすること。
 */
export async function processSelectedImage(file: File): Promise<PreparedImage> {
  // File 実体への IO を 1 回で終わらせる。これ以降は ArrayBuffer / Blob のみ参照する。
  const buffer = await file.arrayBuffer();
  const sourceBlob = new Blob([buffer], {
    type: file.type || OUTPUT_TYPE,
  });

  const { timestamp, location } = await extractPhotoMetadata(buffer);

  const decoded = await decodeImage(sourceBlob);
  try {
    const target = scaleToFit(decoded.width, decoded.height, MAX_DIMENSION);
    const canvas = drawTo(decoded.source, target.width, target.height);
    const { blob, width, height } = await encodeUnderLimit(canvas);
    return {
      blob,
      width,
      height,
      type: OUTPUT_TYPE,
      timestamp,
      location,
    };
  } finally {
    decoded.close();
  }
}
