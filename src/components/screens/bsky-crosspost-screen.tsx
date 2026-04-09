"use client";

import { useCallback, useEffect, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { getAgent } from "@/lib/atp-agent";
import type { ThreadWithMeta } from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { getThread } from "@/lib/pds/threads";

export function BlueskyCrosspostScreen({ goBack, params }: NavigationProps) {
  const [thread, setThread] = useState<ThreadWithMeta | null>(null);
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadUri = params.threadUri ?? "";

  const load = useCallback(async () => {
    if (!threadUri) return;
    try {
      const { repo, rkey } = parseAtUri(threadUri);
      const t = await getThread(repo, rkey);
      setThread(t);
      const shareUrl = `https://trailcast.shino3.net/thread/${repo}/${rkey}`;
      setPostText(`${t.title}の記録をTrailcastで公開中！\n\n${shareUrl}`);
    } catch (e) {
      console.error("Failed to load thread:", e);
    }
  }, [threadUri]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePost = async () => {
    setPosting(true);
    setError(null);
    try {
      const agent = getAgent();
      const { repo, rkey } = parseAtUri(threadUri);
      const shareUrl = `https://trailcast.shino3.net/thread/${repo}/${rkey}`;
      const urlStart = postText.indexOf(shareUrl);

      const facets =
        urlStart >= 0
          ? [
              {
                index: {
                  byteStart: new TextEncoder().encode(
                    postText.slice(0, urlStart),
                  ).length,
                  byteEnd: new TextEncoder().encode(
                    postText.slice(0, urlStart + shareUrl.length),
                  ).length,
                },
                features: [
                  {
                    $type: "app.bsky.richtext.facet#link",
                    uri: shareUrl,
                  },
                ],
              },
            ]
          : undefined;

      await agent.post({
        text: postText,
        facets,
        createdAt: new Date().toISOString(),
      });
      setPosted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿に失敗しました");
      setPosting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <BackButton onClick={goBack} label="スレッドに戻る" className="mb-6" />
      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-5 text-lg font-bold text-white">Bluesky に共有</h2>

        {posted ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-500/20">
              <svg className="size-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-white/80">投稿しました！</p>
            <button onClick={goBack} className="mt-4 text-sm text-indigo-400 hover:underline">
              スレッドに戻る
            </button>
          </div>
        ) : (
          <>
            <textarea
              rows={4}
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              className="mb-4 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />

            {thread && (
              <div className="mb-5 overflow-hidden rounded-xl border border-white/10">
                <div className="bg-surface-700 p-3">
                  <p className="text-[11px] text-white/30">trailcast.shino3.net</p>
                  <p className="mt-0.5 text-sm font-semibold text-white/90">{thread.title}</p>
                  {thread.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-white/40">{thread.description}</p>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handlePost}
              disabled={posting || !postText.trim()}
              className="w-full rounded-xl bg-[#0085ff] py-3 text-sm font-bold text-white shadow-lg shadow-[#0085ff]/25 transition hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
            >
              {posting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  投稿中...
                </span>
              ) : (
                "投稿する"
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
