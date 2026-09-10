"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  getIndexStatus,
  isWriteThroughEnabled,
  setWriteThroughEnabled,
  syncIndex,
  type IndexStatus,
  type SyncProgress,
} from "@/lib/index-api";
import { HomeLink } from "@/components/ui/home-link";
import { RefreshIcon } from "@/components/ui/icons";

function formatDateTime(iso: string | null): string {
  if (!iso) return "未同期";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未同期";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SettingsScreen({ navigate }: NavigationProps) {
  const did = useAuthStore((s) => s.did);
  const handle = useAuthStore((s) => s.handle);

  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  /** API 自体に到達できない (D1 未設定 / next dev で Functions が無い) */
  const [apiUnavailable, setApiUnavailable] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncDone, setSyncDone] = useState<SyncProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [writeThrough, setWriteThrough] = useState(true);

  useEffect(() => {
    setWriteThrough(isWriteThroughEnabled());
  }, []);

  const loadStatus = useCallback(async () => {
    if (!did) return;
    setStatusLoading(true);
    const s = await getIndexStatus(did);
    setStatus(s);
    setApiUnavailable(s === null);
    setStatusLoading(false);
  }, [did]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // 画面を離れたら進行中の同期を止める
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSync = useCallback(async () => {
    if (!did || syncing) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSyncing(true);
    setSyncError(null);
    setSyncDone(null);
    setProgress({ scanned: 0, indexed: 0, skipped: 0 });
    try {
      const result = await syncIndex(did, setProgress, controller.signal);
      setSyncDone(result);
      await loadStatus();
    } catch (e) {
      if (controller.signal.aborted) return;
      setSyncError(e instanceof Error ? e.message : "同期に失敗しました");
    } finally {
      setSyncing(false);
      abortRef.current = null;
    }
  }, [did, syncing, loadStatus]);

  const handleToggleWriteThrough = useCallback((next: boolean) => {
    setWriteThrough(next);
    setWriteThroughEnabled(next);
  }, []);

  if (!did) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-white/50">
        設定を開くにはログインしてください。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <HomeLink navigate={navigate} className="-ml-2" />
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-bold text-white">設定</h1>
        <p className="mt-1 text-sm text-white/50">
          {handle ?? did}
        </p>
      </header>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          共有インデックス
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Public スレッドは参加者それぞれの PDS に投稿が分散します。誰の投稿も
          時系列に並べて表示できるよう、投稿の所在（リンクのみ）を共有
          インデックスに登録します。
          <span className="mt-2 block text-white/40">
            本文・写真・位置情報は登録されません。データの正本はいつでも
            あなたの PDS です。インデックスを消しても、同期し直せば復元できます。
          </span>
        </p>

        {apiUnavailable ? (
          <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            インデックス API に接続できませんでした。
            <span className="mt-1 block text-amber-200/70">
              サーバ側が未設定か、ローカルの `next dev` で Pages Functions が
              動いていない可能性があります。
            </span>
          </p>
        ) : (
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-white/[0.03] p-3">
              <dt className="text-xs text-white/40">登録済みの投稿</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-white">
                {statusLoading ? "…" : `${status?.postCount ?? 0} 件`}
              </dd>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <dt className="text-xs text-white/40">最終同期</dt>
              <dd className="mt-1 text-sm font-medium text-white/80">
                {statusLoading ? "…" : formatDateTime(status?.lastSyncedAt ?? null)}
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-5">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || apiUnavailable}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshIcon
              className={`size-4 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "同期中..." : "今すぐ同期"}
          </button>

          {syncing && progress && (
            <p className="mt-3 text-sm tabular-nums text-white/60">
              {progress.scanned} 件を確認 / {progress.indexed} 件を登録
              {progress.skipped > 0 && ` / ${progress.skipped} 件は対象外`}
            </p>
          )}

          {!syncing && syncDone && (
            <p className="mt-3 text-sm text-emerald-300">
              同期しました（{syncDone.scanned} 件を確認、
              {syncDone.indexed} 件を登録
              {syncDone.skipped > 0 && `、${syncDone.skipped} 件は対象外`}）
            </p>
          )}

          {syncError && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {syncError}
            </p>
          )}

          <p className="mt-3 text-xs leading-relaxed text-white/35">
            自分の投稿をすべて読み直してインデックスを作り直します。PDS 上で
            削除した投稿や、Private に変更したスレッドの投稿は、同期を最後まで
            走らせた時点でインデックスからも取り除かれます。
          </p>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <label className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-white">
              投稿時に自動で登録する
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-white/40">
              投稿・編集・削除のたびにインデックスへ反映します。オフにしても、
              上の「今すぐ同期」でまとめて追いつけます。
            </span>
          </span>
          <input
            type="checkbox"
            checked={writeThrough}
            onChange={(e) => handleToggleWriteThrough(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-indigo-500"
          />
        </label>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-white/30">
        インデックスから投稿を消したいときは、その投稿またはスレッドを削除するか、
        スレッドを Private に変更してから同期してください。インデックスは常に
        PDS の内容に従います。
      </p>
    </div>
  );
}
