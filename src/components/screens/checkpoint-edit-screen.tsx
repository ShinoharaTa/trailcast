"use client";

import { useState } from "react";
import { PinIcon, CloseIcon } from "@/components/ui/icons";
import type { PostWithMeta, Location } from "@/lib/types";
import { parseAtUri } from "@/lib/types";
import { updatePost } from "@/lib/pds/posts";
import { BlobImage } from "@/components/ui/blob-image";

const MAX_TEXT = 200;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate(),
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export interface CheckpointEditScreenProps {
  post: PostWithMeta;
  onSubmitted: () => void;
  onCancel: () => void;
}

export function CheckpointEditScreen({
  post,
  onSubmitted,
  onCancel,
}: CheckpointEditScreenProps) {
  const [text, setText] = useState(post.text ?? "");
  const [checkpointAt, setCheckpointAt] = useState(post.checkpointAt);
  const [location, setLocation] = useState<Location | null>(post.location ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
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
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      setSaving(false);
    }
  };

  const postDid = parseAtUri(post.uri).repo;
  const images = post.images ?? [];

  return (
    <>
      <h2 className="mb-6 pr-10 text-lg font-bold text-white">チェックポイントを編集</h2>
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">
            チェックポイント時刻
          </label>
          <input
            type="datetime-local"
            value={toLocalInput(checkpointAt)}
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

        {images.length > 0 && (
          <div>
            <label className="mb-2 block text-xs font-medium text-white/50">写真</label>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={i} className="overflow-hidden rounded-xl">
                  <BlobImage
                    did={postDid}
                    blobRef={img}
                    alt=""
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
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
            onClick={onCancel}
            className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-white/50 transition hover:bg-white/5"
          >
            キャンセル
          </button>
        </div>
      </div>
    </>
  );
}
