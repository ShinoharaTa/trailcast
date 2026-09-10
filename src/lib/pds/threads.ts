import { getAgent, getMyDid } from "@/lib/atp-agent";
import {
  NSID_THREAD,
  NSID_POST,
  type ThreadRecord,
  type ThreadWithMeta,
  type PostRecord,
  type PostWithMeta,
  parseAtUri,
} from "@/lib/types";
import { getRecordViaPds, listAllRecordsViaPds } from "@/lib/pds/repo-read";
import { generateAndUploadThreadOgImage } from "@/lib/pds/og-image";

function generateTid(): string {
  const now = BigInt(Date.now()) * 1000n;
  const clockId = BigInt(Math.floor(Math.random() * 1024));
  const tid = (now << 10n) | clockId;
  return tid.toString(32).padStart(13, "0");
}

/**
 * createThread / updateThread で OG 画像生成に渡せる追加情報。
 * - `coverBlob`: 直前に処理したカバー画像 Blob。あれば PDS から取り直さず使う。
 * - `skipOgImage`: 明示的に OG 生成をスキップしたいときに true。
 */
export interface ThreadOgContext {
  coverBlob?: Blob | null;
  skipOgImage?: boolean;
}

/**
 * 必要に応じて OG 画像を生成して `record.ogImage` に差し込んだ新しい record を返す。
 * 生成失敗時は元の record をそのまま返す (ogImage 無しスレッドはデフォルト OG に
 * フォールバックされる)。
 */
async function withOgImage(
  record: ThreadRecord,
  ogContext?: ThreadOgContext,
): Promise<ThreadRecord> {
  if (ogContext?.skipOgImage) return record;
  const ogImage = await generateAndUploadThreadOgImage({
    title: record.title,
    did: getMyDid(),
    coverBlob: ogContext?.coverBlob ?? null,
    coverImage: record.coverImage ?? null,
  });
  if (!ogImage) return record;
  return { ...record, ogImage };
}

export async function createThread(
  record: ThreadRecord,
  ogContext?: ThreadOgContext,
): Promise<ThreadWithMeta> {
  const agent = getAgent();
  const rkey = generateTid();
  const enriched = await withOgImage(record, ogContext);
  const res = await agent.com.atproto.repo.putRecord({
    repo: getMyDid(),
    collection: NSID_THREAD,
    rkey,
    record: enriched as unknown as Record<string, unknown>,
  });
  return {
    ...enriched,
    uri: res.data.uri,
    cid: res.data.cid,
    rkey,
  };
}

export async function listThreads(
  did?: string,
): Promise<ThreadWithMeta[]> {
  const repo = did ?? getMyDid();
  const records = await listAllRecordsViaPds<ThreadRecord>(repo, NSID_THREAD, {
    reverse: true,
  });
  return records.map((r) => {
    const { rkey } = parseAtUri(r.uri);
    return { ...r.value, uri: r.uri, cid: r.cid, rkey };
  });
}

export async function getThread(
  did: string,
  rkey: string,
): Promise<ThreadWithMeta> {
  const res = await getRecordViaPds<ThreadRecord>(did, NSID_THREAD, rkey);
  return { ...res.value, uri: res.uri, cid: res.cid, rkey };
}

export async function updateThread(
  rkey: string,
  record: ThreadRecord,
  ogContext?: ThreadOgContext,
): Promise<ThreadWithMeta> {
  const agent = getAgent();
  const enriched = await withOgImage(record, ogContext);
  const res = await agent.com.atproto.repo.putRecord({
    repo: getMyDid(),
    collection: NSID_THREAD,
    rkey,
    record: enriched as unknown as Record<string, unknown>,
  });
  return { ...enriched, uri: res.data.uri, cid: res.data.cid, rkey };
}

export async function deleteThread(rkey: string): Promise<void> {
  const agent = getAgent();
  const did = getMyDid();

  // repo 全体を走査する必要があるのでページングして全件取る。
  // 1 ページだけだと取りこぼした post が孤児レコードとして残る (#12)。
  const postRecords = await listAllRecordsViaPds<PostRecord>(did, NSID_POST);
  const threadUri = `at://${did}/${NSID_THREAD}/${rkey}`;
  const relatedPosts = postRecords.filter((r) => r.value.thread === threadUri);
  for (const post of relatedPosts) {
    const { rkey: postRkey } = parseAtUri(post.uri);
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: NSID_POST,
      rkey: postRkey,
    });
  }

  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: NSID_THREAD,
    rkey,
  });
}

export async function listPostsForThread(
  threadUri: string,
): Promise<PostWithMeta[]> {
  const { repo } = parseAtUri(threadUri);
  const records = await listAllRecordsViaPds<PostRecord>(repo, NSID_POST);
  return records
    .filter((r) => r.value.thread === threadUri)
    .map((r) => {
      const { rkey } = parseAtUri(r.uri);
      return { ...r.value, uri: r.uri, cid: r.cid, rkey };
    })
    .sort(
      (a, b) =>
        new Date(a.checkpointAt).getTime() -
        new Date(b.checkpointAt).getTime(),
    );
}
