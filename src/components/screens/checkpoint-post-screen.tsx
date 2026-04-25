"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon, PinIcon, CloseIcon } from "@/components/ui/icons";
import { createPost, uploadImage } from "@/lib/pds/posts";
import { getAgent } from "@/lib/atp-agent";
import { processSelectedImage, type PreparedImage } from "@/lib/image-process";
import { buildCrosspostText, buildEmbedImages } from "@/lib/bsky-crosspost";
import { useAuthStore } from "@/lib/stores/auth-store";
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
  /** Bluesky 同時投稿のテキストとリンク URL を組み立てるのに使う */
  threadTitle: string;
  onSubmitted: () => void;
}

export function CheckpointPostScreen({
  threadUri,
  threadTitle,
  onSubmitted,
}: CheckpointPostScreenProps) {
  const handle = useAuthStore((s) => s.handle);
  const [text, setText] = useState("");
  // 画像は選択直後に「縮小 + 圧縮 + EXIF 抽出」まで完了させた状態で保持する。
  // 元 File への参照は保持しない (iOS Safari での NotReadableError 回避のため)。
  // previewUrl は画像追加時に 1 回だけ作り、削除時 / アンマウント時に revoke する。
  const [images, setImages] = useState<
    Array<PreparedImage & { previewUrl: string }>
  >([]);
  const [processing, setProcessing] = useState(false);
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // アンマウント時に残っているプレビュー URL を確実に revoke するため、
  // 最新の images を ref に同期しておく。
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => {
    return () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.previewUrl);
    };
  }, []);

  const handleCrosspostChange = (value: boolean) => {
    setCrosspostToBsky(value);
    saveCrosspostPref(value);
  };

  const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    const remaining = MAX_IMAGES - images.length;
    const accepted = newFiles.slice(0, Math.max(0, remaining));
    if (accepted.length === 0) return;

    setProcessing(true);
    setError(null);
    try {
      // 1 枚ずつ順番に処理することで iOS のメモリ圧迫を避ける。
      // 失敗した 1 枚があっても他の枚は採用する。
      const prepared: Array<PreparedImage & { previewUrl: string }> = [];
      let lastError: unknown = null;
      for (const f of accepted) {
        try {
          const p = await processSelectedImage(f);
          prepared.push({ ...p, previewUrl: URL.createObjectURL(p.blob) });
        } catch (err) {
          lastError = err;
        }
      }
      if (prepared.length === 0) {
        setError(
          lastError instanceof Error
            ? `画像を読み込めませんでした: ${lastError.message}`
            : "画像を読み込めませんでした",
        );
        return;
      }
      if (lastError) {
        setError("一部の画像を読み込めませんでした");
      }

      setImages((prev) => [...prev, ...prepared]);

      // ユーザーがまだ時刻を編集していない場合、追加された写真の中で
      // 最も古い撮影日時を自動で適用する。
      const valid = prepared
        .map((p) => p.timestamp)
        .filter((d): d is Date => d !== null);
      if (valid.length === 0) return;
      const earliest = valid.reduce((a, b) =>
        a.getTime() < b.getTime() ? a : b,
      );
      setTimeMode((mode) => {
        if (mode === "auto") {
          setCheckpointAt(earliest);
          return "manual";
        }
        return mode;
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveImage = (idx: number) => {
    setImages((prev) => {
      const removed = prev[idx];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
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
      // 画像はすでに縮小 + 圧縮済みの Blob を保持しているのでそのままアップロード。
      const blobs = await Promise.all(
        images.map(async (img) => {
          const buf = new Uint8Array(await img.blob.arrayBuffer());
          return uploadImage(buf, img.type);
        }),
      );

      // Bluesky にも投稿する場合は先に Bluesky 側を作成し、その URI を
      // チェックポイントの sourceRef に記録する（後で「元投稿から再取得」が効く）。
      // 画像は PDS にアップ済みの BlobRef をそのまま再利用し、aspectRatio には
      // 縮小後の幅・高さをそのまま入れる。テキストは仕様どおりのテンプレ + facets。
      let sourceRef: string | undefined;
      if (crosspostToBsky) {
        const agent = getAgent();
        const embed = buildEmbedImages(
          blobs.map((blob, i) => ({
            blob,
            width: images[i]?.width ?? 1,
            height: images[i]?.height ?? 1,
          })),
        );
        const effectiveHandle =
          handle ?? agent.session?.handle ?? agent.session?.did ?? "";
        const { text: bskyText, facets } = buildCrosspostText({
          title: threadTitle,
          handle: effectiveHandle,
          threadUri,
          body: text,
        });
        const res = await agent.post({
          text: bskyText,
          facets,
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

  const hasContent = text.trim().length > 0 || images.length > 0;

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
            {images.map((img, i) => (
              <div
                key={img.previewUrl}
                className="group relative aspect-square overflow-hidden rounded-xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveImage(i)}
                  aria-label={`写真${i + 1}を削除`}
                  // モバイル / タブレット (md 未満) では常時表示。md 以上ではホバー時に表示。
                  className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/70 text-white shadow-sm ring-1 ring-white/15 transition md:size-5 md:opacity-0 md:group-hover:opacity-100"
                >
                  <CloseIcon className="size-3" />
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={processing}
                className="flex aspect-square cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] transition hover:border-indigo-400/40 disabled:cursor-wait disabled:opacity-50"
              >
                {processing ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
                ) : (
                  <PlusIcon
                    className="size-6 text-white/15"
                    strokeWidth={1.5}
                  />
                )}
              </button>
            )}
          </div>
          {processing && (
            <p className="mt-1 text-[11px] text-white/30">画像を処理中…</p>
          )}
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
          {images.some((img) => img.timestamp !== null) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {images.map((img, i) =>
                img.timestamp ? (
                  <button
                    key={img.previewUrl}
                    type="button"
                    onClick={() => handleApplyPhotoTime(img.timestamp!)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      img.timestamp.getTime() === checkpointAt.getTime()
                        ? "bg-indigo-500/20 text-indigo-200"
                        : "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
                    }`}
                  >
                    写真{i + 1}の時刻: {formatShort(img.timestamp)}
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
          disabled={submitting || processing || !hasContent}
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
