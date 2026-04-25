// Bluesky への同時投稿用ユーティリティ。
//
// 仕様 (本プロジェクト固有):
//   投稿テキスト:
//     {body (チェックポイント本文)}      ← 空ならこの 2 行は出力しない
//                                       ← (本文の後ろに空行)
//     {title (40文字 grapheme で truncate)}で記録中 #Trailcast
//     trailcast.shino3.net/{handle}/{rkey}
//
//   facets:
//     - "#Trailcast"           → app.bsky.richtext.facet#tag  (tag: "Trailcast")
//     - "trailcast.shino3.net/{handle}/{rkey}"
//                              → app.bsky.richtext.facet#link (uri: フル https URL)
//
//   embed.images:
//     PDS にアップ済みの BlobRef をそのまま再利用し、各 image エントリに
//     `aspectRatio: { width, height }` (リサイズ後 = 元画像の自然サイズ) を付与する。

import type { BlobRef } from "@atproto/api";
import { parseAtUri } from "@/lib/types";

const SITE_HOST = "trailcast.shino3.net";
const SITE_URL = `https://${SITE_HOST}`;
const TITLE_MAX_GRAPHEMES = 40;

export interface CrosspostFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<
    | { $type: "app.bsky.richtext.facet#tag"; tag: string }
    | { $type: "app.bsky.richtext.facet#link"; uri: string }
  >;
}

export interface CrosspostText {
  text: string;
  facets: CrosspostFacet[];
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * grapheme 単位で max 文字に丸める。Intl.Segmenter が無い環境では
 * UTF-16 code point 単位で代替する (絵文字 ZWJ 連結等は厳密には扱えない)。
 */
function truncateGraphemes(input: string, max: number): string {
  const text = input.trim();
  const SegmenterCtor = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter })
    .Segmenter;
  if (SegmenterCtor) {
    const segs: string[] = [];
    for (const s of new SegmenterCtor("ja", { granularity: "grapheme" }).segment(
      text,
    )) {
      segs.push(s.segment);
    }
    if (segs.length <= max) return text;
    return segs.slice(0, Math.max(1, max - 1)).join("") + "…";
  }
  const arr = Array.from(text);
  if (arr.length <= max) return text;
  return arr.slice(0, Math.max(1, max - 1)).join("") + "…";
}

export interface BuildCrosspostTextInput {
  title: string;
  /** 投稿者 (= ログインユーザー) の handle。URL 表示に使う */
  handle: string;
  /** スレッドの at-uri。rkey を取り出して URL に組み込む */
  threadUri: string;
  /**
   * チェックポイント本文。空 (or undefined) ならテンプレ部だけ出力。
   * 値があるときは「本文 + 空行 + テンプレ」の構成にする。
   */
  body?: string;
}

/**
 * 仕様どおりの text + facets を組み立てる。
 */
export function buildCrosspostText(input: BuildCrosspostTextInput): CrosspostText {
  const { title, handle, threadUri, body } = input;
  const { rkey } = parseAtUri(threadUri);
  const safeTitle = truncateGraphemes(title || "Trailcast", TITLE_MAX_GRAPHEMES);
  const tagLabel = "#Trailcast";
  const templateLine = `${safeTitle}で記録中 ${tagLabel}`;
  const urlPath = `/${handle}/${rkey}`;
  const urlText = `${SITE_HOST}${urlPath}`;
  const urlUri = `${SITE_URL}${urlPath}`;

  // 本文がある場合は先頭に「本文 + 空行」を付ける。空行は \n\n で表現。
  const bodyTrimmed = (body ?? "").trim();
  const prefix = bodyTrimmed ? `${bodyTrimmed}\n\n` : "";
  const text = `${prefix}${templateLine}\n${urlText}`;

  const prefixBytes = utf8Length(prefix);
  const tagStart = prefixBytes + utf8Length(`${safeTitle}で記録中 `);
  const tagEnd = tagStart + utf8Length(tagLabel);
  const urlStart = prefixBytes + utf8Length(`${templateLine}\n`);
  const urlEnd = urlStart + utf8Length(urlText);

  return {
    text,
    facets: [
      {
        index: { byteStart: tagStart, byteEnd: tagEnd },
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: "Trailcast" }],
      },
      {
        index: { byteStart: urlStart, byteEnd: urlEnd },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: urlUri }],
      },
    ],
  };
}

/**
 * 画像ファイルの自然サイズ (アスペクト比用) を取得する。
 * リサイズ済みのファイルが渡される想定なので、その自然サイズがそのまま
 * Bluesky に申告するアスペクト比となる。
 */
export async function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("画像を読み込めませんでした"));
      img.src = url;
    });
    return { width: img.naturalWidth || 1, height: img.naturalHeight || 1 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface CrosspostImageInput {
  blob: BlobRef;
  width: number;
  height: number;
}

export interface CrosspostImagesEmbed {
  $type: "app.bsky.embed.images";
  images: Array<{
    alt: string;
    image: BlobRef;
    aspectRatio: { width: number; height: number };
  }>;
}

/**
 * `app.bsky.embed.images` の embed オブジェクトを組み立てる。
 * aspectRatio は必ず付与する (仕様要件)。
 */
export function buildEmbedImages(
  images: CrosspostImageInput[],
): CrosspostImagesEmbed | undefined {
  if (images.length === 0) return undefined;
  return {
    $type: "app.bsky.embed.images",
    images: images.map((img) => ({
      alt: "",
      image: img.blob,
      aspectRatio: { width: img.width, height: img.height },
    })),
  };
}
