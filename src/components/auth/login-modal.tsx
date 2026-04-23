"use client";

import { Modal } from "@/components/ui/modal";
import { LoginForm } from "@/components/auth/login-form";
import { MapIcon } from "@/components/ui/icons";

export interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="sm" ariaLabel="ログイン">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
          <MapIcon className="size-6 text-white" />
        </div>
        <h2 className="text-lg font-bold text-white">ログイン</h2>
        <p className="mt-1 text-xs text-white/50">
          Bluesky アカウントで Trailcast を使い始めましょう
        </p>
      </div>
      <div className="mt-6 text-left">
        <LoginForm onSuccess={onClose} />
      </div>
    </Modal>
  );
}
