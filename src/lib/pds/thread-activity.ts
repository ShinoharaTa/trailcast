import { getAgent, getMyDid } from "@/lib/atp-agent";
import { getRecordViaPds } from "@/lib/pds/repo-read";
import { NSID_THREAD, parseAtUri, type ThreadRecord } from "@/lib/types";

/**
 * チェックポイントの作成・編集・削除のあとに、スレッドの updatedAt を now にして
 * 書き戻す。ダッシュボード / プロフィールの一覧を最終活動順に並べるため。
 *
 * - 自分のスレッドのときだけ。参加者は所有者の record を書けないので、Public
 *   スレッドに他人が投稿しても所有者側の並びは変わらない (仕様上の制約)。
 * - 投稿の成否には影響させたくないので、失敗は握りつぶして console に出すだけ。
 * - threads.ts を経由しない (posts.ts → threads.ts → og-image.ts → posts.ts の
 *   循環を避ける)。OG 画像も再生成しない。
 */
export async function touchThread(threadUri: string): Promise<void> {
  const { repo, collection, rkey } = parseAtUri(threadUri);
  if (collection !== NSID_THREAD) return;

  let myDid: string;
  try {
    myDid = getMyDid();
  } catch {
    return;
  }
  if (repo !== myDid) return;

  try {
    const current = await getRecordViaPds<ThreadRecord>(repo, NSID_THREAD, rkey);
    const record: ThreadRecord = {
      ...current.value,
      updatedAt: new Date().toISOString(),
    };
    await getAgent().com.atproto.repo.putRecord({
      repo,
      collection: NSID_THREAD,
      rkey,
      record: record as unknown as Record<string, unknown>,
    });
  } catch (e) {
    console.warn("touchThread failed", threadUri, e);
  }
}
