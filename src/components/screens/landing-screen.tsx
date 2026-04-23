"use client";

import { LoginForm } from "@/components/auth/login-form";
import { MapIcon, PinIcon, ShareIcon, LinkIcon } from "@/components/ui/icons";

/**
 * 未認証ユーザー向けのランディングページ。
 * 左: プロダクトのコピー / 右: ログインカード。モバイルは縦積み。
 */
export function LandingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 背景のグラデーション */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.15),transparent_50%)]"
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:py-24">
        {/* Hero コピー */}
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex size-14 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-500/30">
            <MapIcon className="size-7 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[56px] lg:leading-[1.05]">
            旅の記録を、
            <br className="hidden sm:inline" />
            ダイナミックに残す。
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
            Trailcast は AT Protocol 上に刻む、新しい形の旅ログ。
            写真・位置情報・時刻をチェックポイントとしてスレッドに繋ぎ、
            共有 URL だけで誰とでもシェアできます。
          </p>

          <ul className="mt-8 grid gap-3 text-sm text-white/70 sm:grid-cols-2">
            <Feature
              icon={<PinIcon className="size-3.5" />}
              label="旅の瞬間を時系列のチェックポイントに"
            />
            <Feature
              icon={<MapIcon className="size-3.5" />}
              label="データは自分の Bluesky PDS に保存・所有"
            />
            <Feature
              icon={<ShareIcon className="size-3.5" />}
              label="公開スレッドは URL だけで誰でも閲覧可能"
            />
            <Feature
              icon={<LinkIcon className="size-3.5" />}
              label="Bluesky 投稿からの取り込み / クロスポスト"
            />
          </ul>

          <p className="mt-8 text-xs text-white/30">
            ブラウズだけなら登録不要。投稿や編集を始めるにはログインしてください。
          </p>
        </div>

        {/* ログインカード */}
        <div className="flex flex-col justify-center">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-surface-900/70 shadow-2xl shadow-indigo-500/10 backdrop-blur-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-transparent to-violet-600/10"
            />
            <div className="relative px-7 py-9 sm:px-8 sm:py-10">
              <h2 className="text-xl font-bold text-white">ログインして始める</h2>
              <p className="mt-1 text-xs text-white/50">
                AT Protocol (Bluesky) のアカウントで利用できます
              </p>
              <div className="mt-6">
                <LoginForm />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-300">
        {icon}
      </span>
      <span className="leading-relaxed">{label}</span>
    </li>
  );
}
