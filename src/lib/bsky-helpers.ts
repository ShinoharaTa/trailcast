import { getAgent } from "@/lib/atp-agent";

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
