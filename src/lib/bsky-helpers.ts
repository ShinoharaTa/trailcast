import { getAgent } from "@/lib/atp-agent";
import { resolveIdentifier } from "@/lib/pds/identity";

// ─── embed #view からの画像 URL 抽出 (プレビュー表示用) ────────────

export function extractImagesFromEmbed(
  embed: Record<string, unknown> | undefined | null,
): string[] {
  if (!embed) return [];

  const images: string[] = [];
  const type = embed.$type as string | undefined;

  if (type === "app.bsky.embed.images#view") {
    extractViewUrls(embed, images);
  } else if (type === "app.bsky.embed.recordWithMedia#view") {
    const media = embed.media as Record<string, unknown> | undefined;
    if (media?.$type === "app.bsky.embed.images#view") {
      extractViewUrls(media, images);
    }
  }
  return images;
}

function extractViewUrls(obj: Record<string, unknown>, out: string[]) {
  const imgs = obj.images as
    | { thumb?: string; fullsize?: string }[]
    | undefined;
  if (!imgs) return;
  for (const img of imgs) {
    const url = img.fullsize ?? img.thumb;
    if (url) out.push(url);
  }
}

// ─── Bluesky 投稿の取得 ────────────────────────────────────────

export interface BskyPostData {
  text: string;
  createdAt: string;
  viewImageUrls: string[];
  authorDid: string;
}

export async function fetchBskyPost(atUri: string): Promise<BskyPostData> {
  const agent = getAgent();
  const res = await agent.getPostThread({ uri: atUri, depth: 0 });

  const thread = res.data.thread;
  if (!thread || !("post" in thread)) {
    throw new Error("投稿が見つかりません");
  }

  const postView = (
    thread as unknown as { post: Record<string, unknown> }
  ).post;
  const record = postView.record as Record<string, unknown> | undefined;
  const viewEmbed = postView.embed as Record<string, unknown> | undefined;
  const author = postView.author as { did: string } | undefined;
  const authorDid = author?.did ?? "";

  const text = (record?.text as string) ?? "";
  const createdAt = (record?.createdAt as string) ?? "";

  const viewImageUrls = extractImagesFromEmbed(viewEmbed);

  return { text, createdAt, viewImageUrls, authorDid };
}

// ─── URL / at-uri パース ──────────────────────────────────────

const BSKY_URL_PATTERN =
  /^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^/?#\s]+)\/post\/([^/?#\s]+)/i;
const AT_URI_PATTERN =
  /^at:\/\/([^/?#\s]+)\/app\.bsky\.feed\.post\/([^/?#\s]+)$/;

/**
 * bsky.app の投稿 URL もしくは at:// URI を at://{did}/app.bsky.feed.post/{rkey}
 * 形式に正規化する。handle が含まれていれば DID に解決する。
 */
export async function normalizeBskyPostUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("空の URL です");

  const atMatch = trimmed.match(AT_URI_PATTERN);
  if (atMatch) {
    const repo = atMatch[1];
    const rkey = atMatch[2];
    const did = repo.startsWith("did:") ? repo : await resolveIdentifier(repo);
    return `at://${did}/app.bsky.feed.post/${rkey}`;
  }

  const bskyMatch = trimmed.match(BSKY_URL_PATTERN);
  if (bskyMatch) {
    const repo = decodeURIComponent(bskyMatch[1]);
    const rkey = bskyMatch[2];
    const did = await resolveIdentifier(repo);
    return `at://${did}/app.bsky.feed.post/${rkey}`;
  }

  throw new Error("Bluesky 投稿 URL として認識できません");
}

// ─── 複数投稿のバッチ取得 ────────────────────────────────────

export interface BskyPostView {
  uri: string;
  author: { did: string };
  record: unknown;
  embed?: unknown;
  indexedAt: string;
}

/**
 * at-uri のリストを app.bsky.feed.getPosts でバッチ取得する。
 * getPosts の上限は 25 件のため自動でチャンク分割する。
 */
export async function fetchBskyPosts(
  atUris: string[],
): Promise<BskyPostView[]> {
  if (atUris.length === 0) return [];
  const agent = getAgent();
  const all: BskyPostView[] = [];
  for (let i = 0; i < atUris.length; i += 25) {
    const chunk = atUris.slice(i, i + 25);
    const res = await agent.app.bsky.feed.getPosts({ uris: chunk });
    all.push(...(res.data.posts as unknown as BskyPostView[]));
  }
  return all;
}
