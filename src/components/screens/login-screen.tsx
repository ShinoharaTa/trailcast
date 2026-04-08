import type { NavigationProps } from "@/lib/use-navigation";
import { MapIcon } from "@/components/ui/icons";

export function LoginScreen({ navigate }: NavigationProps) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-surface-900 shadow-2xl shadow-indigo-500/10">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-violet-600/20" />
        <div className="relative px-8 py-12 text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
            <MapIcon className="size-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Trailcast
          </h1>
          <p className="mt-2 text-sm text-white/50">
            旅の記録を、ダイナミックに残す
          </p>

          <div className="mt-10 space-y-4 text-left">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">
                ハンドル
              </label>
              <input
                type="text"
                placeholder="yourname.bsky.social"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
            <button
              onClick={() => navigate("home")}
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110 active:scale-[0.98]"
            >
              ログイン
            </button>
          </div>
          <p className="mt-6 text-xs text-white/30">
            AT Protocol で認証します
          </p>
        </div>
      </div>
    </div>
  );
}
