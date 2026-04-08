import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { PinIcon, CloseIcon } from "@/components/ui/icons";
import { thread } from "@/lib/mock-data";

export function CheckpointEditScreen({ goBack }: NavigationProps) {
  const cp = thread.checkpoints[1];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackButton onClick={goBack} label="スレッドに戻る" className="mb-6" />

      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-6 text-lg font-bold text-white">
          チェックポイントを編集
        </h2>
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              時刻
            </label>
            <input
              type="text"
              defaultValue={cp.time}
              className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              テキスト
            </label>
            <textarea
              rows={3}
              defaultValue={cp.text}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>
          {cp.images.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-medium text-white/50">
                写真
              </label>
              <div className="grid grid-cols-3 gap-2">
                {cp.images.map((img, i) => (
                  <div
                    key={i}
                    className="group relative overflow-hidden rounded-xl"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt=""
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                    <button className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100">
                      <CloseIcon className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cp.location && (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <PinIcon className="size-4 text-indigo-400" />
                <span className="text-sm text-white/70">{cp.location}</span>
              </div>
              <button className="rounded-full p-1.5 text-white/30 transition hover:bg-red-500/10 hover:text-red-400">
                <CloseIcon className="size-4" />
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={goBack}
              className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25"
            >
              保存
            </button>
            <button
              onClick={goBack}
              className="rounded-xl border border-white/10 px-6 py-3 text-sm font-medium text-white/50 transition hover:bg-white/5"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
