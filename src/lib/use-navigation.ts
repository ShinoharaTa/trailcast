"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readModalKind, withoutModal } from "@/lib/modal-history-state";
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
 *
 * 仕様メモ: アプリ内に「戻る」は持たない。各画面は必要に応じて
 * `<HomeLink />` で home (`/`) への直接ジャンプを提供する。ブラウザの
 * 戻る/進むは popstate で URL と同期されるので通常どおり機能する。
 */
export function useNavigation() {
  const [pathname, setPathname] = useState<string>("/");
  const [route, setRoute] = useState<Route>({ screen: "home", params: {} });
  // popstate の中で現在のパスと比べるため、state とは別に持つ
  const pathnameRef = useRef("/");

  useEffect(() => {
    const current = readPathname();
    pathnameRef.current = current;
    setPathname(current);
    setRoute(parsePathname(current));

    // モーダルを開いたままリロード / 外部遷移した場合、そのエントリの印が残る。
    // 残っていると次に開いたモーダルを「戻る」で閉じられないので外しておく
    if (readModalKind(window.history.state) !== null) {
      window.history.replaceState(withoutModal(window.history.state), "");
    }

    const onPop = () => {
      const p = readPathname();
      // モーダルのエントリを戻っただけ (パスは同じ) なら画面を作り直さない
      if (samePath(p, pathnameRef.current)) return;
      pathnameRef.current = p;
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
        // モーダルを開いたまま遷移するときは、そのエントリを遷移先で置き換える
        // (戻ったときにモーダルのエントリで 1 回空振りしないように)
        if (
          options?.replace ||
          readModalKind(window.history.state) !== null
        ) {
          window.history.replaceState({}, "", nextPath);
        } else {
          window.history.pushState({}, "", nextPath);
        }
      }
      pathnameRef.current = nextPath;
      setPathname(nextPath);
      setRoute(parsePathname(nextPath));
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
      }
    },
    [pathname],
  );

  return {
    currentScreen: route.screen,
    params: route.params,
    navigate,
  };
}
