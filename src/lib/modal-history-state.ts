/**
 * モーダルを history に乗せるときの history.state の読み書き。
 * history.state は Next.js が内部キーを入れることがあるので、
 * 既存のキーは残したまま `modal` だけを足し引きする。
 */

/** history.state に入れるモーダル種別のキー */
export const MODAL_STATE_KEY = "modal";

/** history.state からモーダル種別を読む。無ければ null */
export function readModalKind(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const v = (state as Record<string, unknown>)[MODAL_STATE_KEY];
  return typeof v === "string" ? v : null;
}

/** 既存の state にモーダル種別を足した state を返す */
export function withModal(state: unknown, kind: string): Record<string, unknown> {
  const base =
    state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  return { ...base, [MODAL_STATE_KEY]: kind };
}

/** 既存の state からモーダル種別を外した state を返す */
export function withoutModal(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object") return {};
  const rest = { ...(state as Record<string, unknown>) };
  delete rest[MODAL_STATE_KEY];
  return rest;
}

/** 自分が積んだモーダルのエントリがいま先頭 (現在の state) にあるか */
export function isOwnModalOnTop(state: unknown, pushed: string | null): boolean {
  return pushed !== null && readModalKind(state) === pushed;
}
