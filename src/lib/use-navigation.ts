"use client";

import { useCallback, useRef, useState } from "react";

export type ScreenId =
  | "login"
  | "home"
  | "thread-create"
  | "thread-detail"
  | "checkpoint-post"
  | "checkpoint-edit"
  | "bsky-import"
  | "bsky-crosspost"
  | "share";

export interface ScreenParams {
  threadUri?: string;
  postUri?: string;
}

export interface NavigationProps {
  navigate: (screen: ScreenId, params?: ScreenParams) => void;
  goBack: () => void;
  params: ScreenParams;
}

interface HistoryEntry {
  screen: ScreenId;
  params: ScreenParams;
}

export function useNavigation(initial: ScreenId = "login") {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>(initial);
  const [params, setParams] = useState<ScreenParams>({});
  const historyRef = useRef<HistoryEntry[]>([
    { screen: initial, params: {} },
  ]);

  const navigate = useCallback(
    (screen: ScreenId, newParams: ScreenParams = {}) => {
      historyRef.current.push({ screen, params: newParams });
      setCurrentScreen(screen);
      setParams(newParams);
      window.scrollTo(0, 0);
    },
    [],
  );

  const goBack = useCallback(() => {
    if (historyRef.current.length > 1) {
      historyRef.current.pop();
      const prev = historyRef.current[historyRef.current.length - 1];
      setCurrentScreen(prev.screen);
      setParams(prev.params);
      window.scrollTo(0, 0);
    }
  }, []);

  return { currentScreen, params, navigate, goBack };
}
