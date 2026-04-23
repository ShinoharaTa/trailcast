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
  maxWidth?: MaxWidth;
  ariaLabel?: string;
}

export function Modal({
  open,
  onClose,
  children,
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
        className={`relative my-4 w-full ${MAX_W[maxWidth]} rounded-2xl bg-surface-800 shadow-2xl sm:my-0`}
      >
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          type="button"
        >
          <CloseIcon className="size-5" />
        </button>
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain p-6 sm:max-h-[calc(100dvh-3rem)] sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
