"use client";

import { useAuthStore } from "@/lib/stores/auth-store";
import { HomeIcon, TrailcastMarkIcon } from "@/components/ui/icons";
import type { NavigationProps } from "@/lib/use-navigation";

/**
 * 「ホーム (`/`) に戻る」リンク。認証状態で見た目を出し分ける。
 *
 *   - ログイン中 : ホームアイコン (= Dashboard へ戻る)
 *   - ログアウト中 : Trailcast ロゴ (= LP へ戻る)
 *
 * どちらも動作は `navigate("home")` なので、URL は常に `/` に向かう。
 * 仕様上「戻る」は持たず、経路に関係なく `/` へジャンプする点に注意。
 */
export function HomeLink({
  navigate,
  className = "",
  size = 40,
  style,
}: {
  navigate: NavigationProps["navigate"];
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const label = isAuthenticated ? "Dashboard へ" : "Trailcast";

  return (
    <button
      type="button"
      onClick={() => navigate("home")}
      aria-label={label}
      title={label}
      style={{ width: size, height: size, ...style }}
      className={`flex shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/10 ${className}`}
    >
      {isAuthenticated ? (
        <HomeIcon className="size-5" />
      ) : (
        <TrailcastMarkIcon className="size-5" />
      )}
    </button>
  );
}
