// OG 画像のバックフィル (一括生成) ロジック。
//
// `home-screen` (ダッシュボード) を開いたときに、自分のスレッドのうち
// `ogImage` BlobRef が未設定のものを検出し、ユーザーの同意を得てから
// 順次 OG 画像を生成・PDS にアップロード・スレッドレコードを更新する。
//
// 個別生成は `updateThread(rkey, record)` (= `withOgImage` 経由) に任せる。

import { updateThread } from "@/lib/pds/threads";
import type { ThreadRecord, ThreadWithMeta } from "@/lib/types";

/** localStorage キー: 「もう表示しない」状態を保存 */
const DISMISS_FOREVER_KEY = "trailcast_og_backfill_dismissed_forever";

/** 一度の dashboard セッション中に「あとで」を選んだことを覚えるためのモジュールローカル変数 */
let dismissedThisSession = false;

export interface ThreadBackfillTarget {
  rkey: string;
  uri: string;
  title: string;
  hasCover: boolean;
}

/**
 * `ogImage` が未設定のスレッドを抽出する。
 * `BlobRef` の中身は柔軟だが、ここでは「フィールド自体が無い / null」を未設定とみなす。
 */
export function findThreadsWithoutOgImage(
  threads: ThreadWithMeta[],
): ThreadBackfillTarget[] {
  return threads
    .filter((t) => !t.ogImage)
    .map((t) => ({
      rkey: t.rkey,
      uri: t.uri,
      title: t.title,
      hasCover: Boolean(t.coverImage),
    }));
}

/**
 * 「もう表示しない」が永続的に設定されているかどうか。
 */
export function isBackfillDismissedForever(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_FOREVER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBackfillDismissedForever(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_FOREVER_KEY, "1");
  } catch {
    // 失敗しても運用上問題ないので握りつぶす
  }
}

/**
 * 同一セッション内で「あとで」が選ばれたか。タブを閉じるまで再表示しない。
 */
export function isBackfillDismissedThisSession(): boolean {
  return dismissedThisSession;
}

export function setBackfillDismissedThisSession(): void {
  dismissedThisSession = true;
}

/**
 * 既存スレッドを 1 件取り上げて OG 画像を生成 + 更新する。
 * 失敗時は throw。呼び出し側で catch して continue させる想定。
 */
export async function backfillOneThread(
  thread: ThreadWithMeta,
): Promise<ThreadWithMeta> {
  // ThreadRecord 部分だけを putRecord に渡す。`uri/cid/rkey` は record schema 外。
  const record: ThreadRecord = {
    title: thread.title,
    description: thread.description,
    visibility: thread.visibility,
    coverImage: thread.coverImage,
    ogImage: thread.ogImage,
    createdAt: thread.createdAt,
    sortOrder: thread.sortOrder,
  };
  // coverBlob は持っていないが、record.coverImage があれば withOgImage 内で
  // PDS から URL を組み立てて使ってくれる。
  return updateThread(thread.rkey, record);
}

export interface BackfillProgress {
  /** 全体の対象数 */
  total: number;
  /** 完了数 (成功 + 失敗どちらも含む) */
  done: number;
  /** 成功数 */
  succeeded: number;
  /** 失敗数 */
  failed: number;
  /** 直近に処理したスレッドのタイトル (UI 表示用) */
  currentTitle?: string;
}

/**
 * 対象スレッド配列を順次バックフィルする。
 * 各処理ごとに `onProgress` を呼び出して UI を更新できるようにする。
 * 中断シグナルがあれば、現在処理中のものを終えて停止する。
 */
export async function backfillThreads(
  targets: ThreadWithMeta[],
  opts: {
    onProgress?: (p: BackfillProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<BackfillProgress> {
  const progress: BackfillProgress = {
    total: targets.length,
    done: 0,
    succeeded: 0,
    failed: 0,
  };
  opts.onProgress?.(progress);

  for (const t of targets) {
    if (opts.signal?.aborted) break;
    progress.currentTitle = t.title;
    opts.onProgress?.({ ...progress });
    try {
      await backfillOneThread(t);
      progress.succeeded += 1;
    } catch (e) {
      console.warn("[og-backfill] failed for", t.uri, e);
      progress.failed += 1;
    } finally {
      progress.done += 1;
      opts.onProgress?.({ ...progress });
    }
  }
  progress.currentTitle = undefined;
  opts.onProgress?.({ ...progress });
  return progress;
}
