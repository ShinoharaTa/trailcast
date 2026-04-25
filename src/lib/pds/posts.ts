import { getAgent } from "@/lib/atp-agent";
import {
  NSID_POST,
  type PostRecord,
  type PostWithMeta,
} from "@/lib/types";
import { getRecordViaPds } from "@/lib/pds/repo-read";

function generateTid(): string {
  const now = BigInt(Date.now()) * 1000n;
  const clockId = BigInt(Math.floor(Math.random() * 1024));
  const tid = (now << 10n) | clockId;
  return tid.toString(32).padStart(13, "0");
}

export async function uploadImage(file: Uint8Array, mimeType: string) {
  const agent = getAgent();
  const res = await agent.com.atproto.repo.uploadBlob(file, {
    encoding: mimeType,
  });
  return res.data.blob;
}

export async function createPost(
  record: PostRecord,
): Promise<PostWithMeta> {
  const agent = getAgent();
  const rkey = generateTid();
  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.session!.did,
    collection: NSID_POST,
    rkey,
    record: record as unknown as Record<string, unknown>,
  });
  return { ...record, uri: res.data.uri, cid: res.data.cid, rkey };
}

export async function getPost(
  did: string,
  rkey: string,
): Promise<PostWithMeta> {
  const res = await getRecordViaPds<PostRecord>(did, NSID_POST, rkey);
  return { ...res.value, uri: res.uri, cid: res.cid, rkey };
}

export async function updatePost(
  rkey: string,
  record: PostRecord,
): Promise<PostWithMeta> {
  const agent = getAgent();
  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.session!.did,
    collection: NSID_POST,
    rkey,
    record: record as unknown as Record<string, unknown>,
  });
  return { ...record, uri: res.data.uri, cid: res.data.cid, rkey };
}

export async function deletePost(rkey: string): Promise<void> {
  const agent = getAgent();
  await agent.com.atproto.repo.deleteRecord({
    repo: agent.session!.did,
    collection: NSID_POST,
    rkey,
  });
}

/**
 * sourceRef を持つ投稿を元の Bluesky 投稿から再取得し、
 * テキスト・画像 URL を最新の状態に更新する。
 */
export async function refreshFromSource(
  post: PostWithMeta,
): Promise<PostWithMeta> {
  if (!post.sourceRef) throw new Error("sourceRef がありません");

  const { fetchBskyPost } = await import("@/lib/bsky-helpers");
  const bskyData = await fetchBskyPost(post.sourceRef);

  const updated: PostRecord = {
    thread: post.thread,
    text: bskyData.text || post.text,
    images: post.images,
    imageUrls: bskyData.viewImageUrls.length > 0
      ? bskyData.viewImageUrls.slice(0, 4)
      : post.imageUrls,
    location: post.location,
    checkpointAt: post.checkpointAt,
    exif: post.exif,
    sourceRef: post.sourceRef,
    createdAt: post.createdAt,
  };

  return updatePost(post.rkey, updated);
}
