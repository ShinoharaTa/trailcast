"use client";

// OG 画像バックフィル確認 + 進捗モーダル。
//
// ダッシュボード初回表示時に「OG 画像が未生成のスレッドが N 件あります」を案内し、
// ユーザーの同意があれば順次 PDS 上のスレッドレコードを更新して OG 画像を埋め込む。
//
// state:
//   - "confirm": 件数を表示し、生成 / あとで / 表示しない を選ばせる
//   - "running": 進捗バー + 現在処理中のタイトル表示
//   - "done":    完了サマリ (成功 / 失敗) を表示し閉じる

import { useCallback, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  backfillThreads,
  setBackfillDismissedForever,
  setBackfillDismissedThisSession,
  type BackfillProgress,
} from "@/lib/og/backfill";
import type { ThreadWithMeta } from "@/lib/types";

type Phase = "confirm" | "running" | "done";

export interface OgBackfillModalProps {
  open: boolean;
  /** OG 未生成のスレッド (ThreadWithMeta) */
  targets: ThreadWithMeta[];
  /** 完了またはキャンセルでモーダルを閉じる。done 件数を引数で渡す。 */
  onClose: (succeeded: number) => void;
}

export function OgBackfillModal({
  open,
  targets,
  onClose,
}: OgBackfillModalProps) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [progress, setProgress] = useState<BackfillProgress>({
    total: targets.length,
    done: 0,
    succeeded: 0,
    failed: 0,
  });
  const abortRef = useRef<AbortController | null>(null);

  const total = targets.length;

  const handleStart = useCallback(async () => {
    setPhase("running");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const result = await backfillThreads(targets, {
      onProgress: setProgress,
      signal: ctrl.signal,
    });
    setProgress(result);
    setPhase("done");
  }, [targets]);

  const handleLater = useCallback(() => {
    setBackfillDismissedThisSession();
    onClose(0);
  }, [onClose]);

  const handleNever = useCallback(() => {
    setBackfillDismissedForever();
    onClose(0);
  }, [onClose]);

  const handleFinishClose = useCallback(() => {
    onClose(progress.succeeded);
  }, [onClose, progress.succeeded]);

  // running 中に閉じようとした場合: 現在処理中のものを完走させて停止
  const handleRequestClose = useCallback(() => {
    if (phase === "running") {
      abortRef.current?.abort();
      return;
    }
    if (phase === "done") {
      handleFinishClose();
      return;
    }
    handleLater();
  }, [phase, handleFinishClose, handleLater]);

  const pct =
    progress.total === 0
      ? 0
      : Math.round((progress.done / progress.total) * 100);

  return (
    <Modal
      open={open}
      onClose={handleRequestClose}
      maxWidth="md"
      ariaLabel="OG 画像の自動生成"
    >
      {phase === "confirm" && (
        <div>
          <h3 className="text-lg font-bold text-white">
            OG 画像を自動生成しますか？
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-white/60">
            あなたのスレッドのうち
            <span className="mx-1 font-bold text-indigo-300">{total} 件</span>
            に OG 画像が設定されていません。
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            生成すると、SNS でリンクをシェアした時のプレビューがカード型で
            表示されるようになります。スレッドのタイトル / カバー画像 /
            プロフィール情報をもとに 1 枚ずつ作成して PDS に保存します。
          </p>
          <ul className="mt-3 space-y-1 text-xs text-white/40">
            <li>・処理中はこのタブを開いたままにしてください</li>
            <li>・生成済みのスレッドは何度実行しても上書きされません</li>
          </ul>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleNever}
              className="rounded-lg px-4 py-2 text-xs font-medium text-white/40 transition hover:bg-white/5 hover:text-white/70"
            >
              今後表示しない
            </button>
            <button
              type="button"
              onClick={handleLater}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              あとで
            </button>
            <button
              type="button"
              onClick={handleStart}
              className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
            >
              生成する
            </button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div>
          <h3 className="text-lg font-bold text-white">OG 画像を生成しています</h3>
          <p className="mt-1 text-sm text-white/50">
            {progress.done} / {progress.total} 件 完了
          </p>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress.currentTitle && (
            <p
              className="mt-3 truncate text-xs text-white/40"
              title={progress.currentTitle}
            >
              生成中: {progress.currentTitle}
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleRequestClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
            >
              停止
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div>
          <h3 className="text-lg font-bold text-white">OG 画像の生成が完了しました</h3>
          <p className="mt-2 text-sm text-white/60">
            成功{" "}
            <span className="font-bold text-emerald-400">
              {progress.succeeded}
            </span>{" "}
            件 / 失敗{" "}
            <span
              className={`font-bold ${
                progress.failed > 0 ? "text-red-400" : "text-white/40"
              }`}
            >
              {progress.failed}
            </span>{" "}
            件
          </p>
          {progress.failed > 0 && (
            <p className="mt-2 text-xs text-white/40">
              失敗した分は、対象スレッドの編集画面から再度更新すると再試行できます。
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleFinishClose}
              className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
