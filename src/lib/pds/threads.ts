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
import { getRecordViaPds, listRecordsViaPds } from "@/lib/pds/repo-read";

function generateTid(): string {
  const now = BigInt(Date.now()) * 1000n;
  const clockId = BigInt(Math.floor(Math.random() * 1024));
  const tid = (now << 10n) | clockId;
  return tid.toString(32).padStart(13, "0");
}

export async function createThread(
  record: ThreadRecord,
): Promise<ThreadWithMeta> {
  const agent = getAgent();
  const rkey = generateTid();
  const res = await agent.com.atproto.repo.putRecord({
    repo: getMyDid(),
    collection: NSID_THREAD,
    rkey,
    record: record as unknown as Record<string, unknown>,
  });
  return {
    ...record,
    uri: res.data.uri,
    cid: res.data.cid,
    rkey,
  };
}

export async function listThreads(
  did?: string,
): Promise<ThreadWithMeta[]> {
  const repo = did ?? getMyDid();
  const res = await listRecordsViaPds<ThreadRecord>(repo, NSID_THREAD, {
    limit: 100,
    reverse: true,
  });
  return res.records.map((r) => {
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
): Promise<ThreadWithMeta> {
  const agent = getAgent();
  const res = await agent.com.atproto.repo.putRecord({
    repo: getMyDid(),
    collection: NSID_THREAD,
    rkey,
    record: record as unknown as Record<string, unknown>,
  });
  return { ...record, uri: res.data.uri, cid: res.data.cid, rkey };
}

export async function deleteThread(rkey: string): Promise<void> {
  const agent = getAgent();
  const did = getMyDid();

  const postsRes = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: NSID_POST,
    limit: 100,
  });
  const threadUri = `at://${did}/${NSID_THREAD}/${rkey}`;
  const relatedPosts = postsRes.data.records.filter(
    (r) => (r.value as unknown as { thread: string }).thread === threadUri,
  );
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
  const res = await listRecordsViaPds<PostRecord>(repo, NSID_POST, {
    limit: 100,
  });
  return res.records
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
