"use client";

import { getAbsoluteUrl } from "@/lib/app-routes";
import type { ProfileView } from "@/lib/pds/identity";
import { ShareSheet } from "@/components/share/share-sheet";

export interface ProfileShareScreenProps {
  /** URL に使う識別子。handle があれば handle、無ければ DID */
  identifier: string;
  profile: ProfileView | null;
}

/**
 * プロフィールの共有モーダル。スレッド側 (share-screen) と同じ ShareSheet を使う。
 */
export function ProfileShareScreen({
  identifier,
  profile,
}: ProfileShareScreenProps) {
  const shareUrl = getAbsoluteUrl(
    "user-profile",
    { userIdentifier: identifier },
    "https://trailcast.shino3.net",
  );
  const name = profile?.displayName || profile?.handle || identifier;

  return (
    <ShareSheet
      heading="プロフィールを共有"
      url={shareUrl}
      title={name}
      preview={
        <div className="overflow-hidden rounded-xl border border-white/10">
          <div className="flex items-center gap-3 bg-surface-700 p-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-500/30 ring-1 ring-white/10">
              {profile?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-lg font-bold text-white/30">
                  {name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-white/30">trailcast.shino3.net</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-white/90">
                {name}
              </p>
              {profile?.handle && (
                <p className="truncate text-xs text-white/40">
                  @{profile.handle}
                </p>
              )}
            </div>
          </div>
        </div>
      }
    />
  );
}
