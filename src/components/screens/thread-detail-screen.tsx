"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import type {
  ThreadWithMeta,
  PostWithMeta,
} from "@/lib/types";
import { parseAtUri, buildAtUri, NSID_THREAD } from "@/lib/types";
import { getThread, deleteThread, listPostsForThread } from "@/lib/pds/threads";
import { deletePost, refreshFromSource } from "@/lib/pds/posts";
import {
  createBookmark,
  deleteBookmark,
  findBookmarkBySubject,
} from "@/lib/pds/bookmarks";
import { resolveIdentifier } from "@/lib/pds/identity";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  PinIcon,
  EditIcon,
  TrashIcon,
  RefreshIcon,
  LinkIcon,
  ShareIcon,
  PlusIcon,
  StarIcon,
} from "@/components/ui/icons";
import { HomeLink } from "@/components/ui/home-link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Lightbox } from "@/components/ui/lightbox";
import { useBlobUrl, usePdsUrl } from "@/components/ui/blob-image";
import { extractBlobCid, buildBlobUrl } from "@/lib/pds/blob-url";
import { getProfile, type ProfileView } from "@/lib/pds/identity";
import { getUserProfileHref } from "@/lib/app-routes";
import { ShareScreen } from "@/components/screens/share-screen";
import { CheckpointPostScreen } from "@/components/screens/checkpoint-post-screen";
import { CheckpointEditScreen } from "@/components/screens/checkpoint-edit-screen";
import { BlueskyImportScreen } from "@/components/screens/bsky-import-screen";
import { ThreadEditScreen } from "@/components/screens/thread-edit-screen";
import { LoginModal } from "@/components/auth/login-modal";

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
  onOpenLightbox,
}: {
  post: PostWithMeta;
  pdsUrl: string | null;
  /** 画像クリック時に同じ post の全画像を Lightbox へ渡す */
  onOpenLightbox: (urls: string[], initialIndex: number) => void;
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
      <button
        type="button"
        onClick={() => onOpenLightbox(urls, 0)}
        className="block w-full overflow-hidden rounded-2xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[0]}
          alt=""
          className="aspect-[16/9] w-full cursor-zoom-in object-cover transition hover:opacity-95"
          loading="lazy"
        />
      </button>
    );
  }
  return (
    <div className={`grid gap-1.5 overflow-hidden rounded-2xl ${urls.length <= 2 ? "grid-cols-2" : "grid-cols-2"}`}>
      {urls.map((url, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onOpenLightbox(urls, i)}
          className="block overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className="aspect-[4/3] w-full cursor-zoom-in object-cover transition hover:opacity-95"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  );
}

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

function shortenDid(did: string): string {
  if (!did.startsWith("did:")) return did;
  return did.length > 24 ? `${did.slice(0, 12)}…${did.slice(-8)}` : did;
}

/**
 * スレッド著者 (DID) のアバター/表示名/handle を表示し、プロフィール画面へ遷移する行。
 * 公開 AppView (getProfile) から取得するため未ログインでも表示される。
 */
function AuthorRow({
  did,
  navigate,
  floating = false,
}: {
  did: string;
  navigate: NavigationProps["navigate"];
  /** true の場合は画像の上に重ねる用のスタイル (背景/シャドウを少し強める) */
  floating?: boolean;
}) {
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProfile(did)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        // 未登録 DID 等は静かにフォールバック
      });
    return () => {
      cancelled = true;
    };
  }, [did]);

  const identifier = profile?.handle ?? did;
  const displayName =
    profile?.displayName?.trim() || profile?.handle || shortenDid(did);
  const handleLabel = profile?.handle ?? shortenDid(did);

  const containerClass = floating
    ? "inline-flex max-w-full items-center gap-3.5 rounded-full py-1 pr-1 text-white transition hover:opacity-90 [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]"
    : "mt-6 inline-flex max-w-full items-center gap-3 rounded-full bg-white/5 p-1.5 pr-4 transition hover:bg-white/10";

  const avatarSizeClass = floating ? "size-[52px]" : "size-10";
  const avatarInitialClass = floating ? "text-base" : "text-sm";
  const nameClass = floating ? "text-lg" : "text-sm";
  const handleClass = floating ? "text-sm" : "text-xs";

  return (
    <a
      href={getUserProfileHref(identifier)}
      onClick={(e) => {
        if (isModifiedClick(e)) return;
        e.preventDefault();
        navigate("user-profile", { userIdentifier: identifier });
      }}
      className={`group ${containerClass}`}
    >
      <div
        className={`${avatarSizeClass} shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/30 ${
          floating
            ? "ring-2 ring-surface-950/70 shadow-lg shadow-black/40"
            : "ring-1 ring-white/10"
        }`}
      >
        {profile?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className={`flex h-full items-center justify-center font-bold text-white/80 ${avatarInitialClass}`}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 leading-tight">
        <div
          className={`truncate font-semibold ${nameClass} ${
            floating ? "text-white" : "text-white group-hover:text-white"
          }`}
        >
          {displayName}
        </div>
        <div
          className={`truncate ${handleClass} ${
            floating ? "text-white/75" : "text-white/40"
          }`}
        >
          @{handleLabel}
        </div>
      </div>
    </a>
  );
}

function formatTimeOnly(dt: string): string {
  try {
    const d = new Date(dt);
    return d.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

/**
 * 連続する同日 post をグループ化する。同じ日の先頭 post だけ DateBadge を出す
 * ための前処理。posts の並び順はそのまま維持する (並び替えはしない)。
 */
function groupPostsByDay<T extends { checkpointAt: string }>(
  posts: T[],
): Array<{ key: string; posts: T[] }> {
  const groups: Array<{ key: string; posts: T[] }> = [];
  for (const post of posts) {
    const d = new Date(post.checkpointAt);
    const key = Number.isNaN(d.getTime())
      ? `invalid-${groups.length}`
      : d.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.posts.push(post);
    } else {
      groups.push({ key, posts: [post] });
    }
  }
  return groups;
}

/** Thread 情報部の作成日時用 (チェックポイント行とは別、日付も含めて表示) */
function formatDateTime(dt: string): string {
  try {
    const d = new Date(dt);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

/**
 * 日付を塗りつぶしの「長丸 (pill)」に入れて表示するバッジ。
 * 中央を斜めの線 (/) で分割し、左に月、右に日を配置する。
 * pill 形状にしたことで○の時より数字を大きく表示できる (text-sm bold)。
 */
function DateBadge({ date }: { date: string }) {
  const d = new Date(date);
  const valid = !Number.isNaN(d.getTime());
  const month = valid ? String(d.getMonth() + 1) : "";
  const day = valid ? String(d.getDate()) : "";

  return (
    <div
      role="img"
      aria-label={valid ? `${month}月${day}日` : ""}
      className="relative h-5 w-10 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 shadow-lg shadow-indigo-900/40 ring-1 ring-white/15 sm:h-7 sm:w-14"
    >
      {/* 数字 (左: 月, 右: 日) 。pill の 1/4 / 3/4 の位置で中央合わせ。
          tabular-nums で 1 桁と 2 桁が混ざっても揃える。 */}
      <span className="absolute left-1/4 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] font-bold leading-none tabular-nums text-white sm:text-sm">
        {month}
      </span>
      <span className="absolute left-3/4 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] font-bold leading-none tabular-nums text-white sm:text-sm">
        {day}
      </span>
      {/* 斜め分割線 (/ 方向)。数字に被らないよう中央 (x=23〜33) にコンパクトに配置。 */}
      <svg
        viewBox="0 0 56 28"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        <line
          x1="23"
          y1="24"
          x2="33"
          y2="4"
          strokeWidth="1.5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="stroke-white/75"
        />
      </svg>
    </div>
  );
}

export function ThreadDetailScreen({ navigate, params }: NavigationProps) {
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
  const [loginOpen, setLoginOpen] = useState(false);

  // ブックマーク状態 (他人のスレッドのみ使用)。rkey を保持して 1 クリックで削除できるようにする。
  // undefined = まだ取得していない, null = 未ブックマーク, string = その rkey でブックマーク済み
  const [bookmarkRkey, setBookmarkRkey] = useState<string | null | undefined>(
    undefined,
  );
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  // Lightbox: クリックされた post の画像群と開始 index を保持
  const [lightbox, setLightbox] = useState<
    { urls: string[]; index: number } | null
  >(null);
  const openLightbox = useCallback((urls: string[], index: number) => {
    setLightbox({ urls, index });
  }, []);

  // ヘッダーのスクロール連動（0 = ヒーロー全表示、1 = コンパクトヘッダー）
  const HEADER_HEIGHT = 80;
  const heroRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const compute = () => {
      const h = heroRef.current?.offsetHeight ?? 0;
      // 3:1 のカバー画像はモバイルで ~125px と低くなるため、
      // スティッキーヘッダーが瞬時に切り替わらないよう遷移距離の下限を確保する。
      const end = Math.max(140, h - HEADER_HEIGHT);
      const start = end * 0.3;
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

  const rawThreadUri = params.threadUri ?? "";

  // URL から渡される threadUri は `/{did|handle}/{rkey}` 由来のため、
  // repo 部分が handle の場合がある。post レコードの `thread` フィールドは
  // 作成者の DID で保存されているため、文字列比較でマッチさせるには
  // handle を DID に解決して正規化した URI を使う必要がある。
  // 画像の blob URL 解決 (useBlobUrl/usePdsUrl) も DID 前提のため同様。
  const [canonicalUri, setCanonicalUri] = useState<string | null>(() => {
    if (!rawThreadUri) return null;
    const { repo } = parseAtUri(rawThreadUri);
    return repo.startsWith("did:") ? rawThreadUri : null;
  });

  useEffect(() => {
    if (!rawThreadUri) {
      setCanonicalUri(null);
      return;
    }
    const { repo, rkey } = parseAtUri(rawThreadUri);
    if (repo.startsWith("did:")) {
      setCanonicalUri(rawThreadUri);
      return;
    }
    let cancelled = false;
    resolveIdentifier(repo)
      .then((did) => {
        if (!cancelled) setCanonicalUri(buildAtUri(did, NSID_THREAD, rkey));
      })
      .catch((e) => {
        console.error("Failed to resolve handle:", e);
        if (!cancelled) {
          setCanonicalUri(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rawThreadUri]);

  const load = useCallback(async () => {
    if (!canonicalUri) return;
    setLoading(true);
    try {
      const { repo, rkey } = parseAtUri(canonicalUri);
      const [t, p] = await Promise.all([
        getThread(repo, rkey),
        listPostsForThread(canonicalUri),
      ]);
      setThread(t);
      setPosts(p);
    } catch (e) {
      console.error("Failed to load thread:", e);
    } finally {
      setLoading(false);
    }
  }, [canonicalUri]);

  // スピナーを出さずにバックグラウンドで再取得
  const refresh = useCallback(async () => {
    if (!canonicalUri) return;
    try {
      const { repo, rkey } = parseAtUri(canonicalUri);
      const [t, p] = await Promise.all([
        getThread(repo, rkey),
        listPostsForThread(canonicalUri),
      ]);
      setThread(t);
      setPosts(p);
    } catch (e) {
      console.error("Failed to refresh thread:", e);
    }
  }, [canonicalUri]);

  useEffect(() => {
    load();
  }, [load]);

  // ブックマーク状態の取得 (自分のスレッドは対象外)
  useEffect(() => {
    if (!isAuthenticated || !thread) {
      setBookmarkRkey(undefined);
      return;
    }
    const threadDid = parseAtUri(thread.uri).repo;
    if (threadDid === myDid) {
      // 自分のスレッドはブックマーク対象外なので未ロード扱いにしておく
      setBookmarkRkey(undefined);
      return;
    }
    let cancelled = false;
    findBookmarkBySubject(thread.uri)
      .then((bm) => {
        if (!cancelled) setBookmarkRkey(bm?.rkey ?? null);
      })
      .catch((e) => {
        console.error("Failed to fetch bookmark status:", e);
        if (!cancelled) setBookmarkRkey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, thread, myDid]);

  const toggleBookmark = useCallback(async () => {
    if (!thread || bookmarkBusy) return;
    if (bookmarkRkey === undefined) return;
    setBookmarkBusy(true);
    try {
      if (bookmarkRkey) {
        await deleteBookmark(bookmarkRkey);
        setBookmarkRkey(null);
      } else {
        const bm = await createBookmark(thread.uri);
        setBookmarkRkey(bm.rkey);
      }
    } catch (e) {
      console.error("Failed to toggle bookmark:", e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`ブックマークの更新に失敗しました\n\n${msg}`);
    } finally {
      setBookmarkBusy(false);
    }
  }, [thread, bookmarkRkey, bookmarkBusy]);

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
        <button
          onClick={() => navigate("home")}
          className="text-sm text-indigo-400 hover:underline"
        >
          ホームに戻る
        </button>
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

      {/* ===== Hero カバー画像 =====
          カバー画像は 3:1 でアップロードされるため、アスペクト比はそのまま維持しつつ
          max-h で上限を設ける。Author (アバター+名前+handle) は画像下端のグラデーションに
          重ねて配置し、タイトル/説明はその下の情報ブロックに置く。 */}
      <div
        ref={heroRef}
        className="relative aspect-[3/1] max-h-[380px] w-full overflow-hidden"
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={thread.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-600/30 to-violet-600/30">
            <span className="text-7xl font-bold text-white/10">
              {thread.title.charAt(0)}
            </span>
          </div>
        )}

        {/* 下端のグラデーション: Author を読みやすくするためやや濃いめにする */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/60 via-30% to-transparent" />

        {/* Author: 画像とグラデーションに重なる位置 */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-3xl px-4 pb-3 sm:px-5">
            <AuthorRow did={threadDid} navigate={navigate} floating />
          </div>
        </div>
      </div>

      {/* ===== 情報ブロック (タイトル / 説明) ===== */}
      <div className="mx-auto max-w-3xl px-4 pt-5 pb-8 sm:px-5">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-0.5 text-[11px] font-bold ${
              thread.visibility === "public"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-white/10 text-white/60"
            }`}
          >
            {thread.visibility === "public" ? "Public" : "Private"}
          </span>
          <span className="text-xs text-white/40">
            {formatDateTime(thread.createdAt)}
          </span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {thread.title}
        </h1>

        {thread.description && (
          <p className="mt-3 max-w-2xl whitespace-pre-wrap text-base leading-relaxed text-white/60">
            {thread.description}
          </p>
        )}

        {!isAuthenticated && (
          <div className="mt-6">
            <button
              onClick={() => setLoginOpen(true)}
              className="rounded-lg bg-indigo-500/15 px-3.5 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/25"
            >
              ログインして投稿する
            </button>
          </div>
        )}
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
          <HomeLink
            navigate={navigate}
            style={{
              backgroundColor: `rgba(0,0,0,${0.35 * (1 - progress)})`,
              backdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
              WebkitBackdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
            }}
          />

          {/* 固定タイトル (スクロールで浮き出る) */}
          <h2
            className="min-w-0 flex-1 truncate px-1 text-[15px] font-semibold text-white"
            style={{ opacity: Math.max(0, progress * 1.4 - 0.4) }}
            aria-hidden={progress < 0.3}
          >
            {thread.title}
          </h2>

          {isAuthenticated && !isOwner && (
            <button
              onClick={toggleBookmark}
              disabled={bookmarkRkey === undefined || bookmarkBusy}
              aria-label={bookmarkRkey ? "ブックマークを外す" : "ブックマークに追加"}
              aria-pressed={Boolean(bookmarkRkey)}
              className={`flex size-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10 disabled:opacity-50 ${
                bookmarkRkey ? "text-amber-300" : "text-white"
              }`}
              style={{
                backgroundColor: `rgba(0,0,0,${0.35 * (1 - progress)})`,
                backdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
                WebkitBackdropFilter: progress < 0.95 ? "blur(6px)" : undefined,
              }}
            >
              <StarIcon filled={Boolean(bookmarkRkey)} className="size-5" />
            </button>
          )}
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
          {!isAuthenticated && (
            <button
              onClick={() => setLoginOpen(true)}
              className="shrink-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-500/20 transition hover:brightness-110"
            >
              ログイン
            </button>
          )}
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
      <div className="mx-auto max-w-3xl px-4 pt-10 pb-28 sm:px-5">
        {posts.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-white/30">まだチェックポイントがありません</p>
          </div>
        )}

        {groupPostsByDay(posts).map((group) => (
          <div key={group.key} className="relative">
            {/* 縦線: その日のブロック全体を貫く。pill の中央 (x=28) を通る。 */}
            <div className="absolute bottom-0 left-6 top-0 w-px -translate-x-1/2 bg-gradient-to-b from-indigo-500/40 to-violet-500/40 sm:left-7" />
            {/* 日付バッジ: その日のブロック内で sticky。先頭 post の日付を表示し、
                同日の後続 post をスクロール中もヘッダー直下 (80px + 16px) に残る。
                h-0 ラッパー + absolute 子で後続レイアウトに影響を出さない。 */}
            <div className="sticky top-24 z-10 h-0">
              <div className="absolute left-6 top-0 -translate-x-1/2 sm:left-7">
                <DateBadge date={group.posts[0].checkpointAt} />
              </div>
            </div>

            {group.posts.map((cp, i) => (
              <div key={cp.uri} className="group relative">
                {/* 2 件目以降は従来どおり小さな○。先頭 post の位置は DateBadge に
                    重なるので ○ は描画しない。 */}
                {i > 0 && (
                  <div className="absolute left-6 top-1 size-3 -translate-x-1/2 rounded-full border-2 border-indigo-400 bg-surface-950 sm:left-7" />
                )}
                <div className="pb-10 pl-14 sm:pl-16">
              <div className="mb-3 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-mono font-bold text-indigo-400">{formatTimeOnly(cp.checkpointAt)}</span>
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
                  // モバイル / タブレット (md 未満) では常時表示。
                  // md 以上はホバーでのみ表示する従来挙動。
                  <div className="ml-auto flex gap-1 transition md:opacity-0 md:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openCheckpointEdit(cp)}
                      aria-label="編集"
                      className="rounded-md px-2 py-1 text-white/40 transition hover:bg-white/5 hover:text-white/80 md:text-white/20 md:hover:text-white/60"
                    >
                      <EditIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmTarget({ type: "post", post: cp })}
                      aria-label="削除"
                      className="rounded-md px-2 py-1 text-white/40 transition hover:bg-red-500/10 hover:text-red-400 md:text-white/20"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {(cp.imageUrls && cp.imageUrls.length > 0) ||
              (cp.images && cp.images.length > 0) ? (
                <>
                  <PostImages post={cp} pdsUrl={pdsUrl} onOpenLightbox={openLightbox} />
                  {cp.text && (
                    <p className="mt-4 text-xs leading-relaxed text-white/70">{cp.text}</p>
                  )}
                </>
              ) : cp.text ? (
                <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5">
                  <p className="text-sm leading-relaxed text-white/80">{cp.text}</p>
                </div>
              ) : null}
                </div>
              </div>
            ))}
          </div>
        ))}

        {posts.length > 0 && (
          <div className="flex items-center gap-3 pl-14 sm:pl-16">
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

      {/* Lightbox (画像クリック時の拡大表示) */}
      {lightbox && (
        <Lightbox
          images={lightbox.urls}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Modals */}
      {modal && (
        <Modal open onClose={closeModal} maxWidth={modalMaxWidth(modal)}>
          {modal === "share" && <ShareScreen threadUri={thread.uri} />}
          {modal === "checkpoint-post" && (
            <CheckpointPostScreen
              threadUri={thread.uri}
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
              threadUri={thread.uri}
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

      {/* ログインダイアログ (未認証時の共通導線) */}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
