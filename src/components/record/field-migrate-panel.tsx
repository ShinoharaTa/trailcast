"use client";

// 自分の旧投稿をタグから記録項目へ書き換えるパネル (#62)。仕様は docs/remaining-spec.md §3.6。
// 親の Modal の中に描く。
//
// state:
//   - "preview": 対象件数と先頭 20 件の変更内容 (ドライラン)。確認ダイアログを兼ねる
//   - "running": 進捗バー + 処理中の投稿。停止は処理中の 1 件を終えてから
//   - "done":    成功 / 失敗 / 未処理の件数と失敗一覧

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  migrationRowTitle,
  runFieldMigration,
  type MigrationPlan,
  type MigrationProgress,
} from "@/lib/fields-migrate";

type Phase = "preview" | "running" | "done";

/** プレビューに並べる件数 */
const PREVIEW_ROWS = 20;
/** done に出す失敗の件数 */
const FAILURE_ROWS = 10;

function monthDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--/--";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function FieldMigratePanel({
  plans: initialPlans,
  onClose,
  requestCloseRef,
}: {
  plans: MigrationPlan[];
  onClose: (result: MigrationProgress | null) => void;
  /**
   * 親の Modal の閉じる (× / ESC / 背景) から呼ぶ関数を受け取る ref。
   * running 中は閉じずに停止にするため、閉じる操作はパネルが握る。
   */
  requestCloseRef?: RefObject<(() => void) | null>;
}) {
  // 開いた時点の対象で固定する (実行中に親の posts が変わっても対象を動かさない)
  const [plans] = useState(initialPlans);
  const [phase, setPhase] = useState<Phase>("preview");
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const total = plans.length;

  const start = useCallback(async (targets: MigrationPlan[]) => {
    setPhase("running");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const result = await runFieldMigration(targets, {
      onProgress: setProgress,
      signal: ctrl.signal,
    });
    setProgress(result);
    setPhase("done");
  }, []);

  const requestClose = useCallback(() => {
    if (phase === "running") {
      abortRef.current?.abort();
      return;
    }
    onClose(phase === "done" ? progress : null);
  }, [phase, progress, onClose]);

  // パネルが消えたら (親の画面遷移など) 次の件に進ませない。処理中の 1 件は完走する
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!requestCloseRef) return;
    requestCloseRef.current = requestClose;
    return () => {
      requestCloseRef.current = null;
    };
  }, [requestCloseRef, requestClose]);

  if (phase === "preview") {
    const shown = plans.slice(0, PREVIEW_ROWS);
    const rest = total - shown.length;
    return (
      <div>
        <h3 className="text-lg font-bold text-white">
          過去の投稿を記録項目に書き換えますか？
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          あなたの投稿
          <span className="mx-1 font-bold text-indigo-300">{total} 件</span>
          が、タグから記録項目を読み取っています。タグを記録項目の値に書き換え、
          対応するタグをタグ欄から外します。自由タグ・本文・写真・位置情報は変わりません。
        </p>
        <ul className="mt-3 space-y-1 text-xs text-white/40">
          <li>・参加者の投稿は対象になりません</li>
          <li>・書き換えた投稿は編集画面で保存したのと同じ形になります。元のタグには戻せません</li>
          <li>・処理中はこのタブを開いたままにしてください</li>
        </ul>
        <ul className="mt-4 max-h-56 divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03]">
          {shown.map((plan) => (
            <li key={plan.post.uri} className="px-3 py-2">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 font-mono text-xs tabular-nums text-white/40">
                  {monthDay(plan.post.checkpointAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-white/80">
                  {migrationRowTitle(plan)}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5 text-xs text-indigo-300/80">
                {plan.moved.map((m) => (
                  <div key={m.field.id} className="truncate">
                    {m.field.label}: {m.labels.join("・")}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {rest > 0 && (
          <p className="mt-1.5 text-right text-xs text-white/40">ほか {rest} 件</p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onClose(null)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            やめる
          </button>
          <button
            type="button"
            onClick={() => void start(plans.slice(0, 1))}
            className="rounded-lg border border-indigo-400/40 px-4 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/10"
          >
            1 件だけ書き換える
          </button>
          <button
            type="button"
            onClick={() => void start(plans)}
            className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
          >
            {total} 件すべて書き換える
          </button>
        </div>
      </div>
    );
  }

  if (phase === "running") {
    const done = progress?.done ?? 0;
    const runTotal = progress?.total ?? 0;
    const pct = runTotal === 0 ? 0 : Math.round((done / runTotal) * 100);
    const current = progress?.currentUri
      ? plans.find((p) => p.post.uri === progress.currentUri)
      : undefined;
    return (
      <div>
        <h3 className="text-lg font-bold text-white">書き換えています</h3>
        <p className="mt-1 text-sm text-white/50">
          {done} / {runTotal} 件
        </p>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {current && (
          <p className="mt-3 truncate text-xs text-white/40">
            書き換え中: {migrationRowTitle(current)}
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            停止
          </button>
        </div>
      </div>
    );
  }

  // done
  const result = progress;
  const succeeded = result?.succeeded ?? 0;
  const failed = result?.failed ?? 0;
  const remaining = result ? result.total - result.done : 0;
  const failures = result?.failures ?? [];
  const leftover = failures.length > 0 || (!!result?.aborted && remaining > 0);
  return (
    <div>
      <h3 className="text-lg font-bold text-white">
        {result?.aborted ? "停止しました" : "書き換えが完了しました"}
      </h3>
      <p className="mt-2 text-sm text-white/60">
        成功{" "}
        <span className="font-bold text-emerald-400">{succeeded}</span> 件 / 失敗{" "}
        <span className={`font-bold ${failed > 0 ? "text-red-400" : "text-white/40"}`}>
          {failed}
        </span>{" "}
        件
        {remaining > 0 && (
          <>
            {" "}
            / 未処理 <span className="font-bold text-white/80">{remaining}</span> 件
          </>
        )}
      </p>
      {failures.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs">
          {failures.slice(0, FAILURE_ROWS).map((f) => (
            <li key={f.uri} className="min-w-0">
              <div className="truncate text-white/70">{f.title}</div>
              <div className="truncate text-red-300/80">{f.message}</div>
            </li>
          ))}
        </ul>
      )}
      {leftover && (
        <p className="mt-3 text-xs text-white/40">
          もう一度開くと、失敗した分と未処理の分だけが対象に残ります
        </p>
      )}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => onClose(result)}
          className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
