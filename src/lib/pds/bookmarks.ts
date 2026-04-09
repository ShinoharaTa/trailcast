import { getAgent } from "@/lib/atp-agent";
import {
  NSID_BOOKMARK,
  type BookmarkRecord,
  type BookmarkWithMeta,
  parseAtUri,
} from "@/lib/types";

function generateTid(): string {
  const now = BigInt(Date.now()) * 1000n;
  const clockId = BigInt(Math.floor(Math.random() * 1024));
  const tid = (now << 10n) | clockId;
  return tid.toString(32).padStart(13, "0");
}

export async function createBookmark(
  subject: string,
): Promise<BookmarkWithMeta> {
  const agent = getAgent();
  const rkey = generateTid();
  const record: BookmarkRecord = {
    subject,
    createdAt: new Date().toISOString(),
  };
  const res = await agent.com.atproto.repo.putRecord({
    repo: agent.session!.did,
    collection: NSID_BOOKMARK,
    rkey,
    record: record as unknown as Record<string, unknown>,
  });
  return { ...record, uri: res.data.uri, cid: res.data.cid, rkey };
}

export async function listBookmarks(): Promise<BookmarkWithMeta[]> {
  const agent = getAgent();
  const res = await agent.com.atproto.repo.listRecords({
    repo: agent.session!.did,
    collection: NSID_BOOKMARK,
    limit: 100,
    reverse: true,
  });
  return res.data.records.map((r) => {
    const val = r.value as unknown as BookmarkRecord;
    const { rkey } = parseAtUri(r.uri);
    return { ...val, uri: r.uri, cid: r.cid, rkey };
  });
}

export async function deleteBookmark(rkey: string): Promise<void> {
  const agent = getAgent();
  await agent.com.atproto.repo.deleteRecord({
    repo: agent.session!.did,
    collection: NSID_BOOKMARK,
    rkey,
  });
}
