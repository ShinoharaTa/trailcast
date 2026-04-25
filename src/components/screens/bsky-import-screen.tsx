"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { getAgent } from "@/lib/atp-agent";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createPost } from "@/lib/pds/posts";
import {
  extractImagesFromEmbed,
  fetchBskyPosts,
  normalizeBskyPostUrl,
  type BskyPostView,
} from "@/lib/bsky-helpers";

interface BskyPost {
  uri: string;
  text: string;
  imageUrls: string[];
  hasQuote: boolean;
  createdAt: string;
  selected: boolean;
}

const PAGE_SIZE = 100;
type Mode = "feed" | "url";

function postViewToBskyPost(post: BskyPostView): BskyPost {
  const record = post.record as {
    text?: string;
    createdAt?: string;
  };
  const viewEmbed = post.embed as Record<string, unknown> | undefined;
  const imageUrls = extractImagesFromEmbed(viewEmbed);
  const hasQuote =
    viewEmbed?.$type === "app.bsky.embed.recordWithMedia#view" ||
    viewEmbed?.$type === "app.bsky.embed.record#view";
  return {
    uri: post.uri,
    text: record.text ?? "",
    imageUrls,
    hasQuote,
    createdAt: record.createdAt ?? post.indexedAt,
    selected: false,
  };
}

type FeedItem = { post: BskyPostView };

export interface BlueskyImportScreenProps {
  open: boolean;
  onClose: () => void;
  threadUri: string;
  onSubmitted: () => void;
}

/**
 * URL タブのリスト要素。
 * - "post": 取得に成功し、選択 / インポート対象になり得る投稿
 * - "message": 解析失敗 / 取得失敗 / 自分以外などのスキップを表す軽量行
 */
type UrlEntry =
  | { kind: "post"; input: string; post: BskyPost }
  | {
      kind: "message";
      input: string;
      status: "skipped" | "error";
      message: string;
    };

export function BlueskyImportScreen({
  open,
  onClose,
  threadUri,
  onSubmitted,
}: BlueskyImportScreenProps) {
  const { did } = useAuthStore();
  const [mode, setMode] = useState<Mode>("feed");

  // 自分のタイムライン取得 (feed タブ)
  const [feedPosts, setFeedPosts] = useState<BskyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);

  // URL 貼り付け取得 (url タブ)
  // 入力 URL ごとに 1 つのエントリを保持し、成功は post カード、失敗/スキップは
  // メッセージ行として統一リストで描画する。複数回の取得操作で累積する。
  const [urlInput, setUrlInput] = useState("");
  const [urlEntries, setUrlEntries] = useState<UrlEntry[]>([]);
  const [urlFetching, setUrlFetching] = useState(false);

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(
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
          .map((item) => postViewToBskyPost(item.post));
        setFeedPosts((prev) => (append ? [...prev, ...items] : items));
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
    if (!open) return;
    cursorRef.current = undefined;
    fetchFeed(false);
  }, [open, fetchFeed]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    fetchFeed(true);
  };

  const toggleSelectFeed = (uri: string) => {
    setFeedPosts((prev) =>
      prev.map((p) => (p.uri === uri ? { ...p, selected: !p.selected } : p)),
    );
  };

  const toggleSelectUrl = (uri: string) => {
    setUrlEntries((prev) =>
      prev.map((e) =>
        e.kind === "post" && e.post.uri === uri
          ? { ...e, post: { ...e.post, selected: !e.post.selected } }
          : e,
      ),
    );
  };

  const removeUrlEntry = (input: string) => {
    setUrlEntries((prev) => prev.filter((e) => e.input !== input));
  };

  const handleFetchByUrls = async () => {
    if (!did) return;
    setUrlFetching(true);
    setError(null);

    // 入力を行ごとに切って空行を除去
    const lines = urlInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (lines.length === 0) {
      setUrlFetching(false);
      return;
    }

    // 既存リストの at-uri / 入力 URL は重複扱い
    const existingUris = new Set(
      urlEntries
        .filter((e): e is Extract<UrlEntry, { kind: "post" }> => e.kind === "post")
        .map((e) => e.post.uri),
    );
    const existingInputs = new Set(urlEntries.map((e) => e.input));

    // URL → at-uri に正規化。途中で失敗しても他の URL の取得は続ける。
    const normalized: { input: string; atUri?: string; error?: string }[] =
      await Promise.all(
        lines.map(async (input) => {
          try {
            const atUri = await normalizeBskyPostUrl(input);
            return { input, atUri };
          } catch (e) {
            return {
              input,
              error: e instanceof Error ? e.message : "URL 解析に失敗",
            };
          }
        }),
      );

    const toFetch = normalized
      .filter((n) => n.atUri && !existingUris.has(n.atUri))
      .map((n) => n.atUri!);

    let fetched: BskyPostView[] = [];
    let fetchError: string | null = null;
    if (toFetch.length > 0) {
      try {
        fetched = await fetchBskyPosts(toFetch);
      } catch (e) {
        fetchError = e instanceof Error ? e.message : "取得に失敗しました";
      }
    }

    const fetchedByUri = new Map(fetched.map((p) => [p.uri, p]));

    const newEntries: UrlEntry[] = [];
    const successfulInputs = new Set<string>();

    for (const n of normalized) {
      // 同じ入力文字列が既にリストにある場合は二重追加しない
      if (existingInputs.has(n.input)) {
        successfulInputs.add(n.input);
        continue;
      }
      if (!n.atUri) {
        newEntries.push({
          kind: "message",
          input: n.input,
          status: "error",
          message: n.error ?? "解析失敗",
        });
        continue;
      }
      if (existingUris.has(n.atUri)) {
        newEntries.push({
          kind: "message",
          input: n.input,
          status: "skipped",
          message: "取得済み",
        });
        successfulInputs.add(n.input);
        continue;
      }
      if (fetchError) {
        newEntries.push({
          kind: "message",
          input: n.input,
          status: "error",
          message: fetchError,
        });
        continue;
      }
      const post = fetchedByUri.get(n.atUri);
      if (!post) {
        newEntries.push({
          kind: "message",
          input: n.input,
          status: "error",
          message: "投稿が見つかりません",
        });
        continue;
      }
      if (post.author.did !== did) {
        newEntries.push({
          kind: "message",
          input: n.input,
          status: "skipped",
          message: "自分以外の投稿はインポートできません",
        });
        continue;
      }
      // 取得成功した投稿はデフォルトで選択状態にしておく (1 件ずつチェックする
      // 手間を省く。不要なら個別にトグルできる)
      newEntries.push({
        kind: "post",
        input: n.input,
        post: { ...postViewToBskyPost(post), selected: true },
      });
      successfulInputs.add(n.input);
    }

    setUrlEntries((prev) => [...prev, ...newEntries]);
    // 成功したものは入力欄から消し、解決できなかった URL だけ残す
    const remaining = lines.filter((l) => !successfulInputs.has(l));
    setUrlInput(remaining.join("\n"));
    setUrlFetching(false);
  };

  const urlPosts = urlEntries
    .filter((e): e is Extract<UrlEntry, { kind: "post" }> => e.kind === "post")
    .map((e) => e.post);

  const feedSelected = feedPosts.filter((p) => p.selected).length;
  const urlSelected = urlPosts.filter((p) => p.selected).length;
  const totalSelected = feedSelected + urlSelected;

  const handleImport = async () => {
    if (!threadUri) return;
    setImporting(true);
    setError(null);
    try {
      const selected = [...feedPosts, ...urlPosts].filter((p) => p.selected);
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

  const header = (
    <div>
      <h2 className="pr-10 text-xl font-bold text-white">
        Bluesky 投稿からインポート
      </h2>
      <p className="mt-1 text-sm text-white/40">
        チェックポイントとして取り込む投稿を選択してください
      </p>
      <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5">
        <p className="flex items-start gap-2 text-xs text-white/40">
          <InfoIcon className="size-4 shrink-0 text-amber-400/60" />
          インポートした投稿には位置情報は付与されません。元投稿への参照リンクが保持されます。
        </p>
      </div>
      <div className="mt-3 flex gap-1 rounded-xl bg-white/5 p-1">
        <TabButton
          active={mode === "feed"}
          onClick={() => setMode("feed")}
          label="自分のタイムライン"
          count={feedSelected}
        />
        <TabButton
          active={mode === "url"}
          onClick={() => setMode("url")}
          label="URL から"
          count={urlSelected}
        />
      </div>
    </div>
  );

  const footer = (
    <div>
      {error && (
        <div className="mb-3 rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
          {error}
        </div>
      )}
      <button
        onClick={handleImport}
        disabled={importing || totalSelected === 0}
        className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
      >
        {importing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            インポート中...
          </span>
        ) : (
          `選択した投稿をインポート (${totalSelected}件)`
        )}
      </button>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="3xl"
      header={header}
      footer={footer}
    >
      {mode === "url" && (
        <UrlInputSection
          value={urlInput}
          onChange={setUrlInput}
          onFetch={handleFetchByUrls}
          fetching={urlFetching}
        />
      )}

      {mode === "feed" && loading && (
        <div className="flex justify-center py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}

      {mode === "feed" && !loading && feedPosts.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-white/30">投稿が見つかりませんでした</p>
        </div>
      )}

      {mode === "url" && !urlFetching && urlEntries.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm text-white/30">
            URL を貼り付けて「取得」を押してください
          </p>
        </div>
      )}

      {mode === "feed" && (
        <div className="space-y-3">
          {feedPosts.map((post) => (
            <PostSelectCard
              key={post.uri}
              post={post}
              onToggle={() => toggleSelectFeed(post.uri)}
            />
          ))}
        </div>
      )}

      {mode === "url" && (
        <div className="space-y-2">
          {urlEntries.map((entry) =>
            entry.kind === "post" ? (
              <PostSelectCard
                key={entry.input}
                post={entry.post}
                sourceLabel={entry.input}
                onToggle={() => toggleSelectUrl(entry.post.uri)}
                onRemove={() => removeUrlEntry(entry.input)}
              />
            ) : (
              <UrlMessageRow
                key={entry.input}
                input={entry.input}
                status={entry.status}
                message={entry.message}
                onRemove={() => removeUrlEntry(entry.input)}
              />
            ),
          )}
        </div>
      )}

      {mode === "feed" && !loading && feedPosts.length > 0 && hasMore && (
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

      {mode === "feed" && !loading && feedPosts.length > 0 && !hasMore && (
        <p className="mt-4 text-center text-xs text-white/30">
          これ以上の投稿はありません
        </p>
      )}
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
        active
          ? "bg-surface-800 text-white shadow-sm ring-1 ring-white/10"
          : "text-white/50 hover:text-white/80"
      }`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            active
              ? "bg-indigo-500/20 text-indigo-300"
              : "bg-white/10 text-white/60"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function UrlInputSection({
  value,
  onChange,
  onFetch,
  fetching,
}: {
  value: string;
  onChange: (s: string) => void;
  onFetch: () => void;
  fetching: boolean;
}) {
  return (
    <div className="mb-5">
      <label className="mb-1.5 block text-xs font-medium text-white/50">
        Bluesky 投稿の URL（改行区切りで複数可）
      </label>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={"https://bsky.app/profile/.../post/...\nat://did:plc:.../app.bsky.feed.post/..."}
        className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 font-mono text-xs text-white placeholder-white/20 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[11px] text-white/30">
          自分の投稿のみ取得できます。他人の投稿はスキップされます。
        </p>
        <button
          type="button"
          onClick={onFetch}
          disabled={fetching || value.trim().length === 0}
          className="shrink-0 rounded-lg bg-indigo-500/15 px-4 py-2 text-xs font-bold text-indigo-300 transition hover:bg-indigo-500/25 disabled:opacity-40 disabled:pointer-events-none"
        >
          {fetching ? (
            <span className="flex items-center gap-1.5">
              <span className="size-3 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
              取得中...
            </span>
          ) : (
            "取得"
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * 取得済み投稿の選択カード。feed タブと url タブで共通。
 * sourceLabel が渡された場合は元の URL を上部に小さく表示する (URL タブ用)。
 */
function PostSelectCard({
  post,
  sourceLabel,
  onToggle,
  onRemove,
}: {
  post: BskyPost;
  sourceLabel?: string;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`group relative rounded-2xl border transition ${
        post.selected
          ? "border-indigo-500/50 bg-indigo-500/5"
          : "border-white/5 bg-surface-800 hover:border-white/10"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer gap-4 p-4 text-left"
      >
        <div
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
            post.selected ? "bg-indigo-500" : "border border-white/20"
          }`}
        >
          {post.selected && <CheckIcon className="size-3.5 text-white" />}
        </div>
        <div className="min-w-0 flex-1">
          {sourceLabel && (
            <div className="mb-1.5 truncate pr-8 font-mono text-[10px] text-white/30">
              {sourceLabel}
            </div>
          )}
          {post.text && (
            <p className="text-sm leading-relaxed text-white/80">
              {post.text}
            </p>
          )}
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
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="リストから削除"
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full text-white/30 transition hover:bg-white/10 hover:text-white/70"
        >
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      )}
    </div>
  );
}

/**
 * 取得失敗 / スキップを表すコンパクトな行。
 * 統一リストで投稿カードと並べて使う。
 */
function UrlMessageRow({
  input,
  status,
  message,
  onRemove,
}: {
  input: string;
  status: "skipped" | "error";
  message: string;
  onRemove?: () => void;
}) {
  const isError = status === "error";
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] ${
        isError
          ? "bg-red-500/5 text-red-300/80"
          : "bg-white/[0.03] text-white/45"
      }`}
    >
      <span className="font-bold">{isError ? "✗" : "−"}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-white/30">{input}</div>
        <div className="mt-0.5 opacity-90">{message}</div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="リストから削除"
          className="shrink-0 rounded p-0.5 text-white/30 transition hover:bg-white/10 hover:text-white/70"
        >
          <span aria-hidden className="text-sm leading-none">×</span>
        </button>
      )}
    </div>
  );
}
