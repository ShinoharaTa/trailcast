"use client";

import { useEffect } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { LandingScreen } from "@/components/screens/landing-screen";

/**
 * `/login` パス用。ランディングを表示し、ログインが成立したら
 * 元の画面 (あれば) に戻す / なければ home へ fallback。
 */
export function LoginScreen({ goBack }: NavigationProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (
      isAuthenticated &&
      typeof window !== "undefined" &&
      window.location.pathname === "/login"
    ) {
      goBack();
    }
  }, [isAuthenticated, goBack]);

  return <LandingScreen />;
}
