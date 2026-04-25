"use client";

import { useRef, useState } from "react";
import { PlusIcon, PinIcon, CloseIcon } from "@/components/ui/icons";
import { createPost, uploadImage } from "@/lib/pds/posts";
import { getAgent } from "@/lib/atp-agent";
import { extractPhotoTimestamp } from "@/lib/exif";
import type { Location } from "@/lib/types";

const MAX_IMAGES = 4;
const MAX_TEXT = 200;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// datetime-local の input が要求する "YYYY-MM-DDTHH:MM" 形式 (ローカル時刻)
function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// "MM/DD HH:MM" のコンパクト表示（ボタンラベル用）
function formatShort(date: Date): string {
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

// Bluesky 同時投稿の設定は端末ごとに localStorage で記憶する
const CROSSPOST_PREF_KEY = "trailcast_crosspost_to_bsky";

function loadCrosspostPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CROSSPOST_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

function saveCrosspostPref(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CROSSPOST_PREF_KEY, value ? "true" : "false");
  } catch {
    // quota / denied: silent
  }
}

export interface CheckpointPostScreenProps {
  threadUri: string;
  onSubmitted: () => void;
}

export function CheckpointPostScreen({
  threadUri,
  onSubmitted,
}: CheckpointPostScreenProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [locationOn, setLocationOn] = useState(true);
  const [location, setLocation] = useState<Location | null>(null);
  const [locating, setLocating] = useState(false);
  const [crosspostToBsky, setCrosspostToBsky] = useState<boolean>(
    () => loadCrosspostPref(),
  );
  // チェックポイント時刻。
  // - "auto": ユーザー未編集 → 投稿時に new Date() を使う
  // - "manual": ユーザー編集済み or 写真の EXIF を反映済み → 表示中の値を使う
  const [checkpointAt, setCheckpointAt] = useState<Date>(() => new Date());
  const [timeMode, setTimeMode] = useState<"auto" | "manual">("auto");
  // files と同じインデックスで対応する写真の撮影日時 (EXIF が無い場合は null)
  const [photoTimestamps, setPhotoTimestamps] = useState<(Date | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCrosspostChange = (value: boolean) => {
    setCrosspostToBsky(value);
    saveCrosspostPref(value);
  };

  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    const remaining = MAX_IMAGES - files.length;
    const accepted = newFiles.slice(0, Math.max(0, remaining));
    const combined = [...files, ...accepted];
    setFiles(combined);
    setPreviews(combined.map((f) => URL.createObjectURL(f)));
    if (fileRef.current) fileRef.current.value = "";

    const newStamps = await Promise.all(
      accepted.map((f) => extractPhotoTimestamp(f)),
    );
    setPhotoTimestamps((prev) => [...prev, ...newStamps]);

    // ユーザーがまだ時刻を編集していない場合、追加された写真の中で
    // 最も古い撮影日時を自動で適用する
    const valid = newStamps.filter((d): d is Date => d !== null);
    if (valid.length === 0) return;
    const earliest = valid.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
    setTimeMode((mode) => {
      if (mode === "auto") {
        setCheckpointAt(earliest);
        return "manual";
      }
      return mode;
    });
  };

  const handleRemoveImage = (idx: number) => {
    const newFiles = files.filter((_, i) => i !== idx);
    setFiles(newFiles);
    setPreviews(newFiles.map((f) => URL.createObjectURL(f)));
    setPhotoTimestamps((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleChangeTime = (value: string) => {
    if (!value) return;
    const d = new Date(value);
    if (isNaN(d.getTime())) return;
    setCheckpointAt(d);
    setTimeMode("manual");
  };

  const handleResetTimeToNow = () => {
    setCheckpointAt(new Date());
    setTimeMode("auto");
  };

  const handleApplyPhotoTime = (date: Date) => {
    setCheckpointAt(date);
    setTimeMode("manual");
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

      // Bluesky にも投稿する場合は先に Bluesky 側を作成し、その URI を
      // チェックポイントの sourceRef に記録する（後で「元投稿から再取得」が効く）
      let sourceRef: string | undefined;
      if (crosspostToBsky) {
        const agent = getAgent();
        const embed =
          blobs.length > 0
            ? {
                $type: "app.bsky.embed.images",
                images: blobs.map((blob) => ({ alt: "", image: blob })),
              }
            : undefined;
        const res = await agent.post({
          text: text.trim(),
          embed,
          createdAt: new Date().toISOString(),
        });
        sourceRef = res.uri;
      }

      const createdAt = new Date().toISOString();
      const checkpointIso =
        timeMode === "auto" ? createdAt : checkpointAt.toISOString();
      await createPost({
        thread: threadUri,
        text: text.trim() || undefined,
        images: blobs.length > 0 ? blobs : undefined,
        location: locationOn && location ? location : undefined,
        checkpointAt: checkpointIso,
        sourceRef,
        createdAt,
      });
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿に失敗しました");
      setSubmitting(false);
    }
  };

  const hasContent = text.trim().length > 0 || files.length > 0;

  return (
    <>
      <h2 className="mb-6 pr-10 text-lg font-bold text-white">
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

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-medium text-white/50">
              チェックポイント時刻
            </label>
            {timeMode === "manual" && (
              <button
                type="button"
                onClick={handleResetTimeToNow}
                className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/50 transition hover:bg-white/10"
              >
                現在時刻
              </button>
            )}
          </div>
          <input
            type="datetime-local"
            value={toLocalInput(checkpointAt)}
            onChange={(e) => handleChangeTime(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
          {photoTimestamps.some((d) => d !== null) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {photoTimestamps.map((d, i) =>
                d ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApplyPhotoTime(d)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      d.getTime() === checkpointAt.getTime()
                        ? "bg-indigo-500/20 text-indigo-200"
                        : "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
                    }`}
                  >
                    写真{i + 1}の時刻: {formatShort(d)}
                  </button>
                ) : null,
              )}
            </div>
          )}
          <p className="mt-1 text-[11px] text-white/30">
            {timeMode === "auto"
              ? "未設定の場合は投稿時の現在時刻が使われます"
              : "手動で設定された時刻を使用中"}
          </p>
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

        <label
          className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition ${
            crosspostToBsky
              ? "border-[#0085ff]/40 bg-[#0085ff]/5"
              : "border-white/10 bg-white/5 hover:border-white/15"
          }`}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-sm font-medium text-white/90">
              <span className="text-[#0085ff]">Bluesky</span>
              にも投稿
            </span>
            <span className="text-[11px] text-white/40">
              同じテキストと写真を Bluesky に同時投稿します
            </span>
          </div>
          <input
            type="checkbox"
            checked={crosspostToBsky}
            onChange={(e) => handleCrosspostChange(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={`relative ml-4 h-6 w-11 shrink-0 rounded-full p-0.5 transition ${
              crosspostToBsky ? "bg-[#0085ff]" : "bg-surface-700"
            }`}
          >
            <span
              className={`block size-5 rounded-full bg-white shadow transition-transform ${
                crosspostToBsky ? "translate-x-5" : ""
              }`}
            />
          </span>
        </label>

        {error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || !hasContent}
          className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {crosspostToBsky ? "投稿中（Blueskyにも投稿中）..." : "投稿中..."}
            </span>
          ) : crosspostToBsky ? (
            "投稿する（Blueskyにも）"
          ) : (
            "投稿する"
          )}
        </button>
      </div>
    </>
  );
}
