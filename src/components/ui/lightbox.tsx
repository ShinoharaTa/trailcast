"use client";

import { useCallback, useEffect, useState } from "react";
import { CloseIcon } from "@/components/ui/icons";

export interface LightboxProps {
  /** 表示する画像の URL 配列 */
  images: string[];
  /** 初期インデックス (クリックされた画像) */
  initialIndex?: number;
  /** 画像に添える alt テキスト (全画像共通で使う) */
  alt?: string;
  /** 閉じる時のハンドラ */
  onClose: () => void;
}

/**
 * 画像の拡大表示用 Lightbox。
 * - 背景クリック / ESC で閉じる
 * - 矢印キー / 左右ボタンで前後画像を切替 (複数画像時のみ)
 * - 画像は viewport に収まるよう object-contain で表示
 */
export function Lightbox({
  images,
  initialIndex = 0,
  alt = "",
  onClose,
}: LightboxProps) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(initialIndex, images.length - 1)),
  );
  const total = images.length;

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + total) % total);
  }, [total]);
  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % total);
  }, [total]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && total > 1) goPrev();
      else if (e.key === "ArrowRight" && total > 1) goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, goPrev, goNext, total]);

  if (total === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="画像プレビュー"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm"
    >
      <button
        onClick={onClose}
        aria-label="閉じる"
        type="button"
        className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <CloseIcon className="size-5" />
      </button>

      {total > 1 && (
        <>
          <button
            onClick={goPrev}
            aria-label="前の画像"
            type="button"
            className="absolute left-2 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-4 sm:size-12"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="size-5 sm:size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={goNext}
            aria-label="次の画像"
            type="button"
            className="absolute right-2 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-4 sm:size-12"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="size-5 sm:size-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-mono tabular-nums text-white/80">
            {index + 1} / {total}
          </div>
        </>
      )}

      {/* 画像: 余白を入れつつ viewport にフィット */}
      <div
        onClick={onClose}
        className="flex h-full w-full items-center justify-center p-4 sm:p-8"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={images[index]}
          src={images[index]}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full select-none object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
