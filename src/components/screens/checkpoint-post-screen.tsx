import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { PlusIcon, PinIcon } from "@/components/ui/icons";

export function CheckpointPostScreen({ goBack }: NavigationProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackButton onClick={goBack} label="スレッドに戻る" className="mb-6" />

      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-6 text-lg font-bold text-white">
          チェックポイントを追加
        </h2>
        <div className="space-y-5">
          <div className="relative">
            <textarea
              rows={4}
              placeholder="何があった？"
              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
            <span className="absolute bottom-3 right-3 text-xs text-white/20">
              0/200
            </span>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-white/50">
              写真
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] transition hover:border-indigo-400/40"
                >
                  <PlusIcon className="size-6 text-white/15" strokeWidth={1.5} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-400 transition hover:bg-indigo-500/20">
              <PinIcon className="size-3.5" />
              位置情報 ON
            </button>
            <button className="flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white/40 transition hover:bg-white/10">
              EXIF OFF
            </button>
          </div>

          <button
            onClick={goBack}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110"
          >
            投稿する
          </button>
        </div>
      </div>
    </div>
  );
}
