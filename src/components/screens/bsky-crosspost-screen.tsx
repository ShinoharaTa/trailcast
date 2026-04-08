import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { thread } from "@/lib/mock-data";

export function BlueskyCrosspostScreen({ goBack }: NavigationProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <BackButton onClick={goBack} label="スレッドに戻る" className="mb-6" />

      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-5 text-lg font-bold text-white">Bluesky に共有</h2>
        <textarea
          rows={4}
          defaultValue={`${thread.title}の記録をTrailcastで公開中！\n\ntrailcast.shino3.net/thread/...`}
          className="mb-4 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
        />

        <div className="mb-5 overflow-hidden rounded-xl border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thread.coverImage}
            alt=""
            className="aspect-[2/1] w-full object-cover"
            loading="lazy"
          />
          <div className="bg-surface-700 p-3">
            <p className="text-[11px] text-white/30">trailcast.shino3.net</p>
            <p className="mt-0.5 text-sm font-semibold text-white/90">
              {thread.title}
            </p>
            <p className="mt-0.5 line-clamp-1 text-xs text-white/40">
              {thread.description}
            </p>
          </div>
        </div>

        <button
          onClick={goBack}
          className="w-full rounded-xl bg-[#0085ff] py-3 text-sm font-bold text-white shadow-lg shadow-[#0085ff]/25 transition hover:brightness-110"
        >
          投稿する
        </button>
      </div>
    </div>
  );
}
