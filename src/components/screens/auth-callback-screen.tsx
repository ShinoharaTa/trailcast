"use client";

import { useEffect } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

/**
 * Bluesky OAuth 認可サーバからのリダイレクト先 (`/auth/callback`).
 *
 * `initAuth()` (= `useAuthStore.restore()`) が URL の `?code=...&state=...` を
 * 拾ってセッションを確立してくれるため、この画面ではローディング表示と
 * 完了後のホーム画面遷移だけを担当する。
 *
 * - 成功: ログインユーザーになって home へ replace 遷移
 * - 失敗 (例: ユーザーが認可を拒否): 同様に home (= 未ログイン状態) に戻す
 */
export function AuthCallbackScreen({ navigate }: NavigationProps) {
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isLoading) return;
    // 履歴に /auth/callback を残したくないので replace で遷移
    navigate("home", {}, { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <p className="text-sm text-white/40">サインイン中...</p>
      </div>
    </div>
  );
}
