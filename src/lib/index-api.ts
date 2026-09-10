/**
 * Public スレッドの投稿集約インデックス (#14) を叩くクライアント。
 *
 * 正本はあくまで各ユーザーの PDS で、ここは検索性のための導出キャッシュ。
 * したがって **このモジュールの失敗は常に握りつぶし、投稿や表示を止めない**。
 * D1 が落ちていても、インデックス未構築でも、アプリは PDS 直読みで動き続ける。
 *
 * API 本体は Cloudflare Pages Functions (`functions/api/index/*`) にある。
 * `next dev` (:3000) では動かないので、ローカルで通しで試すときは
 * `npm run preview` (:8788) を使うか、`NEXT_PUBLIC_INDEX_API_BASE` を指定する。
 *
 *   NEXT_PUBLIC_INDEX_API_BASE=http://127.0.0.1:8788 npm run dev
 */

const API_BASE = (process.env.NEXT_PUBLIC_INDEX_API_BASE ?? "").replace(
  /\/+$/,
  "",
);

const WRITE_THROUGH_KEY = "trailcast:index:write-through";

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * 投稿直後にインデックスへ通知するか (方式 A)。既定は有効。
 * 切っていても設定画面の手動同期 (方式 C) で追いつける。
 */
export function isWriteThroughEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(WRITE_THROUGH_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setWriteThroughEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(WRITE_THROUGH_KEY, enabled ? "1" : "0");
  } catch {
    // プライベートモード等で書けなくても既定 (有効) で動くだけなので無視
  }
}

/**
 * post 1 件をインデックスに反映する (作成・更新・削除すべてこれ 1 本)。
 *
 * 渡すのは at-uri だけで、実在するか / どのスレッドか / Public かは
 * サーバが PDS に問い合わせて判定する。PDS 上に無ければ行が消えるので、
 * 削除時もこれを呼べばよい。
 *
 * 失敗しても投げない。取りこぼしは設定画面の手動同期で回収する。
 */
export async function notifyPostIndexed(postUri: string): Promise<void> {
  if (!isWriteThroughEnabled()) return;
  try {
    await fetch(apiUrl("/api/index/post"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postUri }),
    });
  } catch (e) {
    console.warn("[index] write-through failed", postUri, e);
  }
}

export interface IndexStatus {
  did: string;
  lastSyncedAt: string | null;
  postCount: number;
  lastSyncedPostCount: number | null;
}

/** インデックス状態。API が無い / 落ちている場合は null。 */
export async function getIndexStatus(did: string): Promise<IndexStatus | null> {
  try {
    const res = await fetch(
      apiUrl(`/api/index/status?did=${encodeURIComponent(did)}`),
    );
    if (!res.ok) return null;
    return (await res.json()) as IndexStatus;
  } catch {
    return null;
  }
}

export interface SyncProgress {
  /** これまでに走査した post 件数 */
  scanned: number;
  /** インデックスに載せた件数 (Public スレッドのもの) */
  indexed: number;
  /** 対象外としてスキップした件数 (Private スレッド等) */
  skipped: number;
}

interface SyncPageResponse extends SyncProgress {
  done: boolean;
  cursor?: string;
  startedAt?: string;
  postCount?: number;
}

/**
 * 自分の repo を全走査してインデックスを作り直す (方式 C)。
 *
 * サーバは Worker の subrequest 上限を避けて 1 リクエスト = 1 ページ
 * (100 件) しか進めないので、cursor が返る限りここで呼び直す。
 * `onProgress` に累計を渡すので、そのまま進捗表示に使える。
 *
 * 世代管理のため 1 ページ目でサーバが発行した `startedAt` を echo する。
 * 途中で中断した場合はサーバ側の GC が走らないので、インデックスが
 * 欠けた状態にはならない (次に完走したときに整合する)。
 */
export async function syncIndex(
  did: string,
  onProgress?: (p: SyncProgress) => void,
  signal?: AbortSignal,
): Promise<SyncProgress> {
  const total: SyncProgress = { scanned: 0, indexed: 0, skipped: 0 };
  let cursor: string | undefined;
  let startedAt: string | undefined;

  // 5000 件で打ち切る安全弁 (listAllRecordsViaPds と同じ考え方)
  for (let page = 0; page < 50; page++) {
    const res = await fetch(apiUrl("/api/index/sync"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ did, cursor, startedAt }),
      signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? `同期に失敗しました (${res.status})`);
    }
    const data = (await res.json()) as SyncPageResponse;

    total.scanned += data.scanned;
    total.indexed += data.indexed;
    total.skipped += data.skipped;
    onProgress?.({ ...total });

    if (data.done) return total;
    cursor = data.cursor;
    startedAt = data.startedAt;
    if (!cursor) return total;
  }

  return total;
}

export interface IndexedPostRef {
  post_uri: string;
  author_did: string;
  cid: string;
  checkpoint_at: string;
}

/**
 * スレッドに紐づく post の at-uri を checkpoint_at 昇順で全件返す。
 * インデックスが無い / API が落ちている場合は null (呼び出し側は
 * PDS 直読みにフォールバックする)。
 */
export async function listIndexedPostRefs(
  threadUri: string,
): Promise<IndexedPostRef[] | null> {
  const all: IndexedPostRef[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < 50; page++) {
      const url = new URL(
        apiUrl("/api/index/thread"),
        typeof location !== "undefined" ? location.origin : undefined,
      );
      url.searchParams.set("uri", threadUri);
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString());
      if (!res.ok) return null;
      const data = (await res.json()) as {
        posts: IndexedPostRef[];
        cursor?: string;
      };
      all.push(...data.posts);
      if (!data.cursor) return all;
      cursor = data.cursor;
    }
    return all;
  } catch {
    return null;
  }
}
