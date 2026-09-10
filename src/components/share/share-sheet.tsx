"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BlueskyIcon,
  CheckIcon,
  CopyIcon,
  EllipsisIcon,
  FacebookIcon,
  LineIcon,
  NoteIcon,
  ThreadsIcon,
  XIcon,
} from "@/components/ui/icons";

/**
 * 共有シート。スレッドでもプロフィールでも同じ体験にしたいので、
 * 「何を共有するか」だけ受け取って中身は共通にしてある。
 * 読み込みや URL の組み立ては呼び出し側 (share-screen / profile-share-screen) の担当。
 */
export interface ShareSheetProps {
  /** 見出し。例: 「スレッドを共有」 */
  heading: string;
  /** 共有する絶対 URL */
  url: string;
  /** 各 SNS の本文に載せる名前 (スレッドのタイトル / 表示名) */
  title: string;
  /** OGP カード風のプレビュー。無ければセクションごと出さない */
  preview?: React.ReactNode;
}

interface ShareButtonSpec {
  id: string;
  label: string;
  onClick: () => void;
  /** 円の背景色 (brand color) */
  bg: string;
  /** 円内のテキスト色 */
  fg: string;
  /** アクセシビリティ用のリンクタイトル */
  ariaLabel: string;
  icon: React.ReactNode;
  /**
   * アイコン内部の縮尺 (1 = 等倍)。
   * SVG ごとに viewBox 内の占有率が違うので、見た目の大きさを揃えるための調整値。
   */
  iconScale?: number;
}

/** 新規タブで intent URL を開く小ヘルパー */
function openWindow(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function ShareSheet({ heading, url, title, preview }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    // Web Share API は https + 対応ブラウザ (主にモバイル Safari / Chrome) のみ有効
    setCanNativeShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  const shareText = useMemo(
    () => (title ? `${title}\n${url}` : url),
    [title, url],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  }, [url]);

  const handleNativeShare = useCallback(async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ title, text: title, url });
    } catch (e) {
      // ユーザーのキャンセルは AbortError。握りつぶす。
      if ((e as DOMException).name !== "AbortError") {
        console.error("Native share failed:", e);
      }
    }
  }, [title, url]);

  const buttons: ShareButtonSpec[] = useMemo(() => {
    const list: ShareButtonSpec[] = [
      {
        id: "bluesky",
        label: "Bluesky",
        ariaLabel: "Bluesky で共有",
        // ref: https://docs.bsky.app/docs/advanced-guides/intent-links
        onClick: () =>
          openWindow(
            `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`,
          ),
        bg: "bg-[#0085ff]",
        fg: "text-white",
        icon: <BlueskyIcon className="size-6" />,
      },
      {
        id: "threads",
        label: "Threads",
        ariaLabel: "Threads で共有",
        // Threads の intent URL。text のみ受ける (URL は本文に含める)
        onClick: () =>
          openWindow(
            `https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`,
          ),
        bg: "bg-black",
        fg: "text-white",
        icon: <ThreadsIcon className="size-6" />,
      },
      {
        id: "x",
        label: "X",
        ariaLabel: "X で共有",
        onClick: () =>
          openWindow(
            `https://x.com/intent/post?text=${encodeURIComponent(
              title,
            )}&url=${encodeURIComponent(url)}`,
          ),
        bg: "bg-black",
        fg: "text-white",
        icon: <XIcon className="size-5" />,
      },
      {
        id: "facebook",
        label: "Facebook",
        ariaLabel: "Facebook で共有",
        // Facebook は URL のみ受け付ける (本文は OGP / ユーザー入力で構成される)
        onClick: () =>
          openWindow(
            `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
          ),
        bg: "bg-[#1877f2]",
        fg: "text-white",
        icon: <FacebookIcon className="size-6" />,
      },
      {
        id: "line",
        label: "LINE",
        ariaLabel: "LINE で共有",
        // ref: https://developers.line.biz/en/docs/line-social-plugins/using-line-social-plugins/
        onClick: () =>
          openWindow(
            `https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`,
          ),
        bg: "bg-[#06c755]",
        fg: "text-white",
        icon: <LineIcon className="size-6" />,
      },
      {
        id: "note",
        label: "note",
        ariaLabel: "note で書く",
        // note.com の公式 intent URL。URL を渡すと「noteで書く」で引用を添えた編集画面が開く
        // ref: https://help.note.com/hc/ja/articles/360000272622
        onClick: () =>
          openWindow(
            `https://note.com/intent/post?url=${encodeURIComponent(url)}`,
          ),
        // note は白背景に黒のロゴが公式仕様。ring で輪郭を補強する
        bg: "bg-white",
        fg: "text-black",
        icon: <NoteIcon className="size-6" />,
        iconScale: 0.8,
      },
      {
        id: "copy",
        label: copied ? "コピー済" : "リンク",
        ariaLabel: "リンクをコピー",
        onClick: handleCopy,
        bg: "bg-white/10",
        fg: "text-white",
        icon: copied ? (
          <CheckIcon className="size-5" />
        ) : (
          <CopyIcon className="size-5" />
        ),
      },
    ];
    if (canNativeShare) {
      list.push({
        id: "more",
        label: "その他",
        ariaLabel: "その他のアプリで共有",
        onClick: handleNativeShare,
        bg: "bg-white/10",
        fg: "text-white",
        icon: <EllipsisIcon className="size-6" />,
      });
    }
    return list;
  }, [
    shareText,
    url,
    title,
    copied,
    canNativeShare,
    handleCopy,
    handleNativeShare,
  ]);

  return (
    <>
      <h2 className="mb-5 pr-10 text-lg font-bold text-white">{heading}</h2>

      <div className="space-y-6">
        {/* 共有アクション (ブランドごとの円ボタン) */}
        <div
          role="list"
          aria-label="共有先"
          className="flex flex-wrap items-start gap-x-4 gap-y-3 sm:gap-x-6"
        >
          {buttons.map((b) => (
            <button
              key={b.id}
              type="button"
              role="listitem"
              aria-label={b.ariaLabel}
              onClick={b.onClick}
              className="group flex w-[64px] flex-col items-center gap-1.5 transition hover:-translate-y-0.5"
            >
              <span
                className={`flex size-12 items-center justify-center rounded-full shadow-md ring-1 ring-white/10 transition group-hover:brightness-110 group-active:scale-95 ${b.bg} ${b.fg}`}
              >
                {b.iconScale && b.iconScale !== 1 ? (
                  <span
                    className="flex items-center justify-center"
                    style={{ transform: `scale(${b.iconScale})` }}
                  >
                    {b.icon}
                  </span>
                ) : (
                  b.icon
                )}
              </span>
              <span className="text-[11px] font-medium text-white/70">
                {b.label}
              </span>
            </button>
          ))}
        </div>

        {/* 共有 URL */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">
            共有リンク
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <span className="flex-1 truncate px-3 text-xs text-white/50">
              {url}
            </span>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400"
            >
              {copied ? "コピーしました" : "コピー"}
            </button>
          </div>
        </div>

        {/* プレビュー */}
        {preview && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              プレビュー
            </label>
            {preview}
          </div>
        )}
      </div>
    </>
  );
}
