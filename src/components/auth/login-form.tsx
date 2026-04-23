"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";

export interface LoginFormProps {
  /** ログイン成功直後に呼ばれる (モーダルを閉じる等の用途) */
  onSuccess?: () => void;
  className?: string;
}

/**
 * AT Protocol (App Password) でログインするフォーム。
 * LP / モーダル / 独立ページなど複数コンテキストで使い回すため、
 * 見た目はカードに包むだけで、枠・余白を持たないプレーンな作りにしている。
 */
export function LoginForm({ onSuccess, className }: LoginFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const { login, error, isLoading, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) return;
    try {
      await login(identifier.trim(), password);
      onSuccess?.();
    } catch {
      // error は store 側にセットされる
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  const canSubmit =
    !isLoading && identifier.trim().length > 0 && password.trim().length > 0;

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">
            ハンドル
          </label>
          <input
            type="text"
            autoComplete="username"
            placeholder="yourname.bsky.social"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              clearError();
            }}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">
            App Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ログイン中...
            </span>
          ) : (
            "ログイン"
          )}
        </button>
        <p className="text-center text-[11px] text-white/30">
          AT Protocol (App Password) で認証します
        </p>
      </div>
    </div>
  );
}
