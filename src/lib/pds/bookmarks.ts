import { getAgent, getMyDid } from "@/lib/atp-agent";
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
    repo: getMyDid(),
    collection: NSID_BOOKMARK,
    rkey,
    record: record as unknown as Record<string, unknown>,
  });
  return { ...record, uri: res.data.uri, cid: res.data.cid, rkey };
}

export async function listBookmarks(): Promise<BookmarkWithMeta[]> {
  const agent = getAgent();
  const res = await agent.com.atproto.repo.listRecords({
    repo: getMyDid(),
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
    repo: getMyDid(),
    collection: NSID_BOOKMARK,
    rkey,
  });
}

/**
 * 自分の bookmark 一覧から、指定 subject (= thread at-uri) を持つ
 * ブックマーク 1 件を探して返す。未登録なら null。
 * 作成済みかどうかの判定とトグル (削除) のために rkey が必要。
 */
export async function findBookmarkBySubject(
  subject: string,
): Promise<BookmarkWithMeta | null> {
  const bms = await listBookmarks();
  return bms.find((b) => b.subject === subject) ?? null;
}
