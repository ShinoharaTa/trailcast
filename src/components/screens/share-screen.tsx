"use client";

import { useCallback, useEffect, useState } from "react";
import { getAbsoluteUrl } from "@/lib/app-routes";
import type { ThreadWithMeta } from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { getThread } from "@/lib/pds/threads";
import { useBlobUrl } from "@/components/ui/blob-image";
import { ShareSheet } from "@/components/share/share-sheet";

export interface ShareScreenProps {
  threadUri: string;
}

/**
 * スレッドの共有モーダル。共有 UI 自体は ShareSheet と共通で、
 * ここはスレッドの読み込みと URL / プレビューの組み立てだけを担当する。
 */
export function ShareScreen({ threadUri }: ShareScreenProps) {
  const [thread, setThread] = useState<ThreadWithMeta | null>(null);

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
    ? getAbsoluteUrl(
        "thread-detail",
        { threadUri },
        "https://trailcast.shino3.net",
      )
    : "";

  const threadDid = thread ? parseAtUri(thread.uri).repo : null;
  const coverUrl = useBlobUrl(threadDid, thread?.coverImage);

  return (
    <ShareSheet
      heading="スレッドを共有"
      url={shareUrl}
      title={thread?.title ?? ""}
      preview={
        thread ? (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="aspect-[3/1] bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-4xl font-bold text-white/10">
                    {thread.title.charAt(0)}
                  </span>
                </div>
              )}
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
        ) : undefined
      }
    />
  );
}
