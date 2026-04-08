"use client";

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

export default function Page() {
  const { currentScreen, navigate, goBack } = useNavigation("login");

  const nav = { navigate, goBack };

  return (
    <main>
      {currentScreen === "login" && <LoginScreen {...nav} />}
      {currentScreen === "home" && <HomeScreen {...nav} />}
      {currentScreen === "thread-create" && <ThreadCreateScreen {...nav} />}
      {currentScreen === "thread-private" && (
        <ThreadDetailScreen variant="private" {...nav} />
      )}
      {currentScreen === "thread-public" && (
        <ThreadDetailScreen variant="public" {...nav} />
      )}
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
