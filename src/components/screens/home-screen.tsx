"use client";

import { useCallback, useEffect, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { getThreadDetailHref } from "@/lib/app-routes";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { ThreadWithMeta, BookmarkWithMeta, ThreadRecord } from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { listThreads } from "@/lib/pds/threads";
import { listBookmarks } from "@/lib/pds/bookmarks";
import { getAgent } from "@/lib/atp-agent";
import { MapIcon, PlusIcon } from "@/components/ui/icons";
import { BlobImage } from "@/components/ui/blob-image";

function isModifiedClick(e: React.MouseEvent): boolean {
  return (
    e.defaultPrevented ||
    e.button !== 0 ||
    e.metaKey ||
    e.ctrlKey ||
    e.shiftKey ||
    e.altKey
  );
}

export function HomeScreen({ navigate }: NavigationProps) {
  const { handle, isAuthenticated, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"threads" | "bookmarks">("threads");
  const [threads, setThreads] = useState<ThreadWithMeta[]>([]);
  const [bookmarksData, setBookmarksData] = useState<
    (BookmarkWithMeta & { thread?: ThreadWithMeta })[]
  >([]);
  const [loading, setLoading] = useState(true);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listThreads();
      setThreads(result);
    } catch (e) {
      console.error("Failed to load threads:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBookmarks = useCallback(async () => {
    try {
      const bms = await listBookmarks();
      const enriched = await Promise.all(
        bms.map(async (bm) => {
          try {
            const { repo, rkey } = parseAtUri(bm.subject);
            const agent = getAgent();
            const res = await agent.com.atproto.repo.getRecord({
              repo,
              collection: "net.shino3.trailcast.thread",
              rkey,
            });
            const val = res.data.value as unknown as ThreadRecord;
            return {
              ...bm,
              thread: {
                ...val,
                uri: res.data.uri,
                cid: res.data.cid!,
                rkey,
              } as ThreadWithMeta,
            };
          } catch {
            return bm;
          }
        }),
      );
      setBookmarksData(enriched);
    } catch (e) {
      console.error("Failed to load bookmarks:", e);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      setThreads([]);
      setBookmarksData([]);
      return;
    }
    loadThreads();
    loadBookmarks();
  }, [isAuthenticated, loadThreads, loadBookmarks]);

  // 未認証: 自分のコンテンツが無いので、ログイン誘導のランディングを表示
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
          <MapIcon className="size-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Trailcast
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-white/50">
          旅の記録を、ダイナミックに残す。
          <br />
          共有されたスレッドは URL から誰でも閲覧できます。
          投稿や編集を行うにはログインしてください。
        </p>
        <button
          onClick={() => navigate("login")}
          className="mt-8 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"
        >
          ログインして始める
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Chronicle</h2>
          <p className="mt-1 text-sm text-white/40">
            {handle ? `@${handle}` : "あなたの旅の記録"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={logout}
            className="rounded-lg px-3 py-2 text-xs font-medium text-white/40 transition hover:bg-white/5 hover:text-white/70"
          >
            ログアウト
          </button>
          <button
            onClick={() => navigate("thread-create")}
            className="flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
          >
            <PlusIcon className="size-4" />
            新しいスレッド
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-1 rounded-xl bg-white/5 p-1">
        <button
          onClick={() => setActiveTab("threads")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm transition ${
            activeTab === "threads"
              ? "bg-white/10 font-semibold text-white shadow-sm"
              : "font-medium text-white/40 hover:text-white/70"
          }`}
        >
          スレッド
        </button>
        <button
          onClick={() => setActiveTab("bookmarks")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm transition ${
            activeTab === "bookmarks"
              ? "bg-white/10 font-semibold text-white shadow-sm"
              : "font-medium text-white/40 hover:text-white/70"
          }`}
        >
          ブックマーク
        </button>
      </div>

      {loading && activeTab === "threads" && (
        <div className="flex justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {!loading && activeTab === "threads" && threads.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="text-lg font-medium text-white/30">まだスレッドがありません</p>
          <p className="mt-2 text-sm text-white/20">
            「新しいスレッド」から旅の記録を始めましょう
          </p>
        </div>
      )}

      {activeTab === "threads" && threads.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {threads.map((t) => {
            const threadDid = parseAtUri(t.uri).repo;
            const href = getThreadDetailHref(t.uri);
            return (
              <a
                key={t.uri}
                href={href}
                onClick={(e) => {
                  if (isModifiedClick(e)) return;
                  e.preventDefault();
                  navigate("thread-detail", { threadUri: t.uri });
                }}
                className="group relative block cursor-pointer overflow-hidden rounded-2xl bg-surface-800 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
              >
                <div className="aspect-[16/9] overflow-hidden bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
                  <BlobImage
                    did={threadDid}
                    blobRef={t.coverImage}
                    alt={t.title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    fallback={
                      <div className="flex h-full items-center justify-center">
                        <span className="text-4xl font-bold text-white/10">
                          {t.title.charAt(0)}
                        </span>
                      </div>
                    }
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/40 to-transparent" />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        t.visibility === "public"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-white/10 text-white/50"
                      }`}
                    >
                      {t.visibility === "public" ? "Public" : "Private"}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{t.title}</h3>
                  {t.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-white/50">
                      {t.description}
                    </p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}

      {activeTab === "bookmarks" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {bookmarksData.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <p className="text-lg font-medium text-white/30">ブックマークはまだありません</p>
            </div>
          )}
          {bookmarksData.map((bm) =>
            bm.thread ? (
              <a
                key={bm.uri}
                href={getThreadDetailHref(bm.thread.uri)}
                onClick={(e) => {
                  if (isModifiedClick(e)) return;
                  e.preventDefault();
                  navigate("thread-detail", { threadUri: bm.thread!.uri });
                }}
                className="group flex cursor-pointer gap-4 rounded-2xl bg-surface-800 p-4 transition hover:bg-surface-700"
              >
                <div className="size-20 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-white">
                    {bm.thread.title}
                  </h3>
                  {bm.thread.description && (
                    <p className="mt-1 text-sm text-white/40">
                      {bm.thread.description}
                    </p>
                  )}
                </div>
              </a>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
