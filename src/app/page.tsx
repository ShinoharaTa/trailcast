"use client";

import { useEffect } from "react";
import { LoginScreen } from "@/components/screens/login-screen";
import { HomeScreen } from "@/components/screens/home-screen";
import { ThreadCreateScreen } from "@/components/screens/thread-create-screen";
import { ThreadDetailScreen } from "@/components/screens/thread-detail-screen";
import { CheckpointPostScreen } from "@/components/screens/checkpoint-post-screen";
import { CheckpointEditScreen } from "@/components/screens/checkpoint-edit-screen";
import { BlueskyImportScreen } from "@/components/screens/bsky-import-screen";
import { BlueskyCrosspostScreen } from "@/components/screens/bsky-crosspost-screen";
import { ShareScreen } from "@/components/screens/share-screen";
import { useNavigation } from "@/lib/use-navigation";
import { useAuthStore } from "@/lib/stores/auth-store";

export default function Page() {
  const { currentScreen, params, navigate, goBack } = useNavigation("login");
  const { isAuthenticated, isLoading, restore } = useAuthStore();

  useEffect(() => {
    restore();
  }, [restore]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && currentScreen === "login") {
      navigate("home");
    }
    if (!isLoading && !isAuthenticated && currentScreen !== "login") {
      navigate("login");
    }
  }, [isLoading, isAuthenticated, currentScreen, navigate]);

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

  const nav = { navigate, goBack, params };

  return (
    <main>
      {currentScreen === "login" && <LoginScreen {...nav} />}
      {currentScreen === "home" && <HomeScreen {...nav} />}
      {currentScreen === "thread-create" && <ThreadCreateScreen {...nav} />}
      {currentScreen === "thread-detail" && <ThreadDetailScreen {...nav} />}
      {currentScreen === "checkpoint-post" && (
        <CheckpointPostScreen {...nav} />
      )}
      {currentScreen === "checkpoint-edit" && (
        <CheckpointEditScreen {...nav} />
      )}
      {currentScreen === "bsky-import" && <BlueskyImportScreen {...nav} />}
      {currentScreen === "bsky-crosspost" && (
        <BlueskyCrosspostScreen {...nav} />
      )}
      {currentScreen === "share" && <ShareScreen {...nav} />}
    </main>
  );
}
