"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import { getAgent } from "@/lib/atp-agent";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createPost } from "@/lib/pds/posts";
import { extractImagesFromEmbed } from "@/lib/bsky-helpers";

interface BskyPost {
  uri: string;
  text: string;
  imageUrls: string[];
  hasQuote: boolean;
  createdAt: string;
  selected: boolean;
}

const PAGE_SIZE = 100;

// app.bsky.feed.getAuthorFeed の 1 アイテムを BskyPost に整形
type FeedItem = {
  post: {
    uri: string;
    author: { did: string };
    record: unknown;
    embed?: unknown;
    indexedAt: string;
  };
};

function feedItemToPost(item: FeedItem): BskyPost {
  const record = item.post.record as {
    text?: string;
    createdAt?: string;
  };
  const viewEmbed = item.post.embed as Record<string, unknown> | undefined;
  const imageUrls = extractImagesFromEmbed(viewEmbed);
  const hasQuote =
    viewEmbed?.$type === "app.bsky.embed.recordWithMedia#view" ||
    viewEmbed?.$type === "app.bsky.embed.record#view";
  return {
    uri: item.post.uri,
    text: record.text ?? "",
    imageUrls,
    hasQuote,
    createdAt: record.createdAt ?? item.post.indexedAt,
    selected: false,
  };
}

export interface BlueskyImportScreenProps {
  threadUri: string;
  onSubmitted: () => void;
}

export function BlueskyImportScreen({
  threadUri,
  onSubmitted,
}: BlueskyImportScreenProps) {
  const { did } = useAuthStore();
  const [posts, setPosts] = useState<BskyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // getAuthorFeed の次ページ用 cursor。ref で持って useCallback の依存を安定化
  const cursorRef = useRef<string | undefined>(undefined);

  const fetchPage = useCallback(
    async (append: boolean): Promise<void> => {
      if (!did) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const agent = getAgent();
        const res = await agent.getAuthorFeed({
          actor: did,
          limit: PAGE_SIZE,
          filter: "posts_no_replies",
          cursor: append ? cursorRef.current : undefined,
        });
        const items = (res.data.feed as unknown as FeedItem[])
          .filter((item) => item.post.author.did === did)
          .map(feedItemToPost);
        setPosts((prev) => (append ? [...prev, ...items] : items));
        cursorRef.current = res.data.cursor;
        setHasMore(!!res.data.cursor);
      } catch (e) {
        console.error("Failed to load Bluesky posts:", e);
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [did],
  );

  useEffect(() => {
    cursorRef.current = undefined;
    fetchPage(false);
  }, [fetchPage]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchPage(true);
  };

  const toggleSelect = (uri: string) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.uri === uri ? { ...p, selected: !p.selected } : p,
      ),
    );
  };

  const selectedCount = posts.filter((p) => p.selected).length;

  const handleImport = async () => {
    if (!threadUri) return;
    setImporting(true);
    setError(null);
    try {
      const selected = posts.filter((p) => p.selected);
      for (const post of selected) {
        await createPost({
          thread: threadUri,
          text: post.text || undefined,
          imageUrls: post.imageUrls.length > 0
            ? post.imageUrls.slice(0, 4)
            : undefined,
          checkpointAt: post.createdAt,
          sourceRef: post.uri,
          createdAt: new Date().toISOString(),
        });
      }
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "インポートに失敗しました");
      setImporting(false);
    }
  };

  return (
    <>
      <h2 className="mb-1 pr-10 text-xl font-bold text-white">
        Bluesky 投稿からインポート
      </h2>
      <p className="mb-6 text-sm text-white/40">
        チェックポイントとして取り込む投稿を選択してください
      </p>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-white/30">投稿が見つかりませんでした</p>
        </div>
      )}

      <div className="space-y-3">
        {posts.map((post) => (
          <button
            key={post.uri}
            type="button"
            onClick={() => toggleSelect(post.uri)}
            className={`flex w-full cursor-pointer gap-4 rounded-2xl border p-4 text-left transition ${
              post.selected
                ? "border-indigo-500/50 bg-indigo-500/5"
                : "border-white/5 bg-surface-800 hover:border-white/10"
            }`}
          >
            <div
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                post.selected ? "bg-indigo-500" : "border border-white/20"
              }`}
            >
              {post.selected && <CheckIcon className="size-3.5 text-white" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-white/80">
                {post.text}
              </p>
              {post.imageUrls.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {post.imageUrls.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={img}
                      alt=""
                      className="size-14 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-white/30">
                  {new Date(post.createdAt).toLocaleString("ja-JP")}
                </span>
                {post.hasQuote && (
                  <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                    引用リポスト
                  </span>
                )}
                {post.imageUrls.length > 0 && (
                  <span className="text-[10px] text-white/20">
                    {post.imageUrls.length}枚
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {!loading && posts.length > 0 && hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loadingMore ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                読み込み中...
              </>
            ) : (
              "もっと読み込む"
            )}
          </button>
        </div>
      )}

      {!loading && posts.length > 0 && !hasMore && (
        <p className="mt-4 text-center text-xs text-white/30">
          これ以上の投稿はありません
        </p>
      )}

      <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-white/40">
          <InfoIcon className="size-4 shrink-0 text-amber-400/60" />
          インポートした投稿には位置情報は付与されません。元投稿への参照リンクが保持されます。
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
          {error}
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={importing || selectedCount === 0}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
      >
        {importing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            インポート中...
          </span>
        ) : (
          `選択した投稿をインポート (${selectedCount}件)`
        )}
      </button>
    </>
  );
}
