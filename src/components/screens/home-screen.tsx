"use client";

import { useCallback, useEffect, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { getThreadDetailHref, getUserProfileHref } from "@/lib/app-routes";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { ThreadWithMeta, BookmarkWithMeta } from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { listThreads, getThread } from "@/lib/pds/threads";
import { listBookmarks } from "@/lib/pds/bookmarks";
import { PlusIcon } from "@/components/ui/icons";
import { BlobImage } from "@/components/ui/blob-image";
import { LandingScreen } from "@/components/screens/landing-screen";
import { getProfile, type ProfileView } from "@/lib/pds/identity";

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

/**
 * ブックマーク一覧のカード。カバー画像をカード全体に広げ、
 * グラデーションの上にタイトル / 説明 / 投稿者 @handle を重ねる。
 */
function BookmarkCard({
  thread,
  onOpen,
}: {
  thread: ThreadWithMeta;
  onOpen: () => void;
}) {
  const threadDid = parseAtUri(thread.uri).repo;
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProfile(threadDid)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        // 取得失敗時は静かにフォールバック (表示なし)
      });
    return () => {
      cancelled = true;
    };
  }, [threadDid]);

  return (
    <a
      href={getThreadDetailHref(thread.uri)}
      onClick={(e) => {
        if (isModifiedClick(e)) return;
        e.preventDefault();
        onOpen();
      }}
      className="group relative block cursor-pointer overflow-hidden rounded-2xl bg-surface-800 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
    >
      <div className="aspect-[16/9] overflow-hidden bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
        <BlobImage
          did={threadDid}
          blobRef={thread.coverImage}
          alt={thread.title}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          loading="lazy"
          fallback={
            <div className="flex h-full items-center justify-center">
              <span className="text-4xl font-bold text-white/10">
                {thread.title.charAt(0)}
              </span>
            </div>
          }
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/60 via-40% to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-5">
        <h3 className="line-clamp-1 text-lg font-bold text-white">
          {thread.title}
        </h3>
        {thread.description && (
          <p className="mt-1 line-clamp-2 text-sm text-white/60">
            {thread.description}
          </p>
        )}
        {profile?.handle && (
          <p className="mt-2 truncate text-xs text-white/50">
            @{profile.handle}
          </p>
        )}
      </div>
    </a>
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
            const thread = await getThread(repo, rkey);
            return { ...bm, thread };
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

  // 未認証: ランディング (ログインフォーム埋め込み)
  if (!isAuthenticated) {
    return <LandingScreen />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
          {handle ? (
            <a
              href={getUserProfileHref(handle)}
              onClick={(e) => {
                if (isModifiedClick(e)) return;
                e.preventDefault();
                navigate("user-profile", { userIdentifier: handle });
              }}
              className="mt-1 inline-block text-sm text-white/40 transition hover:text-white/70"
            >
              @{handle}
            </a>
          ) : (
            <p className="mt-1 text-sm text-white/40">あなたのチェックポイント</p>
          )}
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
            「新しいスレッド」から記録を始めましょう
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
              <BookmarkCard
                key={bm.uri}
                thread={bm.thread}
                onOpen={() =>
                  navigate("thread-detail", { threadUri: bm.thread!.uri })
                }
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
