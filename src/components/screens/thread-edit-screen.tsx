"use client";

import { useRef, useState } from "react";
import type { BlobRef } from "@atproto/api";
import { PhotoIcon, TrashIcon } from "@/components/ui/icons";
import { updateThread } from "@/lib/pds/threads";
import { uploadImage } from "@/lib/pds/posts";
import { processCoverImage } from "@/lib/image-processing";
import {
  parseAtUri,
  type ThreadSortOrder,
  type ThreadWithMeta,
} from "@/lib/types";
import { useBlobUrl } from "@/components/ui/blob-image";

export interface ThreadEditScreenProps {
  thread: ThreadWithMeta;
  onSubmitted: () => void;
  onCancel: () => void;
  onRequestDelete?: () => void;
}

export function ThreadEditScreen({
  thread,
  onSubmitted,
  onCancel,
  onRequestDelete,
}: ThreadEditScreenProps) {
  const [title, setTitle] = useState(thread.title);
  const [description, setDescription] = useState(thread.description ?? "");
  const [visibility, setVisibility] = useState<"private" | "public">(
    thread.visibility,
  );
  // 既存レコードに sortOrder が無い場合は "asc" として扱う。
  const [sortOrder, setSortOrder] = useState<ThreadSortOrder>(
    thread.sortOrder === "desc" ? "desc" : "asc",
  );

  // カバー画像の状態: 既存維持 / 新規選択 / 削除
  const threadDid = parseAtUri(thread.uri).repo;
  const initialCoverUrl = useBlobUrl(threadDid, thread.coverImage);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表示用プレビュー URL: 新規選択 > 削除済みで無し > 既存
  const displayCoverUrl = coverFile
    ? coverPreview
    : coverRemoved
      ? null
      : initialCoverUrl;

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setCoverRemoved(false);
  };

  const handleRemoveCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
    setCoverRemoved(true);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let coverImage: BlobRef | undefined;
      let coverBlob: Blob | null = null;
      if (coverFile) {
        const processed = await processCoverImage(coverFile);
        coverImage = await uploadImage(processed.bytes, processed.mimeType);
        coverBlob = processed.blob;
      } else if (coverRemoved) {
        coverImage = undefined;
      } else {
        coverImage = thread.coverImage;
      }
      await updateThread(
        thread.rkey,
        {
          title: title.trim(),
          description: description.trim() || undefined,
          visibility,
          coverImage,
          createdAt: thread.createdAt,
          // デフォルト (asc) のときはあえて値を残し、明示しなくても正しく動作させる。
          sortOrder: sortOrder === "desc" ? "desc" : undefined,
        },
        { coverBlob },
      );
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
      setSubmitting(false);
    }
  };

  const initialSortOrder: ThreadSortOrder =
    thread.sortOrder === "desc" ? "desc" : "asc";
  const dirty =
    title.trim() !== thread.title ||
    (description.trim() || undefined) !== thread.description ||
    visibility !== thread.visibility ||
    sortOrder !== initialSortOrder ||
    coverFile !== null ||
    coverRemoved;

  return (
    <div>
      <h2 className="mb-6 pr-10 text-xl font-bold text-white">
        スレッド情報を編集
      </h2>
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">
            タイトル
          </label>
          <input
            type="text"
            placeholder="例: 京都日帰り旅"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">
            概要
          </label>
          <textarea
            rows={3}
            placeholder="どんなスレッド？"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div>
            <div className="text-sm text-white/70">公開設定</div>
            <div className="text-[11px] text-white/40">
              {visibility === "public"
                ? "誰でも閲覧できます"
                : "自分だけが閲覧できます"}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setVisibility((v) => (v === "private" ? "public" : "private"))
            }
            className="flex items-center gap-2"
          >
            <span className="text-xs text-white/40">
              {visibility === "private" ? "Private" : "Public"}
            </span>
            <div
              className={`relative h-6 w-11 rounded-full p-0.5 transition ${
                visibility === "public" ? "bg-emerald-500" : "bg-surface-700"
              }`}
            >
              <div
                className={`size-5 rounded-full bg-white shadow transition-transform ${
                  visibility === "public" ? "translate-x-5" : ""
                }`}
              />
            </div>
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm text-white/70">
                チェックポイントの並び順
              </div>
              <div className="text-[11px] text-white/40">
                {sortOrder === "desc"
                  ? "新しいものが上に表示されます"
                  : "古いものが上に表示されます (デフォルト)"}
              </div>
            </div>
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="並び順">
            <button
              type="button"
              role="radio"
              aria-checked={sortOrder === "asc"}
              onClick={() => setSortOrder("asc")}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                sortOrder === "asc"
                  ? "border-indigo-400/60 bg-indigo-500/15 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/5"
              }`}
            >
              古い順 (昇順)
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={sortOrder === "desc"}
              onClick={() => setSortOrder("desc")}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                sortOrder === "desc"
                  ? "border-indigo-400/60 bg-indigo-500/15 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/5"
              }`}
            >
              新しい順 (降順)
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">
            カバー画像
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className="group relative flex aspect-[3/1] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] transition hover:border-indigo-400/40"
          >
            {displayCoverUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayCoverUrl}
                  alt="cover"
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 transition group-hover:opacity-100" />
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-white/90 opacity-0 transition group-hover:opacity-100">
                  クリックして変更
                </span>
              </>
            ) : (
              <div className="text-center">
                <PhotoIcon className="mx-auto size-8 text-white/20" />
                <span className="mt-2 block text-xs text-white/30">
                  カバー画像を選択
                </span>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverSelect}
            />
          </div>
          {displayCoverUrl && (
            <button
              type="button"
              onClick={handleRemoveCover}
              className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/50 transition hover:bg-red-500/10 hover:text-red-400"
            >
              <TrashIcon className="size-3" />
              画像を削除
            </button>
          )}
        </div>

        {onRequestDelete && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-400/80">
              危険な操作
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-white/50">
                スレッドを削除すると、紐づくチェックポイントもすべて削除されます。この操作は元に戻せません。
              </p>
              <button
                type="button"
                onClick={onRequestDelete}
                className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
              >
                <span className="flex items-center gap-1.5">
                  <TrashIcon className="size-3.5" />
                  スレッドを削除
                </span>
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !dirty}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                保存中...
              </span>
            ) : (
              "保存"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
