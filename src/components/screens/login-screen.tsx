"use client";

import { useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { MapIcon } from "@/components/ui/icons";

export function LoginScreen({ goBack }: NavigationProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const { login, error, isLoading, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) return;
    try {
      await login(identifier.trim(), password);
      // 書き込み系画面の URL のままフォールバック LoginScreen を出している場合は、
      // 認証状態が変わったことで自動的にその画面が再描画される (URL はそのまま)。
      // それ以外 (/login を踏んで来た等) は、元いた画面に戻す。
      // goBack は SPA 内 push があれば history.back()、無ければ home に replace。
      if (
        typeof window !== "undefined" &&
        window.location.pathname === "/login"
      ) {
        goBack();
      }
    } catch {
      // error is set in the store
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-surface-900 shadow-2xl shadow-indigo-500/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-violet-600/20" />
        <div className="relative px-8 py-12 text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
            <MapIcon className="size-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Trailcast
          </h1>
          <p className="mt-2 text-sm text-white/50">
            旅の記録を、ダイナミックに残す
          </p>

          <div className="mt-10 space-y-4 text-left">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">
                ハンドル
              </label>
              <input
                type="text"
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
              onClick={handleLogin}
              disabled={isLoading || !identifier.trim() || !password.trim()}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
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
          </div>
          <p className="mt-6 text-xs text-white/30">
            AT Protocol (App Password) で認証します
          </p>
        </div>
      </div>
    </div>
  );
}
