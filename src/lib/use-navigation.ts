"use client";

import { useCallback, useEffect, useState } from "react";
import {
  parsePathname,
  screenToPathname,
  type Route,
  type ScreenId,
  type ScreenParams,
} from "@/lib/app-routes";

export type { ScreenId, ScreenParams } from "@/lib/app-routes";

export interface NavigationProps {
  navigate: (
    screen: ScreenId,
    params?: ScreenParams,
    options?: { replace?: boolean },
  ) => void;
  goBack: () => void;
  params: ScreenParams;
}

function readPathname(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

function samePath(a: string, b: string): boolean {
  const na = a === "" ? "/" : a;
  const nb = b === "" ? "/" : b;
  return na === nb;
}

/**
 * URL パスを唯一の出所として画面状態を管理する。
 * Next.js のルータは使わず（output: "export" との兼ね合い）、
 * history API を直接叩き popstate で同期する。
 */
export function useNavigation() {
  const [pathname, setPathname] = useState<string>("/");
  const [route, setRoute] = useState<Route>({ screen: "home", params: {} });

  useEffect(() => {
    const current = readPathname();
    setPathname(current);
    setRoute(parsePathname(current));

    const onPop = () => {
      const p = readPathname();
      setPathname(p);
      setRoute(parsePathname(p));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback(
    (
      screen: ScreenId,
      newParams: ScreenParams = {},
      options?: { replace?: boolean },
    ) => {
      const nextPath = screenToPathname(screen, newParams);
      if (typeof window !== "undefined" && !samePath(nextPath, pathname)) {
        if (options?.replace) {
          window.history.replaceState({}, "", nextPath);
        } else {
          window.history.pushState({}, "", nextPath);
        }
      }
      setPathname(nextPath);
      setRoute(parsePathname(nextPath));
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
      }
    },
    [pathname],
  );

  const goBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("home", {}, { replace: true });
    }
  }, [navigate]);

  return {
    currentScreen: route.screen,
    params: route.params,
    navigate,
    goBack,
  };
}
