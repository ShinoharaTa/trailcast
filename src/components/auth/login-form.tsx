"use client";

import { useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";

export interface LoginFormProps {
  /** ログイン成功直後 (= リダイレクト前) に呼ばれる */
  onSuccess?: () => void;
  className?: string;
}

/**
 * Bluesky OAuth でログインするフォーム。
 *
 * ハンドル / DID / PDS URL のいずれかを入力させ、認可サーバへリダイレクトする。
 * リダイレクト後に同じドメインの `/auth/callback` に戻ってきて、`initAuth()` が
 * URL パラメータからセッションを取り込む流れ。
 */
export function LoginForm({ onSuccess, className }: LoginFormProps) {
  const [identifier, setIdentifier] = useState("");
  const { login, error, isLoggingIn, clearError } = useAuthStore();

  const handleLogin = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) return;
    try {
      // 成功すると authorization server へリダイレクトされ、ここから先は実行されない
      await login(trimmed);
      onSuccess?.();
    } catch {
      // error は store 側にセットされる
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  const canSubmit = !isLoggingIn && identifier.trim().length > 0;

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">
            ハンドル / DID
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
            disabled={isLoggingIn}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 disabled:opacity-50"
          />
          <p className="mt-1.5 text-[11px] text-white/30">
            ハンドル (例: name.bsky.social) または DID を入力
          </p>
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
          {isLoggingIn ? (
            <span className="flex items-center justify-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              リダイレクト中...
            </span>
          ) : (
            "Bluesky でログイン"
          )}
        </button>
        <p className="text-center text-[11px] text-white/30">
          Bluesky の OAuth で安全に認証します。App Password は不要です。
        </p>
      </div>
    </div>
  );
}
