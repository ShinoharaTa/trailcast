import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { thread } from "@/lib/mock-data";

export function ShareScreen({ navigate, goBack }: NavigationProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <BackButton onClick={goBack} label="スレッドに戻る" className="mb-6" />

      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-5 text-lg font-bold text-white">スレッドを共有</h2>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              共有リンク
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
              <span className="flex-1 truncate px-3 text-xs text-white/50">
                trailcast.shino3.net/thread/did:plc:.../3k...
              </span>
              <button className="shrink-0 rounded-lg bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400">
                コピー
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              プレビュー
            </label>
            <div className="overflow-hidden rounded-xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thread.coverImage}
                alt=""
                className="aspect-[2/1] w-full object-cover"
                loading="lazy"
              />
              <div className="bg-surface-700 p-3">
                <p className="text-[11px] text-white/30">
                  trailcast.shino3.net
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white/90">
                  {thread.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-white/40">
                  {thread.description}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate("bsky-crosspost")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0085ff]/10 py-3 text-sm font-semibold text-[#0085ff] transition hover:bg-[#0085ff]/20"
            >
              Bluesky に共有
            </button>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <span className="text-sm font-bold text-white/20">QR</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
