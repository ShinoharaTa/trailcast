// Bluesky への同時投稿用ユーティリティ。
//
// 仕様 (本プロジェクト固有):
//   投稿テキスト:
//     {body (チェックポイント本文)}      ← 空ならこの 2 行は出力しない
//     #tag1 #tag2                       ← チェックポイントのタグ。無ければ出力しない
//                                       ← (本文の後ろに空行)
//     {title (40文字 grapheme で truncate)}で記録中 #Trailcast
//     trailcast.shino3.net/{handle}/{rkey}
//
//   facets:
//     - "#tag1" / "#tag2"      → app.bsky.richtext.facet#tag  (tag: タグ本体)
//     - "#Trailcast"           → app.bsky.richtext.facet#tag  (tag: "Trailcast")
//     - "trailcast.shino3.net/{handle}/{rkey}"
//                              → app.bsky.richtext.facet#link (uri: フル https URL)
//
//   Trailcast 側ではタグは本文と別フィールド (`post.tags`) に持ち、Bluesky に
//   出すときだけハッシュタグとして本文に展開する。本文の 200 文字制限を
//   タグが食わないようにするための構成。
//
//   embed.images:
//     PDS にアップ済みの BlobRef をそのまま再利用し、各 image エントリに
//     `aspectRatio: { width, height }` (リサイズ後 = 元画像の自然サイズ) を付与する。

import type { BlobRef } from "@atproto/api";
import { parseAtUri } from "@/lib/types";
import { dedupeTags, normalizeTag, tagKey } from "@/lib/tags";

const SITE_HOST = "trailcast.shino3.net";
const SITE_URL = `https://${SITE_HOST}`;
const TITLE_MAX_GRAPHEMES = 40;

/** Bluesky の投稿テキスト上限 (grapheme)。超えると投稿自体が失敗する */
const BSKY_TEXT_MAX_GRAPHEMES = 300;

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
 * grapheme 単位の文字数。Intl.Segmenter が無い環境では code point 単位で代替する。
 */
function countGraphemes(input: string): number {
  const SegmenterCtor = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter })
    .Segmenter;
  if (!SegmenterCtor) return Array.from(input).length;
  let n = 0;
  for (const _ of new SegmenterCtor("ja", { granularity: "grapheme" }).segment(
    input,
  )) {
    void _;
    n += 1;
  }
  return n;
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
  /**
   * チェックポイントに付けたタグ (先頭 `#` なし)。
   * 本文の直下にハッシュタグ行として展開し、facet#tag を付ける。
   */
  tags?: string[];
}

/**
 * 出力テキストを組み立てながら facet の byte offset を採る小さなビルダー。
 * 手計算でオフセットを積むとタグ追加のたびに壊れるため、文字列の追記と
 * オフセットの前進を必ず同じ場所で行う。
 */
function createTextBuilder() {
  let text = "";
  let bytes = 0;
  const facets: CrosspostFacet[] = [];

  const append = (s: string) => {
    text += s;
    bytes += utf8Length(s);
  };

  return {
    append,
    /** `#{tag}` を追記し、その範囲に facet#tag を張る */
    appendTag(tag: string) {
      const start = bytes;
      append(`#${tag}`);
      facets.push({
        index: { byteStart: start, byteEnd: bytes },
        features: [{ $type: "app.bsky.richtext.facet#tag", tag }],
      });
    },
    /** リンクテキストを追記し、その範囲に facet#link を張る */
    appendLink(label: string, uri: string) {
      const start = bytes;
      append(label);
      facets.push({
        index: { byteStart: start, byteEnd: bytes },
        features: [{ $type: "app.bsky.richtext.facet#link", uri }],
      });
    },
    build: (): CrosspostText => ({ text, facets }),
  };
}

/**
 * 仕様どおりの text + facets を組み立てる。
 */
export function buildCrosspostText(input: BuildCrosspostTextInput): CrosspostText {
  const { title, handle, threadUri, body, tags = [] } = input;
  const { rkey } = parseAtUri(threadUri);
  const safeTitle = truncateGraphemes(title || "Trailcast", TITLE_MAX_GRAPHEMES);
  const templateLine = `${safeTitle}で記録中 `;
  const urlPath = `/${handle}/${rkey}`;
  const urlText = `${SITE_HOST}${urlPath}`;
  const urlUri = `${SITE_URL}${urlPath}`;
  const bodyTrimmed = (body ?? "").trim();

  // テンプレ行が必ず #Trailcast を出すので、ユーザータグ側の重複は落とす。
  const candidates = dedupeTags(
    tags.map(normalizeTag).filter((t): t is string => t !== null),
  ).filter((t) => tagKey(t) !== "trailcast");

  // 300 grapheme を超えると投稿ごと失敗するため、収まる分のタグだけ載せる。
  // 本文とテンプレ部は必ず残す。
  const render = (accepted: string[]) => {
    const tagLine = accepted.map((t) => `#${t}`).join(" ");
    const head = [bodyTrimmed, tagLine].filter(Boolean).join("\n");
    const prefix = head ? `${head}\n\n` : "";
    return `${prefix}${templateLine}#Trailcast\n${urlText}`;
  };

  // 長いタグ 1 件で打ち切らず、後続の短いタグは拾う (break ではなく continue)
  const accepted: string[] = [];
  for (const tag of candidates) {
    if (countGraphemes(render([...accepted, tag])) > BSKY_TEXT_MAX_GRAPHEMES) {
      continue;
    }
    accepted.push(tag);
  }

  const b = createTextBuilder();

  if (bodyTrimmed) b.append(bodyTrimmed);
  if (accepted.length > 0) {
    if (bodyTrimmed) b.append("\n");
    accepted.forEach((tag, i) => {
      if (i > 0) b.append(" ");
      b.appendTag(tag);
    });
  }
  // 本文もタグも無ければ先頭の空行は出さない
  if (bodyTrimmed || accepted.length > 0) b.append("\n\n");

  b.append(templateLine);
  b.appendTag("Trailcast");
  b.append("\n");
  b.appendLink(urlText, urlUri);

  return b.build();
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
