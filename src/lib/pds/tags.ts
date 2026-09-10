// 個人のタグ辞書 (`net.shino3.trailcast.tagIndex`) の読み書き。
//
// このレコードはサジェスト専用の導出キャッシュで、正は各 post の `tags`。
// そのため書き込み失敗は投稿の失敗として扱わず (呼び出し側で握りつぶす)、
// 壊れていても `rebuildTagIndexFromPosts()` で作り直せる。
//
// rkey は `self` 固定 (lexicon の `key: literal:self`)。1 ユーザー 1 レコード。

import { getAgent, getMyDid, hasActiveSession } from "@/lib/atp-agent";
import {
  NSID_POST,
  NSID_TAG_INDEX,
  TAG_INDEX_RKEY,
  type PostRecord,
  type TagEntry,
  type TagIndexRecord,
} from "@/lib/types";
import { listRecordsViaPds } from "@/lib/pds/repo-read";
import {
  MAX_TAG_INDEX_ENTRIES,
  dedupeTags,
  normalizeTag,
  tagKey,
} from "@/lib/tags";

// 辞書はタグ入力欄を開くたびに読むため、DID をキーにしてセッション内で
// キャッシュする。アカウントを切り替えると DID が変わってキャッシュは自然に外れる。
let cachedDid: string | null = null;
let cachedEntries: TagEntry[] | null = null;
let inflight: Promise<TagEntry[]> | null = null;

/**
 * サジェスト用の辞書を返す。辞書レコードが無い場合だけ、自分の post から
 * 作り直して以後の呼び出しに備える (既存ユーザーの初回移行)。
 */
export async function loadTagDictionary(): Promise<TagEntry[]> {
  if (!hasActiveSession()) return [];
  const did = getMyDid();
  if (cachedDid === did && cachedEntries) return cachedEntries;
  if (inflight) return inflight;

  inflight = (async () => {
    let entries = await getTagIndex();
    if (entries.length === 0) entries = await rebuildTagIndexFromPosts();
    cachedDid = did;
    cachedEntries = entries;
    return entries;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * 自分のタグ辞書を取得する。未ログイン / 未作成 / 取得失敗はいずれも
 * 空配列として扱う (サジェストが出ないだけで機能は成立する)。
 */
export async function getTagIndex(): Promise<TagEntry[]> {
  if (!hasActiveSession()) return [];
  try {
    const agent = getAgent();
    const res = await agent.com.atproto.repo.getRecord({
      repo: getMyDid(),
      collection: NSID_TAG_INDEX,
      rkey: TAG_INDEX_RKEY,
    });
    const value = res.data.value as unknown as TagIndexRecord;
    return sanitizeEntries(value?.tags ?? []);
  } catch {
    // 未作成の場合は RecordNotFound で落ちる。辞書なしとして続行する。
    return [];
  }
}

/**
 * 投稿に付けられたタグを辞書へ反映する。
 * 既存タグは count を +1 して lastUsedAt を更新し、新規タグは追加する。
 *
 * `tags` は「1 投稿ぶんの重複除去済みタグ」を連ねたものを渡す。
 * 同じタグが複数回現れればその回数だけ加算されるので、複数投稿の
 * 一括インポートも 1 回の呼び出しで正しく数えられる。
 *
 * 呼び出し側から見て失敗しても害がないよう、例外は投げず false を返す。
 */
export async function recordTagUsage(tags: string[]): Promise<boolean> {
  const applied = tags
    .map(normalizeTag)
    .filter((t): t is string => t !== null);
  if (applied.length === 0) return true;
  if (!hasActiveSession()) return false;

  try {
    const current = await loadTagDictionary();
    const merged = mergeTagUsage(current, applied, new Date().toISOString());
    await putTagIndex(merged);
    cachedDid = getMyDid();
    cachedEntries = merged;
    return true;
  } catch (e) {
    console.error("Failed to update tag index:", e);
    return false;
  }
}

/**
 * 辞書へのタグ反映 (純粋な計算部分)。
 * 使用回数の多い順・同数なら最終使用が新しい順に並べ替えて保持する。
 */
export function mergeTagUsage(
  current: TagEntry[],
  applied: string[],
  now: string,
): TagEntry[] {
  const byKey = new Map<string, TagEntry>();
  for (const entry of current) {
    byKey.set(tagKey(entry.tag), { ...entry });
  }

  for (const tag of applied) {
    const key = tagKey(tag);
    const found = byKey.get(key);
    if (found) {
      found.count += 1;
      found.lastUsedAt = now;
    } else {
      byKey.set(key, { tag, count: 1, lastUsedAt: now });
    }
  }

  return sortEntries([...byKey.values()]).slice(0, MAX_TAG_INDEX_ENTRIES);
}

/**
 * 自分の post を走査して辞書を作り直す。
 * 辞書が無い / 古いユーザーのために、初回サジェスト時のフォールバックとして使う。
 */
export async function rebuildTagIndexFromPosts(): Promise<TagEntry[]> {
  if (!hasActiveSession()) return [];
  try {
    const did = getMyDid();
    const res = await listRecordsViaPds<PostRecord>(did, NSID_POST, {
      limit: 100,
      reverse: true,
    });

    const byKey = new Map<string, TagEntry>();
    for (const r of res.records) {
      const usedAt = r.value.createdAt ?? r.value.checkpointAt ?? "";
      for (const tag of dedupeTags(r.value.tags ?? [])) {
        const key = tagKey(tag);
        const found = byKey.get(key);
        if (found) {
          found.count += 1;
          if (usedAt > found.lastUsedAt) found.lastUsedAt = usedAt;
        } else {
          byKey.set(key, { tag, count: 1, lastUsedAt: usedAt });
        }
      }
    }

    const entries = sortEntries([...byKey.values()]).slice(
      0,
      MAX_TAG_INDEX_ENTRIES,
    );
    if (entries.length > 0) await putTagIndex(entries);
    return entries;
  } catch (e) {
    console.error("Failed to rebuild tag index:", e);
    return [];
  }
}

async function putTagIndex(tags: TagEntry[]): Promise<void> {
  const agent = getAgent();
  const record: TagIndexRecord = {
    tags,
    updatedAt: new Date().toISOString(),
  };
  await agent.com.atproto.repo.putRecord({
    repo: getMyDid(),
    collection: NSID_TAG_INDEX,
    rkey: TAG_INDEX_RKEY,
    record: record as unknown as Record<string, unknown>,
  });
}

/** 他クライアントが書いた壊れたエントリを落として型を保証する。 */
function sanitizeEntries(entries: unknown[]): TagEntry[] {
  const out: TagEntry[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Partial<TagEntry>;
    const tag = typeof e.tag === "string" ? normalizeTag(e.tag) : null;
    if (!tag) continue;
    out.push({
      tag,
      count: typeof e.count === "number" && e.count > 0 ? e.count : 1,
      lastUsedAt: typeof e.lastUsedAt === "string" ? e.lastUsedAt : "",
    });
  }
  return sortEntries(out);
}

function sortEntries(entries: TagEntry[]): TagEntry[] {
  // ISO 文字列の単純な大小比較で新しい順。localeCompare は環境差が出るため使わない。
  return entries.sort(
    (a, b) =>
      b.count - a.count ||
      (a.lastUsedAt < b.lastUsedAt ? 1 : a.lastUsedAt > b.lastUsedAt ? -1 : 0),
  );
}
