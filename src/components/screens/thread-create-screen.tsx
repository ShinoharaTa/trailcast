import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { PhotoIcon } from "@/components/ui/icons";

export function ThreadCreateScreen({ navigate, goBack }: NavigationProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <BackButton onClick={goBack} className="mb-6" />
      <div className="rounded-2xl bg-surface-800 p-6 shadow-lg sm:p-8">
        <h2 className="mb-6 text-xl font-bold text-white">
          新しいスレッドを作成
        </h2>
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              タイトル
            </label>
            <input
              type="text"
              placeholder="例: 京都日帰り旅"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/50">
              概要
            </label>
            <textarea
              rows={3}
              placeholder="どんなスレッド？"
              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm text-white/70">公開設定</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Private</span>
              <div className="h-6 w-11 rounded-full bg-surface-700 p-0.5">
                <div className="size-5 rounded-full bg-white/40 shadow transition" />
              </div>
            </div>
          </div>
          <div className="flex aspect-[16/9] items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] transition hover:border-indigo-400/40">
            <div className="text-center">
              <PhotoIcon className="mx-auto size-8 text-white/20" />
              <span className="mt-2 block text-xs text-white/30">
                カバー画像を選択
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate("home")}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110"
          >
            作成
          </button>
        </div>
      </div>
    </div>
  );
}
