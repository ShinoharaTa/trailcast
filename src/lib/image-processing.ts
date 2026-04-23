// カバー画像の前処理: 3:1 に中央クロップ → 幅 1000px 未満にリサイズ →
// WebP 変換 + 品質を落としながら 1MB 以下に収める。

const COVER_ASPECT_RATIO = 3 / 1; // 横:縦
const COVER_MAX_WIDTH = 999; // "1000px を下回る"
const COVER_MAX_BYTES = 1024 * 1024; // 1MB
const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.35, 0.28];

export interface ProcessedImage {
  blob: Blob;
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e instanceof Error ? e : new Error("画像の読み込みに失敗しました"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("画像の変換に失敗しました"));
      },
      type,
      quality,
    );
  });
}

export async function processCoverImage(file: File): Promise<ProcessedImage> {
  const img = await loadImage(file);
  const srcAspect = img.width / img.height;

  // 1) 中央クロップで 3:1 の領域を抜き出す
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcAspect > COVER_ASPECT_RATIO) {
    // 元画像が横長すぎる → 左右を削る
    sw = Math.round(img.height * COVER_ASPECT_RATIO);
    sx = Math.round((img.width - sw) / 2);
  } else if (srcAspect < COVER_ASPECT_RATIO) {
    // 元画像が縦長すぎる → 上下を削る
    sh = Math.round(img.width / COVER_ASPECT_RATIO);
    sy = Math.round((img.height - sh) / 2);
  }

  // 2) 描画サイズを決定 (拡大はしない / 幅 < 1000px)
  let dw = sw;
  let dh = sh;
  if (dw > COVER_MAX_WIDTH) {
    const scale = COVER_MAX_WIDTH / dw;
    dw = COVER_MAX_WIDTH;
    dh = Math.round(sh * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context を取得できませんでした");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

  // 3) WebP で品質を段階的に落として 1MB 以下に収める
  let best: Blob | null = null;
  for (const q of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, "image/webp", q);
    best = blob;
    if (blob.size <= COVER_MAX_BYTES) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        blob,
        bytes,
        mimeType: "image/webp",
        width: dw,
        height: dh,
      };
    }
  }

  // 最終フォールバック: 最低品質でも 1MB 超なら幅をさらに縮小して再試行
  let fallbackW = Math.round(dw * 0.8);
  let fallbackH = Math.round(dh * 0.8);
  while (fallbackW > 300) {
    canvas.width = fallbackW;
    canvas.height = fallbackH;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) break;
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    ctx2.drawImage(img, sx, sy, sw, sh, 0, 0, fallbackW, fallbackH);
    const blob = await canvasToBlob(canvas, "image/webp", 0.35);
    best = blob;
    if (blob.size <= COVER_MAX_BYTES) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        blob,
        bytes,
        mimeType: "image/webp",
        width: fallbackW,
        height: fallbackH,
      };
    }
    fallbackW = Math.round(fallbackW * 0.85);
    fallbackH = Math.round(fallbackH * 0.85);
  }

  // それでも無理ならそのまま返す (サイズ超過だが保存は試みる)
  if (!best) throw new Error("画像の圧縮に失敗しました");
  const bytes = new Uint8Array(await best.arrayBuffer());
  return {
    blob: best,
    bytes,
    mimeType: "image/webp",
    width: canvas.width,
    height: canvas.height,
  };
}
