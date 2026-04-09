"use client";

import { useCallback, useEffect, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import type {
  ThreadWithMeta,
  PostWithMeta,
} from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { getThread, deleteThread, listPostsForThread } from "@/lib/pds/threads";
import { deletePost, refreshFromSource } from "@/lib/pds/posts";
import { useAuthStore } from "@/lib/stores/auth-store";
import { PinIcon, EditIcon, TrashIcon, RefreshIcon, LinkIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function blobUrl(uri: string, blobRef: unknown): string | null {
  if (!blobRef || typeof blobRef !== "object") return null;
  const ref = (blobRef as { ref?: { $link?: string } }).ref?.$link;
  if (!ref) return null;
  const did = parseAtUri(uri).repo;
  return `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${ref}`;
}

function resolveImageUrls(post: PostWithMeta): string[] {
  if (post.imageUrls && post.imageUrls.length > 0) {
    return post.imageUrls;
  }
  if (post.images && post.images.length > 0) {
    return post.images
      .map((img) => blobUrl(post.uri, img))
      .filter(Boolean) as string[];
  }
  return [];
}

function PostImages({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return (
      <div className="overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[0]} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`grid gap-1.5 overflow-hidden rounded-2xl ${urls.length <= 2 ? "grid-cols-2" : "grid-cols-2"}`}>
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={url} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
      ))}
    </div>
  );
}

function formatTime(dt: string): string {
  try {
    const d = new Date(dt);
    return d.toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

export function ThreadDetailScreen({ navigate, goBack, params }: NavigationProps) {
  const { did: myDid } = useAuthStore();
  const [thread, setThread] = useState<ThreadWithMeta | null>(null);
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [refreshingUri, setRefreshingUri] = useState<string | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<
    | { type: "thread" }
    | { type: "post"; post: PostWithMeta }
    | null
  >(null);

  const threadUri = params.threadUri ?? "";

  const load = useCallback(async () => {
    if (!threadUri) return;
    setLoading(true);
    try {
      const { repo, rkey } = parseAtUri(threadUri);
      const [t, p] = await Promise.all([
        getThread(repo, rkey),
        listPostsForThread(threadUri),
      ]);
      setThread(t);
      setPosts(p);
    } catch (e) {
      console.error("Failed to load thread:", e);
    } finally {
      setLoading(false);
    }
  }, [threadUri]);

  useEffect(() => {
    load();
  }, [load]);

  const executeDeleteThread = async () => {
    if (!thread) return;
    setConfirmTarget(null);
    setDeleting(true);
    try {
      await deleteThread(thread.rkey);
      navigate("home");
    } catch (e) {
      console.error("Failed to delete thread:", e);
      setDeleting(false);
    }
  };

  const executeDeletePost = async (post: PostWithMeta) => {
    setConfirmTarget(null);
    try {
      await deletePost(post.rkey);
      setPosts((prev) => prev.filter((p) => p.uri !== post.uri));
    } catch (e) {
      console.error("Failed to delete post:", e);
    }
  };

  const handleRefreshFromSource = async (post: PostWithMeta) => {
    if (!post.sourceRef) return;
    setRefreshingUri(post.uri);
    try {
      const updated = await refreshFromSource(post);
      setPosts((prev) => prev.map((p) => (p.uri === post.uri ? updated : p)));
    } catch (e) {
      console.error("Failed to refresh from source:", e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`元投稿からの再読み込みに失敗しました\n\n${msg}`);
    } finally {
      setRefreshingUri(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-white/40">スレッドが見つかりません</p>
        <button onClick={goBack} className="text-sm text-indigo-400 hover:underline">戻る</button>
      </div>
    );
  }

  const isOwner = myDid === parseAtUri(thread.uri).repo;
  const coverUrl = blobUrl(thread.uri, thread.coverImage);

  return (
    <div>
      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmTarget?.type === "thread"}
        title="スレッドを削除"
        message="このスレッドを削除しますか？紐づくチェックポイントもすべて削除されます。"
        confirmLabel="削除する"
        destructive
        onConfirm={executeDeleteThread}
        onCancel={() => setConfirmTarget(null)}
      />
      <ConfirmDialog
        open={confirmTarget?.type === "post"}
        title="チェックポイントを削除"
        message="このチェックポイントを削除しますか？"
        confirmLabel="削除する"
        destructive
        onConfirm={() => {
          if (confirmTarget?.type === "post") executeDeletePost(confirmTarget.post);
        }}
        onCancel={() => setConfirmTarget(null)}
      />

      {/* Hero */}
      <div className="relative h-[50vh] min-h-[320px] overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={thread.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-600/30 to-violet-600/30">
            <span className="text-8xl font-bold text-white/10">{thread.title.charAt(0)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/50 to-surface-950/20" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-5 pb-8">
          <button onClick={goBack} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-white/60 transition hover:text-white">
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            スレッド一覧
          </button>
          <div className="mb-3 flex items-center gap-2">
            <span className={`rounded-full px-3 py-0.5 text-[11px] font-bold backdrop-blur-sm ${thread.visibility === "public" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/60"}`}>
              {thread.visibility === "public" ? "Public" : "Private"}
            </span>
            <span className="text-xs text-white/40">{formatTime(thread.createdAt)}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{thread.title}</h1>
          {thread.description && (
            <p className="mt-3 max-w-xl text-base leading-relaxed text-white/60">{thread.description}</p>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky top-0 z-30 border-b border-white/5 bg-surface-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto px-5 py-3">
          <button onClick={() => navigate("share", params)} className="shrink-0 rounded-lg bg-white/5 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10">共有</button>
          <button onClick={() => navigate("bsky-crosspost", params)} className="shrink-0 rounded-lg bg-[#0085ff]/10 px-3.5 py-2 text-xs font-medium text-[#0085ff] transition hover:bg-[#0085ff]/20">Blueskyに投稿</button>
          <button onClick={() => navigate("bsky-import", params)} className="shrink-0 rounded-lg bg-white/5 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10">インポート</button>
          {isOwner && (
            <button
              onClick={() => setConfirmTarget({ type: "thread" })}
              disabled={deleting}
              className="ml-auto shrink-0 rounded-lg bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {deleting ? "削除中..." : "スレッド削除"}
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="mx-auto max-w-3xl px-5 py-10">
        {posts.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-white/30">まだチェックポイントがありません</p>
          </div>
        )}

        {posts.map((cp) => (
          <div key={cp.uri} className="group relative">
            <div className="absolute bottom-0 left-5 top-0 w-px bg-gradient-to-b from-indigo-500/40 to-violet-500/40 sm:left-6" />
            <div className="absolute left-[14px] top-3 size-3 rounded-full border-2 border-indigo-400 bg-surface-950 sm:left-[18px]" />
            <div className="pb-10 pl-12 sm:pl-16">
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-mono font-bold text-indigo-400">{formatTime(cp.checkpointAt)}</span>
                {cp.location && (
                  <span className="flex items-center gap-1 text-white/40">
                    <PinIcon className="size-3" />
                    {cp.location.latitude.toFixed(4)}, {cp.location.longitude.toFixed(4)}
                  </span>
                )}
                {cp.sourceRef && (
                  <span className="flex items-center gap-1.5">
                    <a
                      href={`https://bsky.app/profile/${parseAtUri(cp.sourceRef).repo}/post/${parseAtUri(cp.sourceRef).rkey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-full bg-[#0085ff]/10 px-2 py-0.5 text-[10px] text-[#0085ff] transition hover:bg-[#0085ff]/20"
                    >
                      <LinkIcon className="size-2.5" />
                      元投稿
                    </a>
                    {isOwner && (
                      <button
                        onClick={() => handleRefreshFromSource(cp)}
                        disabled={refreshingUri === cp.uri}
                        className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40 transition hover:bg-white/10 hover:text-white/70 disabled:opacity-50"
                        title="元投稿から再読み込み"
                      >
                        <RefreshIcon className={`size-2.5 ${refreshingUri === cp.uri ? "animate-spin" : ""}`} />
                        再取得
                      </button>
                    )}
                  </span>
                )}
                {isOwner && (
                  <div className="ml-auto flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => navigate("checkpoint-edit", { ...params, postUri: cp.uri })}
                      className="rounded-md px-2 py-1 text-white/20 hover:bg-white/5 hover:text-white/60"
                    >
                      <EditIcon className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmTarget({ type: "post", post: cp })}
                      className="rounded-md px-2 py-1 text-white/20 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {resolveImageUrls(cp).length > 0 ? (
                <>
                  <PostImages urls={resolveImageUrls(cp)} />
                  {cp.text && (
                    <p className="mt-4 text-base leading-relaxed text-white/70">{cp.text}</p>
                  )}
                </>
              ) : cp.text ? (
                <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5">
                  <p className="text-lg leading-relaxed text-white/80">{cp.text}</p>
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {posts.length > 0 && (
          <div className="flex items-center gap-3 pl-12 sm:pl-16">
            <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/30 to-transparent" />
            <span className="text-xs text-white/30">{posts.length} チェックポイント</span>
          </div>
        )}

        {isOwner && (
          <div className="mt-8 pl-12 sm:pl-16">
            <button
              onClick={() => navigate("checkpoint-post", params)}
              className="w-full rounded-xl border border-dashed border-indigo-500/30 bg-indigo-500/5 py-4 text-sm font-medium text-indigo-400 transition hover:border-indigo-400 hover:bg-indigo-500/10"
            >
              + チェックポイントを追加
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
