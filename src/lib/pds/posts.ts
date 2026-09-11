import { getAgent, getMyDid } from "@/lib/atp-agent";
import {
  NSID_POST,
  buildAtUri,
  stripRecordMeta,
  type PostRecord,
  type PostWithMeta,
} from "@/lib/types";
import { getRecordViaPds } from "@/lib/pds/repo-read";
import { notifyPostIndexed } from "@/lib/index-api";
import { touchThread } from "@/lib/pds/thread-activity";

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
    repo: getMyDid(),
    collection: NSID_POST,
    rkey,
    record: record as unknown as Record<string, unknown>,
  });
  // Public スレッドの集約インデックスに反映する (#14 方式 A)。
  // 失敗しても投稿自体は成功なので待たない・投げない。
  void notifyPostIndexed(res.data.uri);
  // 一覧を最終活動順に並べるためスレッド側の updatedAt を進める (#47)
  void touchThread(record.thread);
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
    repo: getMyDid(),
    collection: NSID_POST,
    rkey,
    record: record as unknown as Record<string, unknown>,
  });
  void notifyPostIndexed(res.data.uri);
  void touchThread(record.thread);
  return { ...record, uri: res.data.uri, cid: res.data.cid, rkey };
}

/**
 * @param threadUri 削除する投稿が属していたスレッド。渡すとそのスレッドの
 *   updatedAt を進める (削除後は投稿から辿れないため呼び出し側が渡す)。
 */
export async function deletePost(
  rkey: string,
  threadUri?: string,
): Promise<void> {
  const agent = getAgent();
  const did = getMyDid();
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: NSID_POST,
    rkey,
  });
  // サーバは PDS に getRecord して不在を確認したらインデックスから消すので、
  // 削除も作成と同じ入口でよい。
  void notifyPostIndexed(buildAtUri(did, NSID_POST, rkey));
  if (threadUri) void touchThread(threadUri);
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

  // タグは取り込み後にユーザーが編集しうるので、元投稿では上書きしない。
  // 本文と画像 URL 以外は既存 record をそのまま引き継ぐ。
  const updated: PostRecord = {
    ...stripRecordMeta(post),
    text: bskyData.text || post.text,
    imageUrls: bskyData.viewImageUrls.length > 0
      ? bskyData.viewImageUrls.slice(0, 4)
      : post.imageUrls,
  };

  return updatePost(post.rkey, updated);
}
