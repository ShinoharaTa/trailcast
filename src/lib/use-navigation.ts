"use client";

import { useCallback, useRef, useState } from "react";

export type ScreenId =
  | "login"
  | "home"
  | "thread-create"
  | "thread-private"
  | "thread-public"
  | "checkpoint-post"
  | "checkpoint-edit"
  | "bsky-import"
  | "bsky-crosspost"
  | "share";

export interface NavigationProps {
  navigate: (screen: ScreenId) => void;
  goBack: () => void;
}

export function useNavigation(initial: ScreenId = "login") {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>(initial);
  const historyRef = useRef<ScreenId[]>([initial]);

  const navigate = useCallback((screen: ScreenId) => {
    historyRef.current.push(screen);
    setCurrentScreen(screen);
    window.scrollTo(0, 0);
  }, []);

  const goBack = useCallback(() => {
    if (historyRef.current.length > 1) {
      historyRef.current.pop();
      const prev = historyRef.current[historyRef.current.length - 1];
      setCurrentScreen(prev);
      window.scrollTo(0, 0);
    }
  }, []);

  return { currentScreen, navigate, goBack };
}
