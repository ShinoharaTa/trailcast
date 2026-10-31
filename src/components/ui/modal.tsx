"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/ui/icons";

type MaxWidth = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

const MAX_W: Record<MaxWidth, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
};

interface VisualViewportBox {
  height: number;
  offsetTop: number;
}

/**
 * visualViewport の高さと上端オフセットを追従する。
 * iOS Safari ではキーボード表示時に fixed 要素が visual viewport に追従しないため、
 * overlay の top / height をこの値に合わせる。SSR や未対応環境では null。
 */
function useVisualViewport(enabled: boolean): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setBox({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return box;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * 上部に固定表示する領域。
   * 渡すと "Scrollable Modal" レイアウト (header / scroll body / footer の
   * 3 段 flex 構造) になり、本体のみがスクロールする。
   */
  header?: React.ReactNode;
  /** 下部に固定表示する領域。例: 主要アクションボタン。 */
  footer?: React.ReactNode;
  maxWidth?: MaxWidth;
  ariaLabel?: string;
}

export function Modal({
  open,
  onClose,
  children,
  header,
  footer,
  maxWidth = "lg",
  ariaLabel,
}: ModalProps) {
  const viewport = useVisualViewport(open);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const hasRegions = Boolean(header || footer);

  // 最後の領域 (footer か本文) にだけ、ホームインジケータを避ける下余白を付ける。
  const safeBottom = "pb-[max(--spacing(6),env(safe-area-inset-bottom))] sm:pb-8";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={
        viewport
          ? {
              // iOS で挙動が怪しければ top: 0 に切り替える
              top: viewport.offsetTop,
              height: viewport.height,
              "--modal-vh": `${viewport.height}px`,
            } as React.CSSProperties
          : undefined
      }
      className={`fixed inset-x-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6 ${viewport ? "" : "top-0 h-[100dvh]"}`}
    >
      <div
        className={`relative flex w-full ${MAX_W[maxWidth]} flex-col rounded-2xl bg-surface-800 shadow-2xl ${
          viewport
            ? // overlay の padding (p-3 / sm:p-6) 分を差し引く
              "max-h-[calc(var(--modal-vh)-1.5rem)] sm:max-h-[calc(var(--modal-vh)-3rem)]"
            : "max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)]"
        }`}
      >
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="absolute right-3 top-3 z-20 flex size-9 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          type="button"
        >
          <CloseIcon className="size-5" />
        </button>

        {hasRegions ? (
          <>
            {header && (
              <div className="shrink-0 rounded-t-2xl border-b border-white/5 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
                {header}
              </div>
            )}
            <div
              className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-5 sm:px-8 sm:pt-6 ${
                footer ? "pb-5 sm:pb-6" : safeBottom
              }`}
            >
              {children}
            </div>
            {footer && (
              <div
                className={`shrink-0 rounded-b-2xl border-t border-white/5 bg-surface-800 px-6 pt-4 sm:px-8 ${safeBottom}`}
              >
                {footer}
              </div>
            )}
          </>
        ) : (
          <div
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 sm:px-8 sm:pt-8 ${safeBottom}`}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
