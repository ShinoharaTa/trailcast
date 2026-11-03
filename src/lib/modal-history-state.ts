/**
 * モーダルを history に乗せるときの history.state の読み書きと、push / pop の判定。
 * React に依存しない純粋なロジックとして置き、use-modal-history から使う。
 *
 * history.state は Next.js が内部キー (__NA 等) を入れるので、既存のキーは残したまま
 * 次の 2 つだけを足し引きする。
 * - `modal`: 一番上のモーダルの種類 (読みやすさのため)
 * - `modalIds`: このエントリの時点で開いているモーダルの id。下から順に積む
 *
 * 自分のエントリかどうかは種類ではなく push ごとに振る id で判定する。
 * 「進む」で戻ってきた古いエントリの印を、いま開いているモーダルと取り違えないため。
 */

export const MODAL_STATE_KEY = "modal";
export const MODAL_IDS_KEY = "modalIds";

/** history のうち、ここで使う操作だけ */
export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  replaceState(data: unknown, unused: string): void;
  back(): void;
}

/** いま開いていて history にエントリを積んでいるモーダル (id → 種類) */
export const openModals = new Map<string, string>();

let idSeq = 0;
/** push ごとの id。リロード前のエントリと重ならないよう時刻を混ぜる */
function defaultNewId(): string {
  idSeq += 1;
  return `${Date.now().toString(36)}-${idSeq}`;
}

function asRecord(state: unknown): Record<string, unknown> {
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : {};
}

/** history.state から一番上のモーダルの種類を読む。無ければ null */
export function readModalKind(state: unknown): string | null {
  const v = asRecord(state)[MODAL_STATE_KEY];
  return typeof v === "string" ? v : null;
}

/** history.state からモーダルの id を下から順に読む */
export function readModalIds(state: unknown): string[] {
  const v = asRecord(state)[MODAL_IDS_KEY];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** モーダルの印 (種類か id) が付いているか */
export function hasModalMark(state: unknown): boolean {
  return readModalKind(state) !== null || readModalIds(state).length > 0;
}

/** 既存の state の上にモーダルを 1 つ積んだ state を返す */
export function withModal(
  state: unknown,
  kind: string,
  id: string,
): Record<string, unknown> {
  return {
    ...asRecord(state),
    [MODAL_STATE_KEY]: kind,
    [MODAL_IDS_KEY]: [...readModalIds(state), id],
  };
}

/** 既存の state からモーダルの印を外した state を返す */
export function withoutModal(state: unknown): Record<string, unknown> {
  const rest = { ...asRecord(state) };
  delete rest[MODAL_STATE_KEY];
  delete rest[MODAL_IDS_KEY];
  return rest;
}

/**
 * 開いていないモーダルの印を外した state を返す。外すものが無ければ null。
 * 「進む」で戻ってきたエントリや、リロード前のエントリに残った印の掃除に使う。
 */
export function pruneModalState(
  state: unknown,
  open: ReadonlyMap<string, string> = openModals,
): Record<string, unknown> | null {
  if (!hasModalMark(state)) return null;
  const ids = readModalIds(state);
  const kept = ids.filter((id) => open.has(id));
  if (kept.length === ids.length && ids.length > 0) return null;
  const base = withoutModal(state);
  if (kept.length === 0) return base;
  return {
    ...base,
    [MODAL_STATE_KEY]: open.get(kept[kept.length - 1]),
    [MODAL_IDS_KEY]: kept,
  };
}

/** 開いていないモーダルの印が今のエントリにあれば外す */
export function stripStaleModalMark(
  history: HistoryLike,
  open: ReadonlyMap<string, string> = openModals,
): void {
  const next = pruneModalState(history.state, open);
  if (next) history.replaceState(next, "");
}

export interface ModalHistoryController {
  /** 開いているモーダルの種類が変わったら呼ぶ。null は閉じた */
  sync(kind: string | null): void;
  /**
   * popstate で呼ぶ。`kind` はいま描画している種類。
   * 自分のエントリが無くなっていれば、dismiss 待ちの close か `onBack` を実行する。
   * `onBack` が false を返したら (閉じられない) エントリを積み直す
   */
  handlePop(kind: string | null, onBack: () => boolean | void): void;
  /**
   * UI から閉じる。自分のエントリが一番上なら back() だけ呼び、close は popstate で実行する。
   * 一番上でなければその場で close する
   */
  dismiss(close: () => void): void;
  /** 開いたまま消えるときに呼ぶ。印だけ外す (back() は次の画面を巻き込むので呼ばない) */
  dispose(): void;
}

export function createModalHistoryController(
  history: HistoryLike,
  opts: { open?: Map<string, string>; newId?: () => string } = {},
): ModalHistoryController {
  const open = opts.open ?? openModals;
  const newId = opts.newId ?? defaultNewId;
  // いま自分が積んでいるエントリ。積んでいなければ null
  let pushed: { id: string; kind: string } | null = null;
  // dismiss で back() したあと、popstate で実行する close
  let pending: (() => void) | null = null;

  const present = () =>
    pushed !== null && readModalIds(history.state).includes(pushed.id);
  const onTop = () => {
    if (pushed === null) return false;
    const ids = readModalIds(history.state);
    return ids[ids.length - 1] === pushed.id;
  };
  const push = (kind: string) => {
    const id = newId();
    history.pushState(withModal(history.state, kind, id), "");
    pushed = { id, kind };
    open.set(id, kind);
  };
  const release = () => {
    if (pushed) open.delete(pushed.id);
    pushed = null;
  };

  return {
    sync(kind) {
      if (kind === null) {
        if (pushed === null) return;
        // dismiss を通らずに閉じられた場合の後始末。一番上に残っていれば取り除く
        const top = onTop();
        release();
        if (top) history.back();
        return;
      }
      if (pushed?.kind === kind) return;
      if (pushed !== null && onTop()) {
        // 開いたまま種類だけ変わった。エントリは増やさない
        history.replaceState(
          { ...asRecord(history.state), [MODAL_STATE_KEY]: kind },
          "",
        );
        pushed = { id: pushed.id, kind };
        open.set(pushed.id, kind);
        return;
      }
      release();
      push(kind);
    },

    handlePop(kind, onBack) {
      if (pushed === null) return;
      // 上に積んだ別のモーダルが閉じただけ / 進んだだけなら自分はそのまま。
      // dismiss の back() で来たときは、着いた先に自分の印が残っていても閉じる
      // (「進む」で印を引き継いだエントリがある場合)
      if (pending === null && present()) return;
      release();
      // 着いた先に自分の印が残っていれば外す
      stripStaleModalMark(history, open);
      const close = pending;
      pending = null;
      if (close) {
        close();
        return;
      }
      if (onBack() === false && kind !== null) {
        // 閉じるのを断られたので、次の「戻る」でまた確認できるよう積み直す
        push(kind);
      }
    },

    dismiss(close) {
      if (!onTop()) {
        close();
        return;
      }
      // back() 済みで popstate 待ちなら、二度 back() せず close だけ差し替える
      const waiting = pending !== null;
      pending = close;
      if (!waiting) history.back();
    },

    dispose() {
      release();
      pending = null;
      stripStaleModalMark(history, open);
    },
  };
}
