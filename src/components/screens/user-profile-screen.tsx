"use client";

import { useCallback, useEffect, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { getThreadDetailHref } from "@/lib/app-routes";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { ThreadWithMeta } from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { listThreads } from "@/lib/pds/threads";
import {
  getProfile,
  resolveIdentifier,
  type ProfileView,
} from "@/lib/pds/identity";
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

export function UserProfileScreen({ navigate, params }: NavigationProps) {
  const identifier = params.userIdentifier ?? "";
  const viewerDid = useAuthStore((s) => s.did);

  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [resolvedDid, setResolvedDid] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!identifier) return;
    setLoading(true);
    setError(null);
    try {
      const did = await resolveIdentifier(identifier);
      setResolvedDid(did);

      // profile と threads は並列取得。
      // profile は失敗しても threads は出したいので catch してログのみ。
      const [profileRes, threadsRes] = await Promise.allSettled([
        getProfile(did),
        listThreads(did),
      ]);

      if (profileRes.status === "fulfilled") {
        setProfile(profileRes.value);
      } else {
        console.warn("getProfile failed", profileRes.reason);
        setProfile(null);
      }

      if (threadsRes.status === "fulfilled") {
        setThreads(threadsRes.value);
      } else {
        throw threadsRes.reason;
      }
    } catch (e) {
      console.error("UserProfileScreen load failed", e);
      setError(
        e instanceof Error ? e.message : "ユーザー情報の取得に失敗しました",
      );
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = viewerDid !== null && viewerDid === resolvedDid;
  const visibleThreads = isOwner
    ? threads
    : threads.filter((t) => t.visibility === "public");

  if (!identifier) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center text-white/50">
        ユーザー識別子が指定されていません。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* プロフィールヘッダ */}
      <header className="mb-10">
        {profile?.banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.banner}
            alt=""
            className="mb-6 h-40 w-full rounded-2xl object-cover"
          />
        )}

        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="size-20 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/30 ring-2 ring-white/10">
            {profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-2xl font-bold text-white/30">
                {(profile?.handle ?? identifier).charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {loading && !profile ? (
              <div className="h-8 w-48 animate-pulse rounded bg-white/5" />
            ) : (
              <>
                <h2 className="truncate text-2xl font-bold tracking-tight text-white">
                  {profile?.displayName || profile?.handle || identifier}
                </h2>
                <p className="truncate text-sm text-white/40">
                  @{profile?.handle ?? identifier}
                </p>
              </>
            )}
            {profile?.description && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-white/60">
                {profile.description}
              </p>
            )}
          </div>

          {isOwner && (
            <span className="shrink-0 rounded-full bg-indigo-500/15 px-3 py-1 text-[11px] font-semibold text-indigo-300">
              あなた
            </span>
          )}
        </div>
      </header>

      {/* スレッド一覧 */}
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          スレッド {!loading && `(${visibleThreads.length})`}
        </h3>
        {isOwner && threads.length !== visibleThreads.length && (
          <span className="text-xs text-white/30">
            非公開 {threads.length - visibleThreads.length} 件を含む
          </span>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !error && visibleThreads.length === 0 && (
        <div className="flex flex-col items-center py-20 text-center">
          <p className="text-lg font-medium text-white/30">
            公開中のスレッドはまだありません
          </p>
        </div>
      )}

      {!loading && !error && visibleThreads.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleThreads.map((t) => {
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
                className="group relative block cursor-pointer overflow-hidden rounded-2xl bg-surface-800 shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl"
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
    </div>
  );
}
