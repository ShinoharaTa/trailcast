// Canvas を使ってスレッド用 OG 画像 (1200x630 JPEG) を生成する。
//
// レイアウト:
//   - 背景: カバー画像 (cover-fill) + 暗いグラデーションオーバーレイ
//           なければダーク + 紫系グラデーション
//   - 中央左: スレッドタイトル (最大 3 行、ellipsis)
//   - 左下: アバター + 表示名 + @handle
//   - 右下: Trailcast ロゴ (ミニアイコン + ワードマーク)
//
// フォントは globals.css と揃えて "Inter" + "Noto Sans JP"。
// layout.tsx で Google Fonts を読み込んでいるので、document.fonts.load で
// レンダリング前に確実に load してから drawText する。

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 64;
const MAX_TITLE_LINES = 3;
const FONT_FAMILY = '"Inter", "Noto Sans JP", system-ui, sans-serif';

export interface ThreadOgRenderInput {
  title: string;
  /** カバー画像。Blob (新規アップロード分) もしくは fetch 可能な URL。 */
  cover?: Blob | string | null;
  /** アバター画像 URL (CORS が許可されているもの)。 */
  avatar?: string | null;
  /** 表示名。なければ handle にフォールバック。 */
  displayName?: string | null;
  /** @ 抜きの handle 文字列。 */
  handle?: string | null;
}

export interface ThreadOgRenderOutput {
  blob: Blob;
  bytes: Uint8Array;
  mimeType: "image/jpeg";
  width: number;
  height: number;
}

/**
 * Web フォントが load 済みになるのを待つ。Google Fonts は CSS 経由で来るため、
 * document.fonts.load() を呼ばないと初回描画でフォールバックフォントが使われる
 * 可能性がある。
 */
async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const specs = [
    `800 80px "Inter"`,
    `700 80px "Noto Sans JP"`,
    `700 28px "Inter"`,
    `500 22px "Noto Sans JP"`,
  ];
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
  } catch {
    // フォント load 失敗時は fallback で続行
  }
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Blob 画像の読み込みに失敗"));
    };
    img.src = url;
  });
}

/**
 * URL から画像を取り込む。
 *
 * `<img crossOrigin="anonymous">` 経由ではなく `fetch` → `Blob` →
 * `blob:` URL の流れで取り込む理由:
 *   - fetch なら CORS エラー時にハンドリングと警告ログが取りやすい
 *   - 取り出した Blob は同一オリジンの `blob:` URL になるので、
 *     後続の Canvas 描画で taint されず、`toBlob()` も確実に動く
 *   - 一部 CDN (cdn.bsky.app の avatar 等) はリダイレクトを挟む際に
 *     CORS が落ちることがあるが、fetch なら同等の挙動を取れる
 */
async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) {
    throw new Error(`画像の取得に失敗 (${res.status}): ${url}`);
  }
  const blob = await res.blob();
  return loadImageFromBlob(blob);
}

async function loadImage(
  src: Blob | string,
): Promise<HTMLImageElement | null> {
  try {
    if (typeof src === "string") return await loadImageFromUrl(src);
    return await loadImageFromBlob(src);
  } catch (e) {
    console.warn("[og] image load failed", e);
    return null;
  }
}

function drawCoverBackground(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
): void {
  // cover-fill: アスペクト比を保ったまま中央クロップで領域を埋める
  const dstRatio = WIDTH / HEIGHT;
  const srcRatio = img.width / img.height;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > dstRatio) {
    sw = Math.round(img.height * dstRatio);
    sx = Math.round((img.width - sw) / 2);
  } else if (srcRatio < dstRatio) {
    sh = Math.round(img.width / dstRatio);
    sy = Math.round((img.height - sh) / 2);
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT);

  // テキスト可読性のため、暗いグラデーションを上に重ねる
  const overlay = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  overlay.addColorStop(0, "rgba(10, 14, 26, 0.55)");
  overlay.addColorStop(0.6, "rgba(10, 14, 26, 0.78)");
  overlay.addColorStop(1, "rgba(10, 14, 26, 0.92)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawDefaultBackground(ctx: CanvasRenderingContext2D): void {
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#0a0e1a");
  bg.addColorStop(1, "#1e1440");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow1 = ctx.createRadialGradient(
    WIDTH * 0.85,
    HEIGHT * 0.15,
    0,
    WIDTH * 0.85,
    HEIGHT * 0.15,
    WIDTH * 0.7,
  );
  glow1.addColorStop(0, "rgba(99, 102, 241, 0.45)");
  glow1.addColorStop(1, "rgba(99, 102, 241, 0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow2 = ctx.createRadialGradient(
    WIDTH * 0.1,
    HEIGHT * 0.9,
    0,
    WIDTH * 0.1,
    HEIGHT * 0.9,
    WIDTH * 0.7,
  );
  glow2.addColorStop(0, "rgba(139, 92, 246, 0.35)");
  glow2.addColorStop(1, "rgba(139, 92, 246, 0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/**
 * Intl.Segmenter で grapheme/word に区切る。CJK と ASCII の混在を扱える。
 * フォールバックとして単純な char 配列を返す。
 */
function segmentText(text: string): string[] {
  type SegmenterCtor = new (
    locales?: string,
    options?: { granularity?: "grapheme" | "word" | "sentence" },
  ) => { segment(input: string): Iterable<{ segment: string }> };
  const SegmenterRef = (Intl as unknown as { Segmenter?: SegmenterCtor })
    .Segmenter;
  if (SegmenterRef) {
    try {
      const seg = new SegmenterRef("ja", { granularity: "word" });
      return Array.from(seg.segment(text)).map((s) => s.segment);
    } catch {
      // fallthrough
    }
  }
  return Array.from(text);
}

/**
 * 等幅でない文字列を maxWidth に収まるよう貪欲に折り返す。
 * 行数が maxLines を超える場合は末尾を "…" に置き換える。
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const segs = segmentText(text);
  const lines: string[] = [];
  let current = "";
  let i = 0;
  while (i < segs.length && lines.length < maxLines) {
    const seg = segs[i];
    const trial = current + seg;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
      i++;
    } else if (current === "") {
      // 単独でも収まらない (極端に長い 1 文字) 場合は強制配置
      current = seg;
      i++;
    } else {
      lines.push(current);
      current = "";
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // 全文収まらなかった場合は末尾の行に "…" を付与
  if (i < segs.length && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 0 && ctx.measureText(last + "…").width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = last + "…";
  }
  return lines;
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  title: string,
): void {
  // 1 行で収まるなら大きく、行数が増えるなら小さく自動調整
  // (1 行: 96, 2 行: 80, 3 行: 64)
  const maxWidth = WIDTH - PADDING * 2;
  const sizeOptions: Array<{ size: number; maxLines: number }> = [
    { size: 96, maxLines: 1 },
    { size: 80, maxLines: 2 },
    { size: 64, maxLines: MAX_TITLE_LINES },
  ];
  let chosenSize = sizeOptions[sizeOptions.length - 1].size;
  let chosenLines: string[] = [];
  for (const opt of sizeOptions) {
    ctx.font = `800 ${opt.size}px ${FONT_FAMILY}`;
    const lines = wrapText(ctx, title, maxWidth, opt.maxLines);
    if (lines.length <= opt.maxLines) {
      chosenSize = opt.size;
      chosenLines = lines;
      break;
    }
    chosenSize = opt.size;
    chosenLines = lines;
  }
  ctx.font = `800 ${chosenSize}px ${FONT_FAMILY}`;
  const lineHeight = chosenSize * 1.18;
  const blockHeight = chosenLines.length * lineHeight;

  // ユーザー情報用の bottom 領域を避けて、上下中央付近に配置
  const userAreaHeight = 64 + 32; // avatar + spacing
  const top = (HEIGHT - userAreaHeight - blockHeight) / 2;

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 12;
  for (let i = 0; i < chosenLines.length; i++) {
    ctx.fillText(chosenLines[i], PADDING, top + i * lineHeight);
  }
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}

function drawCircularImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // cover-fill (square crop)
  const srcSize = Math.min(img.width, img.height);
  const sx = Math.round((img.width - srcSize) / 2);
  const sy = Math.round((img.height - srcSize) / 2);
  ctx.drawImage(img, sx, sy, srcSize, srcSize, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function drawUserInfo(
  ctx: CanvasRenderingContext2D,
  avatar: HTMLImageElement | null,
  displayName: string,
  handle: string,
): void {
  // アバター有り: 円形に描画してテキストを横に並べる
  // アバター無し (未設定 or 取得失敗): プレースホルダーは描画せず、
  // テキストブロックだけを PADDING 起点で表示する。
  const avatarR = 36;
  const baseY = HEIGHT - PADDING - avatarR;
  let textX = PADDING;

  if (avatar) {
    const cx = PADDING + avatarR;
    drawCircularImage(ctx, avatar, cx, baseY, avatarR);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.beginPath();
    ctx.arc(cx, baseY, avatarR, 0, Math.PI * 2);
    ctx.stroke();
    textX = cx + avatarR + 18;
  }

  const nameY = baseY - 18;
  const handleY = baseY + 14;

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.font = `700 26px ${FONT_FAMILY}`;
  ctx.fillText(displayName, textX, nameY);

  if (handle) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.font = `500 22px ${FONT_FAMILY}`;
    ctx.fillText(`@${handle}`, textX, handleY);
  }
  ctx.textBaseline = "alphabetic";
}

function drawTrailcastLogo(ctx: CanvasRenderingContext2D): void {
  // 右下に "[icon] Trailcast" のロックアップ
  const wordmark = "Trailcast";
  ctx.font = `800 30px ${FONT_FAMILY}`;
  const wmWidth = ctx.measureText(wordmark).width;
  const iconSize = 36;
  const gap = 12;
  const totalW = iconSize + gap + wmWidth;

  const baseY = HEIGHT - PADDING;
  const baseX = WIDTH - PADDING - totalW;

  // アイコンマーク (角丸グラデ正方形 + 白の本のシルエット)
  const iconY = baseY - iconSize + 6; // 視覚的に baseline と揃える
  ctx.save();
  const grad = ctx.createLinearGradient(
    baseX,
    iconY,
    baseX + iconSize,
    iconY + iconSize,
  );
  grad.addColorStop(0, "#6366f1");
  grad.addColorStop(1, "#8b5cf6");
  ctx.fillStyle = grad;
  const r = 9;
  ctx.beginPath();
  ctx.moveTo(baseX + r, iconY);
  ctx.lineTo(baseX + iconSize - r, iconY);
  ctx.quadraticCurveTo(
    baseX + iconSize,
    iconY,
    baseX + iconSize,
    iconY + r,
  );
  ctx.lineTo(baseX + iconSize, iconY + iconSize - r);
  ctx.quadraticCurveTo(
    baseX + iconSize,
    iconY + iconSize,
    baseX + iconSize - r,
    iconY + iconSize,
  );
  ctx.lineTo(baseX + r, iconY + iconSize);
  ctx.quadraticCurveTo(
    baseX,
    iconY + iconSize,
    baseX,
    iconY + iconSize - r,
  );
  ctx.lineTo(baseX, iconY + r);
  ctx.quadraticCurveTo(baseX, iconY, baseX + r, iconY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ワードマーク
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = `800 30px ${FONT_FAMILY}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(wordmark, baseX + iconSize + gap, baseY);
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
        else reject(new Error("Canvas を Blob に変換できませんでした"));
      },
      type,
      quality,
    );
  });
}

const MAX_BYTES = 500 * 1024; // lexicon の maxSize (500KB) に合わせる
const QUALITY_STEPS = [0.85, 0.78, 0.7, 0.62, 0.55];

/**
 * スレッド用 OG 画像を 1200x630 JPEG として生成する。
 * - cover を渡せばそれを背景に使い、なければデフォルトのグラデ背景。
 * - JPEG 品質を段階的に落として 500KB 以下に収める。
 */
export async function renderThreadOgImage(
  input: ThreadOgRenderInput,
): Promise<ThreadOgRenderOutput> {
  if (typeof document === "undefined") {
    throw new Error("renderThreadOgImage はブラウザ環境でのみ動作します");
  }
  await ensureFonts();

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context を取得できませんでした");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 1) 背景
  const coverImg = input.cover ? await loadImage(input.cover) : null;
  if (coverImg) drawCoverBackground(ctx, coverImg);
  else drawDefaultBackground(ctx);

  // 2) タイトル
  const title = (input.title || "").trim() || "(無題)";
  drawTitle(ctx, title);

  // 3) ユーザー情報
  const avatarImg = input.avatar ? await loadImage(input.avatar) : null;
  const displayName =
    (input.displayName || "").trim() ||
    (input.handle || "").trim() ||
    "";
  const handle = (input.handle || "").trim();
  if (displayName || handle) {
    drawUserInfo(ctx, avatarImg, displayName || handle, handle);
  }

  // 4) Trailcast ロゴ
  drawTrailcastLogo(ctx);

  // 5) JPEG エンコード (500KB に収まるまで quality を下げる)
  let best: Blob | null = null;
  for (const q of QUALITY_STEPS) {
    const blob = await canvasToBlob(canvas, "image/jpeg", q);
    best = blob;
    if (blob.size <= MAX_BYTES) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        blob,
        bytes,
        mimeType: "image/jpeg",
        width: WIDTH,
        height: HEIGHT,
      };
    }
  }
  if (!best) throw new Error("OG 画像の生成に失敗しました");
  const bytes = new Uint8Array(await best.arrayBuffer());
  return {
    blob: best,
    bytes,
    mimeType: "image/jpeg",
    width: WIDTH,
    height: HEIGHT,
  };
}
