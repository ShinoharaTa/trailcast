"use client";

import { useRef, useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { PlusIcon, PinIcon, CloseIcon } from "@/components/ui/icons";
import { createPost, uploadImage } from "@/lib/pds/posts";
import type { Location } from "@/lib/types";

const MAX_IMAGES = 4;
const MAX_TEXT = 200;

export function CheckpointPostScreen({ goBack, params }: NavigationProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [locationOn, setLocationOn] = useState(true);
  const [location, setLocation] = useState<Location | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const threadUri = params.threadUri ?? "";

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    const combined = [...files, ...newFiles].slice(0, MAX_IMAGES);
    setFiles(combined);
    setPreviews(combined.map((f) => URL.createObjectURL(f)));
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleRemoveImage = (idx: number) => {
    const newFiles = files.filter((_, i) => i !== idx);
    setFiles(newFiles);
    setPreviews(newFiles.map((f) => URL.createObjectURL(f)));
  };

  const handleToggleLocation = async () => {
    if (locationOn) {
      setLocationOn(false);
      setLocation(null);
      return;
    }
    setLocationOn(true);
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        }),
      );
      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        altitude: pos.coords.altitude ?? undefined,
      });
    } catch {
      setLocation(null);
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = async () => {
    if (!threadUri) return;
    setSubmitting(true);
    setError(null);
    try {
      const blobs = await Promise.all(
        files.map(async (f) => {
          const buf = new Uint8Array(await f.arrayBuffer());
          return uploadImage(buf, f.type);
        }),
      );

      const now = new Date().toISOString();
      await createPost({
        thread: threadUri,
        text: text.trim() || undefined,
        images: blobs.length > 0 ? blobs : undefined,
        location: locationOn && location ? location : undefined,
        checkpointAt: now,
        createdAt: now,
      });
      goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿に失敗しました");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackButton onClick={goBack} label="スレッドに戻る" className="mb-6" />
      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-6 text-lg font-bold text-white">
          チェックポイントを追加
        </h2>
        <div className="space-y-5">
          <div className="relative">
            <textarea
              rows={4}
              placeholder="何があった？"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
            <span className="absolute bottom-3 right-3 text-xs text-white/20">
              {text.length}/{MAX_TEXT}
            </span>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-white/50">
              写真（最大{MAX_IMAGES}枚）
            </label>
            <div className="grid grid-cols-4 gap-2">
              {previews.map((url, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => handleRemoveImage(i)}
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <CloseIcon className="size-3" />
                  </button>
                </div>
              ))}
              {files.length < MAX_IMAGES && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] transition hover:border-indigo-400/40"
                >
                  <PlusIcon className="size-6 text-white/15" strokeWidth={1.5} />
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddImages}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleLocation}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                locationOn
                  ? "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              <PinIcon className="size-3.5" />
              {locating ? "取得中..." : locationOn ? "位置情報 ON" : "位置情報 OFF"}
            </button>
            {location && (
              <span className="text-xs text-white/30">
                {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
              </span>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || (!text.trim() && files.length === 0)}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                投稿中...
              </span>
            ) : (
              "投稿する"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
