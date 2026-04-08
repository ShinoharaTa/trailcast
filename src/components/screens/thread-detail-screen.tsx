import type { NavigationProps } from "@/lib/use-navigation";
import { thread, publicThread, authorDot, type Thread } from "@/lib/mock-data";
import { PinIcon, EditIcon } from "@/components/ui/icons";

interface ThreadDetailScreenProps extends NavigationProps {
  variant: "private" | "public";
}

function CheckpointImages({ images }: { images: string[] }) {
  if (images.length === 1) {
    return (
      <div className="overflow-hidden rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[0]}
          alt=""
          className="aspect-[16/9] w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          loading="lazy"
        />
      </div>
    );
  }
  if (images.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-1.5 overflow-hidden rounded-2xl">
        {images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={img}
            alt=""
            className="aspect-[4/3] w-full object-cover"
            loading="lazy"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-1.5 overflow-hidden rounded-2xl">
      <div className="col-span-2 row-span-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[0]}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      {images.slice(1, 3).map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={img}
          alt=""
          className="aspect-square w-full object-cover"
          loading="lazy"
        />
      ))}
      {images.length > 3 && (
        <div className="col-span-3 grid grid-cols-2 gap-1.5">
          {images.slice(3).map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img}
              alt=""
              className="aspect-[16/9] w-full object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ThreadDetailScreen({
  variant,
  navigate,
  goBack,
}: ThreadDetailScreenProps) {
  const data: Thread = variant === "private" ? thread : publicThread;
  const isPublic = variant === "public";

  const pubAuthors = isPublic
    ? [
        ...new Map(
          data.checkpoints.map((c) => [c.author, c.authorAvatar]),
        ).entries(),
      ]
    : [];

  return (
    <div>
      {/* Hero cover */}
      <div className="relative h-[50vh] min-h-[320px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={data.coverImage}
          alt={data.title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/50 to-surface-950/20" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl px-5 pb-8">
          <button
            onClick={goBack}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-white/60 transition hover:text-white"
          >
            <svg
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            スレッド一覧
          </button>
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-0.5 text-[11px] font-bold backdrop-blur-sm ${
                isPublic
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-white/10 text-white/60"
              }`}
            >
              {isPublic ? "Public" : "Private"}
            </span>
            <span className="text-xs text-white/40">{data.createdAt}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {data.title}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-white/60">
            {data.description}
          </p>
          {isPublic ? (
            <div className="mt-4 flex items-center gap-1">
              {pubAuthors.map(([author, avatar]) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={author}
                  src={avatar}
                  alt={author}
                  className="size-8 rounded-full ring-2 ring-surface-950"
                  title={author}
                />
              ))}
              <span className="ml-2 text-xs text-white/40">
                {pubAuthors.length} 人が参加
              </span>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.authorAvatar}
                alt={data.author}
                className="size-8 rounded-full ring-2 ring-white/20"
              />
              <span className="text-sm font-medium text-white/80">
                @{data.author}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky top-0 z-30 border-b border-white/5 bg-surface-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto px-5 py-3">
          <button
            onClick={() => navigate("share")}
            className="shrink-0 rounded-lg bg-white/5 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10"
          >
            共有
          </button>
          <button
            onClick={() => navigate("bsky-crosspost")}
            className="shrink-0 rounded-lg bg-[#0085ff]/10 px-3.5 py-2 text-xs font-medium text-[#0085ff] transition hover:bg-[#0085ff]/20"
          >
            Blueskyに投稿
          </button>
          <button
            onClick={() => navigate("bsky-import")}
            className="shrink-0 rounded-lg bg-white/5 px-3.5 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10"
          >
            インポート
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="mx-auto max-w-3xl px-5 py-10">
        {data.checkpoints.map((cp) => {
          const dotColor = isPublic
            ? (authorDot[cp.author] ?? "bg-white/40")
            : "border-2 border-indigo-400 bg-surface-950";

          return (
            <div key={cp.id} className="group relative">
              <div className="absolute bottom-0 left-5 top-0 w-px bg-gradient-to-b from-indigo-500/40 to-violet-500/40 sm:left-6" />
              <div
                className={`absolute left-[14px] top-3 size-3 rounded-full sm:left-[18px] ${dotColor} ${isPublic ? "ring-2 ring-surface-950" : ""}`}
              />

              <div className="pb-10 pl-12 sm:pl-16">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {isPublic && (
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cp.authorAvatar}
                        alt={cp.author}
                        className="size-5 rounded-full"
                      />
                      <span className="font-medium text-white/60">
                        @{cp.author}
                      </span>
                    </div>
                  )}
                  <span className="font-mono font-bold text-indigo-400">
                    {cp.time}
                  </span>
                  {cp.location && (
                    <span className="flex items-center gap-1 text-white/40">
                      <PinIcon className="size-3" />
                      {cp.location}
                    </span>
                  )}
                  {!isPublic && (
                    <button
                      onClick={() => navigate("checkpoint-edit")}
                      className="ml-auto rounded-md px-2 py-1 text-white/20 opacity-0 transition group-hover:opacity-100 hover:bg-white/5 hover:text-white/60"
                    >
                      <EditIcon className="size-3.5" />
                    </button>
                  )}
                </div>

                {cp.images.length > 0 ? (
                  <>
                    <CheckpointImages images={cp.images} />
                    <p className="mt-4 text-base leading-relaxed text-white/70">
                      {cp.text}
                    </p>
                  </>
                ) : (
                  <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5">
                    <p className="text-lg leading-relaxed text-white/80">
                      {cp.text}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* End marker */}
        <div className="flex items-center gap-3 pl-12 sm:pl-16">
          <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/30 to-transparent" />
          <span className="text-xs text-white/30">
            {data.checkpoints.length} チェックポイント
          </span>
        </div>

        <div className="mt-8 pl-12 sm:pl-16">
          <button
            onClick={() => navigate("checkpoint-post")}
            className="w-full rounded-xl border border-dashed border-indigo-500/30 bg-indigo-500/5 py-4 text-sm font-medium text-indigo-400 transition hover:border-indigo-400 hover:bg-indigo-500/10"
          >
            + チェックポイントを追加
          </button>
        </div>
      </div>
    </div>
  );
}
