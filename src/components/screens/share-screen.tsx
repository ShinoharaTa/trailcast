"use client";

import { useCallback, useEffect, useState } from "react";
import { getAbsoluteUrl } from "@/lib/app-routes";
import type { ThreadWithMeta } from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { getThread } from "@/lib/pds/threads";

export interface ShareScreenProps {
  threadUri: string;
}

export function ShareScreen({ threadUri }: ShareScreenProps) {
  const [thread, setThread] = useState<ThreadWithMeta | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!threadUri) return;
    try {
      const { repo, rkey } = parseAtUri(threadUri);
      const t = await getThread(repo, rkey);
      setThread(t);
    } catch (e) {
      console.error("Failed to load thread:", e);
    }
  }, [threadUri]);

  useEffect(() => {
    load();
  }, [load]);

  const shareUrl = threadUri
    ? getAbsoluteUrl("thread-detail", { threadUri }, "https://trailcast.shino3.net")
    : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <>
      <h2 className="mb-5 pr-10 text-lg font-bold text-white">スレッドを共有</h2>
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">
            共有リンク
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <span className="flex-1 truncate px-3 text-xs text-white/50">
              {shareUrl}
            </span>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400"
            >
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
        </div>

        {thread && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              プレビュー
            </label>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="flex h-24 items-center justify-center bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
                <span className="text-4xl font-bold text-white/10">
                  {thread.title.charAt(0)}
                </span>
              </div>
              <div className="bg-surface-700 p-3">
                <p className="text-[11px] text-white/30">trailcast.shino3.net</p>
                <p className="mt-0.5 text-sm font-semibold text-white/90">
                  {thread.title}
                </p>
                {thread.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-white/40">
                    {thread.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
