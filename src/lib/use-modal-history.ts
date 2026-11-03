"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  createModalHistoryController,
  type ModalHistoryController,
} from "@/lib/modal-history-state";

/**
 * モーダルを history に 1 エントリ積み、端末の「戻る」でモーダルだけを閉じる。
 * 判定の中身は modal-history-state の createModalHistoryController。
 *
 * - `kind` が null → 非 null になったら、種類と一意の id を印にしたエントリを push する
 * - popstate で自分のエントリが無くなったら `onBack` を呼ぶ。
 *   `onBack` が false を返したら (実行中で閉じられない等) エントリを積み直す
 * - UI から閉じるとき (保存 / キャンセル / 背景 / ESC / ×) は返り値の `dismiss`
 *   に閉じる処理を渡す。自分のエントリが一番上なら `history.back()` だけ呼び、
 *   実際の close は popstate 側で行う (二重に閉じない)。一番上でなければその場で閉じる
 * - `enabled: false` なら history に積まない。ユーザー操作なしに自動で開くモーダル用
 *   (開いた覚えのないエントリで「戻る」が 1 回空振りするのを避ける)。dismiss はその場で閉じる
 *
 * `onBack` / `dismiss` に渡した処理の中から `dismiss` を呼んでもよい
 * (その時点でエントリは消えているので、その場で閉じる)。
 * close の中で navigate しないこと。close は back() の popstate の中で走るので、
 * そこで遷移すると戻った先のエントリの上に積まれる。遷移が要るなら close のあとに行う。
 */
export function useModalHistory(
  kind: string | null,
  onBack: () => boolean | void,
  options: { enabled?: boolean } = {},
): (close: () => void) => void {
  const enabled = options.enabled ?? true;
  const ctrlRef = useRef<ModalHistoryController | null>(null);
  const kindRef = useRef<string | null>(null);
  const onBackRef = useRef(onBack);
  const tracked = enabled ? kind : null;
  useEffect(() => {
    kindRef.current = tracked;
    onBackRef.current = onBack;
  });

  useEffect(() => {
    const ctrl = createModalHistoryController(window.history);
    ctrlRef.current = ctrl;
    const onPop = () => ctrl.handlePop(kindRef.current, () => onBackRef.current());
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    ctrlRef.current?.sync(tracked);
  }, [tracked]);

  return useCallback((close: () => void) => {
    const ctrl = ctrlRef.current;
    if (ctrl) ctrl.dismiss(close);
    else close();
  }, []);
}
