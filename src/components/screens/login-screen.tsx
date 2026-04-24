"use client";

import { useEffect } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { LandingScreen } from "@/components/screens/landing-screen";

/**
 * `/login` パス用。ランディング (= ログインフォーム埋込) を表示し、
 * ログインが成立したら home (Dashboard) に replace で遷移する。
 * /login に戻るエントリを残したくないので必ず replace を使う。
 */
export function LoginScreen({ navigate }: NavigationProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (
      isAuthenticated &&
      typeof window !== "undefined" &&
      window.location.pathname === "/login"
    ) {
      navigate("home", {}, { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return <LandingScreen />;
}
