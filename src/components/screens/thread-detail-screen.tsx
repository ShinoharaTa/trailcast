"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import type {
  ThreadWithMeta,
  PostWithMeta,
} from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { getThread, deleteThread, listPostsForThread } from "@/lib/pds/threads";
import { deletePost, refreshFromSource } from "@/lib/pds/posts";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  PinIcon,
  EditIcon,
  TrashIcon,
  RefreshIcon,
  LinkIcon,
  ChevronLeftIcon,
  ShareIcon,
  PlusIcon,
} from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useBlobUrl, usePdsUrl } from "@/components/ui/blob-image";
import { extractBlobCid, buildBlobUrl } from "@/lib/pds/blob-url";
import { ShareScreen } from "@/components/screens/share-screen";
import { CheckpointPostScreen } from "@/components/screens/checkpoint-post-screen";
import { CheckpointEditScreen } from "@/components/screens/checkpoint-edit-screen";
import { BlueskyImportScreen } from "@/components/screens/bsky-import-screen";
import { ThreadEditScreen } from "@/components/screens/thread-edit-screen";

type ModalKind =
  | "share"
  | "checkpoint-post"
  | "checkpoint-edit"
  | "bsky-import"
  | "thread-edit";

function modalMaxWidth(kind: ModalKind): "lg" | "2xl" | "3xl" {
  switch (kind) {
    case "bsky-import":
      return "3xl";
    case "thread-edit":
    case "checkpoint-post":
    case "checkpoint-edit":
      return "2xl";
    default:
      return "lg";
  }
}

function PostImages({
  post,
  pdsUrl,
}: {
  post: PostWithMeta;
  pdsUrl: string | null;
}) {
  const urls: string[] = [];
  if (post.imageUrls && post.imageUrls.length > 0) {
    urls.push(...post.imageUrls);
  } else if (post.images && post.images.length > 0 && pdsUrl) {
    const did = parseAtUri(post.uri).repo;
    for (const img of post.images) {
      const cid = extractBlobCid(img);
      if (cid) urls.push(buildBlobUrl(pdsUrl, did, cid));
    }
  }
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
  const { did: myDid, isAuthenticated } = useAuthStore();
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

  // モーダル状態（URL には現れないローカル state）
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [editingPost, setEditingPost] = useState<PostWithMeta | null>(null);
  const [fabOpen, setFabOpen] = useState(false);

  // ヘッダーのスクロール連動（0 = ヒーロー全表示、1 = コンパクトヘッダー）
  const HEADER_HEIGHT = 80;
  const heroRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const compute = () => {
      const h = heroRef.current?.offsetHeight ?? 0;
      const start = h * 0.4;
      const end = Math.max(start + 1, h - HEADER_HEIGHT);
      const y = window.scrollY;
      const p = Math.max(0, Math.min(1, (y - start) / (end - start)));
      setProgress(p);
    };
    compute();
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", compute);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [thread]);

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

  // スピナーを出さずにバックグラウンドで再取得
  const refresh = useCallback(async () => {
    if (!threadUri) return;
    try {
      const { repo, rkey } = parseAtUri(threadUri);
      const [t, p] = await Promise.all([
        getThread(repo, rkey),
        listPostsForThread(threadUri),
      ]);
      setThread(t);
      setPosts(p);
    } catch (e) {
      console.error("Failed to refresh thread:", e);
    }
  }, [threadUri]);

  useEffect(() => {
    load();
  }, [load]);

  // 画像表示用の PDS / blob URL (hooks はトップレベルで呼び出す必要があるため
  // thread が未ロードの間は null 引数で保持だけして、ロード後に自動で URL が入る)
  const threadDidForBlobs = thread ? parseAtUri(thread.uri).repo : null;
  const coverUrl = useBlobUrl(threadDidForBlobs, thread?.coverImage);
  const pdsUrl = usePdsUrl(threadDidForBlobs);

  const executeDeleteThread = async () => {
    if (!thread) return;
    setConfirmTarget(null);
    setDeleting(true);
    try {
      await deleteThread(thread.rkey);
      // 削除済みの URL に戻れないように replace
      navigate("home", {}, { replace: true });
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

  const handleEditThread = () => {
    setModal("thread-edit");
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

  const closeModal = useCallback(() => {
    setModal(null);
    setEditingPost(null);
  }, []);

  const onModalSubmitted = useCallback(() => {
    setModal(null);
    setEditingPost(null);
    void refresh();
  }, [refresh]);

  const openCheckpointEdit = (post: PostWithMeta) => {
    setEditingPost(post);
    setModal("checkpoint-edit");
  };

  const openFromFab = (kind: ModalKind) => {
    setFabOpen(false);
    setModal(kind);
  };

  // FAB 展開中の ESC 閉じ
  useEffect(() => {
    if (!fabOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFabOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fabOpen]);

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

  const threadDid = parseAtUri(thread.uri).repo;
  const isOwner = myDid === threadDid;

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
      <div ref={heroRef} className="relative h-[55vh] min-h-[360px] overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={thread.title}
            className="h-full w-full object-cover will-change-transform"
            style={{
              transform: `scale(${1 - progress * 0.22})`,
              transformOrigin: "center center",
              opacity: 1 - progress,
            }}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-600/30 to-violet-600/30"
            style={{
              transform: `scale(${1 - progress * 0.22})`,
              transformOrigin: "center center",
              opacity: 1 - progress,
            }}
          >
            <span className="text-8xl font-bold text-white/10">{thread.title.charAt(0)}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/50 to-surface-950/20" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-5 pb-8">
          {/* バッジ行 (ヒーローでのみ表示) */}
          <div
            className="mb-3 flex items-center gap-2"
            style={{
              opacity: Math.max(0, 1 - progress * 1.4),
              transform: `translate3d(0, ${progress * -8}px, 0)`,
            }}
          >
            <span className={`rounded-full px-3 py-0.5 text-[11px] font-bold backdrop-blur-sm ${thread.visibility === "public" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/60"}`}>
              {thread.visibility === "public" ? "Public" : "Private"}
            </span>
            <span className="text-xs text-white/40">{formatTime(thread.createdAt)}</span>
          </div>
          <h1
            className="text-3xl font-bold tracking-tight text-white sm:text-4xl"
            style={{ opacity: Math.max(0, 1 - progress * 1.2) }}
          >
            {thread.title}
          </h1>
          {thread.description && (
            <p
              className="mt-3 max-w-xl text-base leading-relaxed text-white/60"
              style={{ opacity: Math.max(0, 1 - progress * 1.6) }}
            >
              {thread.description}
            </p>
          )}
          {!isAuthenticated && (
            <div
              className="mt-6"
              style={{ opacity: Math.max(0, 1 - progress * 1.6) }}
            >
              <button
                onClick={() => navigate("login")}
                className="rounded-lg bg-indigo-500/20 px-3.5 py-2 text-xs font-medium text-indigo-300 backdrop-blur-sm transition hover:bg-indigo-500/30"
              >
                ログインして投稿する
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ===== 上部に固定表示するヘッダー =====
          - 戻る / 共有 / 編集 は常に同じ位置に表示
          - タイトルはスクロール量に応じてフェードイン
          - 背景グラデーションも同様にフェードインし、ヒーローに自然に馴染む */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40">
        {/* 背景層 (フェードのみ。位置移動なし) */}
        <div
          className="absolute inset-x-0 top-0 bg-gradient-to-b from-surface-950 from-0% via-surface-950/85 via-55% to-transparent backdrop-blur-md [mask-image:linear-gradient(to_bottom,black_65%,transparent_100%)]"
          style={{ height: HEADER_HEIGHT, opacity: progress }}
          aria-hidden
        />

        {/* コンテンツ行 */}
        <div className="pointer-events-auto relative mx-auto flex h-14 max-w-3xl items-center gap-2 px-3">
          <button
            onClick={goBack}
            aria-label="戻る"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            style={{
              backgroundColor: `rgba(0,0,0,${0.35 * (1 - progress)})`,
              backdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
              WebkitBackdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
            }}
          >
            <ChevronLeftIcon className="size-5" />
          </button>

          {/* 固定タイトル (スクロールで浮き出る) */}
          <h2
            className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold text-white"
            style={{ opacity: Math.max(0, progress * 1.4 - 0.4) }}
            aria-hidden={progress < 0.3}
          >
            {thread.title}
          </h2>

          <button
            onClick={() => setModal("share")}
            aria-label="共有"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            style={{
              backgroundColor: `rgba(0,0,0,${0.35 * (1 - progress)})`,
              backdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
              WebkitBackdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
            }}
          >
            <ShareIcon className="size-5" />
          </button>
          {isOwner && (
            <button
              onClick={handleEditThread}
              aria-label="編集"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10"
              style={{
                backgroundColor: `rgba(0,0,0,${0.35 * (1 - progress)})`,
                backdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
                WebkitBackdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
              }}
            >
              <EditIcon className="size-5" />
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="mx-auto max-w-3xl px-5 pt-10 pb-28">
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
                      onClick={() => openCheckpointEdit(cp)}
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

              {(cp.imageUrls && cp.imageUrls.length > 0) ||
              (cp.images && cp.images.length > 0) ? (
                <>
                  <PostImages post={cp} pdsUrl={pdsUrl} />
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
      </div>

      {/* Floating Action Button (bottom-right) */}
      {isOwner && (
        <>
          {/* Backdrop when expanded */}
          <div
            onClick={() => setFabOpen(false)}
            aria-hidden
            className={`fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${
              fabOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          />
          <div
            className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Speed dial items */}
            <button
              type="button"
              onClick={() => openFromFab("bsky-import")}
              aria-hidden={!fabOpen}
              tabIndex={fabOpen ? 0 : -1}
              className={`flex items-center gap-3 rounded-full bg-surface-800/95 py-2 pl-4 pr-2 text-left shadow-xl ring-1 ring-white/10 backdrop-blur transition-all duration-200 hover:bg-surface-700 ${
                fabOpen
                  ? "translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none translate-y-3 scale-95 opacity-0"
              }`}
            >
              <span className="text-sm font-medium text-white/90">
                Bluesky からインポート
              </span>
              <span className="flex size-10 items-center justify-center rounded-full bg-[#0085ff]/20 text-[#0085ff]">
                <LinkIcon className="size-5" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => openFromFab("checkpoint-post")}
              aria-hidden={!fabOpen}
              tabIndex={fabOpen ? 0 : -1}
              className={`flex items-center gap-3 rounded-full bg-surface-800/95 py-2 pl-4 pr-2 text-left shadow-xl ring-1 ring-white/10 backdrop-blur transition-all duration-200 hover:bg-surface-700 ${
                fabOpen
                  ? "translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none translate-y-3 scale-95 opacity-0"
              }`}
              style={{ transitionDelay: fabOpen ? "40ms" : "0ms" }}
            >
              <span className="text-sm font-medium text-white/90">
                チェックポイントを追加
              </span>
              <span className="flex size-10 items-center justify-center rounded-full bg-indigo-500/25 text-indigo-300">
                <PinIcon className="size-5" />
              </span>
            </button>

            {/* Main FAB */}
            <button
              type="button"
              onClick={() => setFabOpen((v) => !v)}
              aria-label={fabOpen ? "閉じる" : "追加メニューを開く"}
              aria-expanded={fabOpen}
              className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-xl shadow-indigo-900/40 ring-1 ring-white/15 transition hover:brightness-110 active:scale-95"
            >
              <PlusIcon
                className={`size-6 transition-transform duration-200 ${
                  fabOpen ? "rotate-45" : ""
                }`}
              />
            </button>
          </div>
        </>
      )}

      {/* Modals */}
      {modal && (
        <Modal open onClose={closeModal} maxWidth={modalMaxWidth(modal)}>
          {modal === "share" && <ShareScreen threadUri={threadUri} />}
          {modal === "checkpoint-post" && (
            <CheckpointPostScreen
              threadUri={threadUri}
              onSubmitted={onModalSubmitted}
            />
          )}
          {modal === "checkpoint-edit" && editingPost && (
            <CheckpointEditScreen
              post={editingPost}
              onSubmitted={onModalSubmitted}
              onCancel={closeModal}
            />
          )}
          {modal === "bsky-import" && (
            <BlueskyImportScreen
              threadUri={threadUri}
              onSubmitted={onModalSubmitted}
            />
          )}
          {modal === "thread-edit" && thread && (
            <ThreadEditScreen
              thread={thread}
              onSubmitted={onModalSubmitted}
              onCancel={closeModal}
              onRequestDelete={() => {
                setModal(null);
                setConfirmTarget({ type: "thread" });
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
