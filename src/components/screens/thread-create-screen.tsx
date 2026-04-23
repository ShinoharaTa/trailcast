"use client";

import { useRef, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { PhotoIcon } from "@/components/ui/icons";
import { createThread } from "@/lib/pds/threads";
import { uploadImage } from "@/lib/pds/posts";
import { processCoverImage } from "@/lib/image-processing";

export function ThreadCreateScreen({ navigate, goBack }: NavigationProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let coverImage = undefined;
      if (coverFile) {
        const processed = await processCoverImage(coverFile);
        coverImage = await uploadImage(processed.bytes, processed.mimeType);
      }
      const thread = await createThread({
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
        coverImage,
        createdAt: new Date().toISOString(),
      });
      // 作成後に戻る操作で "/thread/new" に戻らないよう replace
      navigate("thread-detail", { threadUri: thread.uri }, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackButton onClick={goBack} className="mb-6" />
      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-6 text-xl font-bold text-white">
          新しいスレッドを作成
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
            <span className="text-sm text-white/70">公開設定</span>
            <button
              onClick={() =>
                setVisibility((v) =>
                  v === "private" ? "public" : "private",
                )
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
          <div
            onClick={() => fileRef.current?.click()}
            className="flex aspect-[3/1] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] transition hover:border-indigo-400/40"
          >
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverPreview}
                alt="cover"
                className="h-full w-full object-cover"
              />
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

          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                作成中...
              </span>
            ) : (
              "作成"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
