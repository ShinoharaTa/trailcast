"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  isOwnModalOnTop,
  withModal,
  withoutModal,
} from "@/lib/modal-history-state";

/**
 * モーダルを history に 1 エントリ積み、端末の「戻る」でモーダルだけを閉じる。
 *
 * - `kind` が null → 非 null になったら `pushState({ ...state, modal: kind })` する
 * - popstate で state.modal が自分の kind でなくなったら `onBack` を呼ぶ。
 *   `onBack` が false を返したら (実行中で閉じられない等) エントリを積み直す
 * - UI から閉じるとき (保存 / キャンセル / 背景 / ESC / ×) は返り値の `dismiss`
 *   に閉じる処理を渡す。自分のエントリが先頭にあれば `history.back()` だけ呼び、
 *   実際の close は popstate 側で行う (二重に閉じない)。先頭でなければその場で閉じる
 *
 * `onBack` / `dismiss` に渡した処理の中から `dismiss` を呼んでもよい
 * (その時点でエントリは消えているので、その場で閉じる)。
 */
export function useModalHistory(
  kind: string | null,
  onBack: () => boolean | void,
): (close: () => void) => void {
  // いま自分が積んでいるエントリの kind。積んでいなければ null
  const pushedRef = useRef<string | null>(null);
  // dismiss で back() したあと、popstate で実行する close
  const pendingRef = useRef<(() => void) | null>(null);
  const kindRef = useRef(kind);
  const onBackRef = useRef(onBack);
  useEffect(() => {
    kindRef.current = kind;
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pushed = pushedRef.current;
    if (kind === null) {
      if (pushed === null) return;
      pushedRef.current = null;
      // dismiss を通らずに閉じられた場合の後始末。先頭に残っていれば取り除く
      if (isOwnModalOnTop(window.history.state, pushed)) {
        window.history.back();
      }
      return;
    }
    if (pushed === kind) return;
    if (pushed !== null && isOwnModalOnTop(window.history.state, pushed)) {
      // 開いたまま種類だけ変わった。エントリは増やさない
      window.history.replaceState(withModal(window.history.state, kind), "");
    } else {
      window.history.pushState(withModal(window.history.state, kind), "");
    }
    pushedRef.current = kind;
  }, [kind]);

  useEffect(() => {
    const onPop = () => {
      const pushed = pushedRef.current;
      if (pushed === null) return;
      // 上に積んだ別のモーダルが閉じただけなら自分はそのまま
      if (isOwnModalOnTop(window.history.state, pushed)) return;
      pushedRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        pending();
        return;
      }
      const closed = onBackRef.current();
      const current = kindRef.current;
      if (closed === false && current !== null) {
        // 閉じるのを断られたので、次の「戻る」でまた確認できるよう積み直す
        window.history.pushState(withModal(window.history.state, current), "");
        pushedRef.current = current;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // 開いたまま画面ごと消えた。back() は非同期で次の画面を巻き込むので、
      // 先頭に残っていれば印だけ外す (進むで開き直さないように)
      const pushed = pushedRef.current;
      pushedRef.current = null;
      pendingRef.current = null;
      if (isOwnModalOnTop(window.history.state, pushed)) {
        window.history.replaceState(withoutModal(window.history.state), "");
      }
    };
  }, []);

  return useCallback((close: () => void) => {
    if (
      typeof window === "undefined" ||
      !isOwnModalOnTop(window.history.state, pushedRef.current)
    ) {
      close();
      return;
    }
    // back() 済みで popstate 待ちなら、二度 back() せず close だけ差し替える
    const waiting = pendingRef.current !== null;
    pendingRef.current = close;
    if (!waiting) window.history.back();
  }, []);
}
