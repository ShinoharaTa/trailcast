"use client";

import { useEffect } from "react";
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div
        className={`relative my-4 flex w-full ${MAX_W[maxWidth]} max-h-[calc(100dvh-2rem)] flex-col rounded-2xl bg-surface-800 shadow-2xl sm:my-0 sm:max-h-[calc(100dvh-3rem)]`}
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
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8 sm:py-6">
              {children}
            </div>
            {footer && (
              <div className="shrink-0 rounded-b-2xl border-t border-white/5 bg-surface-800 px-6 pb-6 pt-4 sm:px-8 sm:pb-8">
                {footer}
              </div>
            )}
          </>
        ) : (
          <div className="overflow-y-auto overscroll-contain p-6 sm:p-8">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
