"use client";

import { useCallback, useEffect, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { PinIcon, CloseIcon } from "@/components/ui/icons";
import type { PostWithMeta, Location } from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { getPost, updatePost } from "@/lib/pds/posts";

const MAX_TEXT = 200;

function blobUrl(uri: string, blobRef: unknown): string | null {
  if (!blobRef || typeof blobRef !== "object") return null;
  const ref = (blobRef as { ref?: { $link?: string } }).ref?.$link;
  if (!ref) return null;
  const did = parseAtUri(uri).repo;
  return `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${ref}`;
}

export function CheckpointEditScreen({ goBack, params }: NavigationProps) {
  const [post, setPost] = useState<PostWithMeta | null>(null);
  const [text, setText] = useState("");
  const [checkpointAt, setCheckpointAt] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const postUri = params.postUri ?? "";

  const load = useCallback(async () => {
    if (!postUri) return;
    setLoading(true);
    try {
      const { repo, rkey } = parseAtUri(postUri);
      const p = await getPost(repo, rkey);
      setPost(p);
      setText(p.text ?? "");
      setCheckpointAt(p.checkpointAt);
      setLocation(p.location ?? null);
    } catch (e) {
      console.error("Failed to load post:", e);
    } finally {
      setLoading(false);
    }
  }, [postUri]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!post) return;
    setSaving(true);
    setError(null);
    try {
      await updatePost(post.rkey, {
        thread: post.thread,
        text: text.trim() || undefined,
        images: post.images,
        location: location ?? undefined,
        checkpointAt: checkpointAt || post.checkpointAt,
        exif: post.exif,
        sourceRef: post.sourceRef,
        createdAt: post.createdAt,
      });
      goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-white/40">投稿が見つかりません</p>
        <button onClick={goBack} className="text-sm text-indigo-400 hover:underline">戻る</button>
      </div>
    );
  }

  const imageUrls = (post.images ?? [])
    .map((img) => blobUrl(post.uri, img))
    .filter(Boolean) as string[];

  const formatForInput = (dt: string): string => {
    try {
      const d = new Date(dt);
      return d.toISOString().slice(0, 16);
    } catch {
      return "";
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackButton onClick={goBack} label="スレッドに戻る" className="mb-6" />
      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-6 text-lg font-bold text-white">チェックポイントを編集</h2>
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              チェックポイント時刻
            </label>
            <input
              type="datetime-local"
              value={formatForInput(checkpointAt)}
              onChange={(e) => {
                const d = new Date(e.target.value);
                if (!isNaN(d.getTime())) setCheckpointAt(d.toISOString());
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            />
          </div>

          <div className="relative">
            <label className="mb-1.5 block text-xs font-medium text-white/50">テキスト</label>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
            <span className="absolute bottom-3 right-3 text-xs text-white/20">
              {text.length}/{MAX_TEXT}
            </span>
          </div>

          {imageUrls.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-medium text-white/50">写真</label>
              <div className="grid grid-cols-3 gap-2">
                {imageUrls.map((url, i) => (
                  <div key={i} className="overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {location && (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <PinIcon className="size-4 text-indigo-400" />
                <span className="text-sm text-white/70">
                  {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                </span>
              </div>
              <button
                onClick={() => setLocation(null)}
                className="rounded-full p-1.5 text-white/30 transition hover:bg-red-500/10 hover:text-red-400"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
            <button
              onClick={goBack}
              className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-white/50 transition hover:bg-white/5"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
