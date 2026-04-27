"use client";

import { useEffect } from "react";
import { LoginScreen } from "@/components/screens/login-screen";
import { AuthCallbackScreen } from "@/components/screens/auth-callback-screen";
import { HomeScreen } from "@/components/screens/home-screen";
import { ThreadCreateScreen } from "@/components/screens/thread-create-screen";
import { ThreadDetailScreen } from "@/components/screens/thread-detail-screen";
import { UserProfileScreen } from "@/components/screens/user-profile-screen";
import type { ScreenId } from "@/lib/app-routes";
import { useNavigation } from "@/lib/use-navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

// 未認証だと操作できない画面（URL は保持したまま LoginScreen に差し替える）
const AUTH_REQUIRED_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>([
  "thread-create",
]);

export default function Page() {
  const { currentScreen, params, navigate } = useNavigation();
  const { isAuthenticated, isLoading, restore } = useAuthStore();

  useEffect(() => {
    restore();
  }, [restore]);

  const nav = { navigate, params };

  // OAuth コールバック (`/auth/callback?code=...`) は initAuth() が処理中の
  // ローディング表示を出しつつ、終わったら home に戻る。
  if (currentScreen === "auth-callback") {
    return (
      <main>
        <AuthCallbackScreen {...nav} />
      </main>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-white/40">読み込み中...</p>
        </div>
      </div>
    );
  }

  // /login を直接叩いたときは常にログインフォーム
  if (currentScreen === "login") {
    return (
      <main>
        <LoginScreen {...nav} />
      </main>
    );
  }

  // 書き込み系は未認証なら LoginScreen にフォールバック（URL はそのまま残す）
  if (!isAuthenticated && AUTH_REQUIRED_SCREENS.has(currentScreen)) {
    return (
      <main>
        <LoginScreen {...nav} />
      </main>
    );
  }

  return (
    <main>
      {currentScreen === "home" && <HomeScreen {...nav} />}
      {currentScreen === "thread-create" && <ThreadCreateScreen {...nav} />}
      {currentScreen === "thread-detail" && <ThreadDetailScreen {...nav} />}
      {currentScreen === "user-profile" && <UserProfileScreen {...nav} />}
    </main>
  );
}
