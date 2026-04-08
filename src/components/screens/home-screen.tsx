"use client";

import { useState } from "react";
import type { NavigationProps } from "@/lib/use-navigation";
import { threadList, bookmarks } from "@/lib/mock-data";
import { PlusIcon } from "@/components/ui/icons";

export function HomeScreen({ navigate }: NavigationProps) {
  const [activeTab, setActiveTab] = useState<"threads" | "bookmarks">(
    "threads",
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Chronicle
          </h2>
          <p className="mt-1 text-sm text-white/40">あなたの旅の記録</p>
        </div>
        <button
          onClick={() => navigate("thread-create")}
          className="flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
        >
          <PlusIcon className="size-4" />
          新しいスレッド
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-white/5 p-1">
        <button
          onClick={() => setActiveTab("threads")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm transition ${
            activeTab === "threads"
              ? "bg-white/10 font-semibold text-white shadow-sm"
              : "font-medium text-white/40 hover:text-white/70"
          }`}
        >
          スレッド
        </button>
        <button
          onClick={() => setActiveTab("bookmarks")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm transition ${
            activeTab === "bookmarks"
              ? "bg-white/10 font-semibold text-white shadow-sm"
              : "font-medium text-white/40 hover:text-white/70"
          }`}
        >
          ブックマーク
        </button>
      </div>

      {/* Threads */}
      {activeTab === "threads" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {threadList.map((t, idx) => (
            <div
              key={t.id}
              onClick={
                idx === 0
                  ? () => navigate("thread-private")
                  : idx === 1
                    ? () => navigate("thread-public")
                    : undefined
              }
              className={`group relative overflow-hidden rounded-2xl bg-surface-800 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-[1.01] ${idx <= 1 ? "cursor-pointer" : ""}`}
            >
              <div className="aspect-[16/9] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.coverImage}
                  alt={t.title}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/40 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      t.visibility === "public"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {t.visibility === "public" ? "Public" : "Private"}
                  </span>
                  {t.checkpoints.length > 0 && (
                    <span className="text-xs text-white/40">
                      {t.checkpoints.length} checkpoints
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-white">{t.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-white/50">
                  {t.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bookmarks */}
      {activeTab === "bookmarks" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              onClick={() => navigate("thread-public")}
              className="group flex cursor-pointer gap-4 rounded-2xl bg-surface-800 p-4 transition hover:bg-surface-700"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bm.thread.coverImage}
                alt={bm.thread.title}
                className="size-20 shrink-0 rounded-xl object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-white">
                  {bm.thread.title}
                </h3>
                <p className="mt-1 text-sm text-white/40">
                  {bm.thread.description}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-white/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={bm.thread.authorAvatar}
                    alt={bm.thread.author}
                    className="size-4 rounded-full"
                  />
                  <span>{bm.thread.author}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
