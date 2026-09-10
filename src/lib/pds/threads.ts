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
import { listIndexedPostRefs } from "@/lib/index-api";
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

/**
 * 1 スレッドの表示で走査する repo の上限 (所有者を含む)。
 *
 * Public スレッドには誰でも投稿できるため、参加者が際限なく増えると閲覧側の
 * リクエストがその数だけ増える。インデックス上の投稿数が多い順に採用して
 * 打ち切る。ここに引っかかるほど参加者が増えたら、repo 走査ではなく
 * インデックスを一覧として信用する方式に切り替える必要がある。
 */
const MAX_PARTICIPANT_REPOS = 25;

/**
 * 共有インデックスから、このスレッドに投稿している DID を投稿数の多い順に返す。
 *
 * インデックスを「投稿一覧」ではなく **参加者の発見** にだけ使うのが要点。
 * 一覧そのものを信用すると (a) インデックスの取りこぼしがそのまま表示の欠落に
 * なり、(b) 投稿 1 件ずつ getRecord する羽目になる。DID さえ分かれば、あとは
 * 各 repo を従来どおり listRecords でまとめて読める。
 */
async function discoverParticipantDids(
  threadUri: string,
  ownerDid: string,
): Promise<string[]> {
  const refs = await listIndexedPostRefs(threadUri);
  // インデックスが空 / 到達不能なら所有者だけ = 従来の挙動。
  // Private スレッドはインデックス対象外なので常にこの経路になる。
  if (!refs || refs.length === 0) return [];

  const countByDid = new Map<string, number>();
  for (const r of refs) {
    if (r.author_did === ownerDid) continue;
    countByDid.set(r.author_did, (countByDid.get(r.author_did) ?? 0) + 1);
  }

  const sorted = [...countByDid.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([did]) => did);

  // 所有者の分を 1 枠使う
  const limit = MAX_PARTICIPANT_REPOS - 1;
  if (sorted.length > limit) {
    console.warn(
      `listPostsForThread: 参加者が ${sorted.length} 人いるため上位 ${limit} 人に絞ります`,
    );
    return sorted.slice(0, limit);
  }
  return sorted;
}

/**
 * スレッドに紐づく投稿を checkpointAt 昇順で返す。
 *
 * Public スレッドでは投稿が参加者それぞれの repo に分散するため、共有
 * インデックスで参加者の DID を割り出し、各 repo を読んでマージする。
 * インデックスが使えないときは所有者の repo だけを読む従来動作に戻る。
 */
export async function listPostsForThread(
  threadUri: string,
): Promise<PostWithMeta[]> {
  const { repo: ownerDid } = parseAtUri(threadUri);
  const participantDids = await discoverParticipantDids(threadUri, ownerDid);

  // 所有者の repo は失敗をそのまま投げる (従来どおりエラー表示にしたい)。
  // 他の参加者は 1 人の PDS が落ちていても残りを表示したいので握りつぶす。
  const [ownerRecords, ...participantRecords] = await Promise.all([
    listAllRecordsViaPds<PostRecord>(ownerDid, NSID_POST),
    ...participantDids.map((did) =>
      listAllRecordsViaPds<PostRecord>(did, NSID_POST).catch((e) => {
        console.warn("listPostsForThread: repo を読めませんでした", did, e);
        return [];
      }),
    ),
  ]);

  return [ownerRecords, ...participantRecords]
    .flat()
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
