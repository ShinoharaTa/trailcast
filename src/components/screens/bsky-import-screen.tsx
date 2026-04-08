import type { NavigationProps } from "@/lib/use-navigation";
import { BackButton } from "@/components/ui/back-button";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import { blueskyPosts } from "@/lib/mock-data";

export function BlueskyImportScreen({ goBack }: NavigationProps) {
  const selectedCount = blueskyPosts.filter((p) => p.selected).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <BackButton onClick={goBack} label="スレッドに戻る" className="mb-6" />

      <h2 className="mb-1 text-xl font-bold text-white">
        Bluesky 投稿からインポート
      </h2>
      <p className="mb-6 text-sm text-white/40">
        チェックポイントとして取り込む投稿を選択してください
      </p>

      <div className="space-y-3">
        {blueskyPosts.map((post) => (
          <label
            key={post.uri}
            className={`flex cursor-pointer gap-4 rounded-2xl border p-4 transition ${
              post.selected
                ? "border-indigo-500/50 bg-indigo-500/5"
                : "border-white/5 bg-surface-800 hover:border-white/10"
            }`}
          >
            <div
              className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                post.selected ? "bg-indigo-500" : "border border-white/20"
              }`}
            >
              {post.selected && <CheckIcon className="size-3.5 text-white" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-relaxed text-white/80">
                {post.text}
              </p>
              {post.images.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {post.images.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={img}
                      alt=""
                      className="size-14 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-white/30">{post.createdAt}</p>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-white/40">
          <InfoIcon className="size-4 shrink-0 text-amber-400/60" />
          位置情報は付与されません
        </p>
      </div>

      <button
        onClick={goBack}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:shadow-xl hover:brightness-110"
      >
        選択した投稿をインポート ({selectedCount}件)
      </button>
    </div>
  );
}
