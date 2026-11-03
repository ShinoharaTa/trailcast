import { describe, expect, it } from "vitest";
import {
  createModalHistoryController,
  hasModalMark,
  pruneModalState,
  readModalIds,
  readModalKind,
  stripStaleModalMark,
  withModal,
  withoutModal,
  type HistoryLike,
} from "@/lib/modal-history-state";

describe("readModalKind / readModalIds", () => {
  it.each([null, undefined, "x", 1, {}, { modal: 1, modalIds: "a" }])(
    "%s → 印なし",
    (s) => {
      expect(readModalKind(s)).toBeNull();
      expect(readModalIds(s)).toEqual([]);
      expect(hasModalMark(s)).toBe(false);
    },
  );

  it("種類と id を読む", () => {
    const s = { modal: "share", modalIds: ["a", 1, "b"], __NA: true };
    expect(readModalKind(s)).toBe("share");
    expect(readModalIds(s)).toEqual(["a", "b"]);
    expect(hasModalMark(s)).toBe(true);
  });
});

describe("withModal / withoutModal", () => {
  it("既存のキーを残して印を足し引きする", () => {
    const base = { __NA: true, tree: [1] };
    const one = withModal(base, "checkpoint-post", "a");
    expect(one).toEqual({ __NA: true, tree: [1], modal: "checkpoint-post", modalIds: ["a"] });
    expect(withModal(one, "login", "b")).toMatchObject({ modal: "login", modalIds: ["a", "b"] });
    expect(base).toEqual({ __NA: true, tree: [1] });
    expect(withoutModal(one)).toEqual(base);
  });

  it("state が null でも扱える", () => {
    expect(withModal(null, "share", "a")).toEqual({ modal: "share", modalIds: ["a"] });
    expect(withoutModal(null)).toEqual({});
  });
});

describe("pruneModalState", () => {
  const open = new Map([["a", "share"]]);

  it("開いているものだけなら null (変更なし)", () => {
    expect(pruneModalState({ modal: "share", modalIds: ["a"] }, open)).toBeNull();
    expect(pruneModalState({ __NA: true }, open)).toBeNull();
  });

  it("開いていない id を外し、種類を一番上に合わせる", () => {
    expect(pruneModalState({ modal: "login", modalIds: ["a", "x"], __NA: true }, open)).toEqual({
      __NA: true,
      modal: "share",
      modalIds: ["a"],
    });
  });

  it("全部閉じていれば印ごと外す。id の無い古い形式も外す", () => {
    expect(pruneModalState({ modal: "share", modalIds: ["x"], k: 1 }, open)).toEqual({ k: 1 });
    expect(pruneModalState({ modal: "share" }, open)).toEqual({});
  });
});

// ---- 偽 history での状態遷移 ----

interface Entry {
  state: unknown;
  url: string;
}

/** entries / idx を持ち、back / forward は flush まで遅らせる (ブラウザと同じく非同期) */
class FakeHistory implements HistoryLike {
  entries: Entry[];
  idx: number;
  private queue: number[] = [];
  listeners: (() => void)[] = [];

  constructor(urls: string[]) {
    this.entries = urls.map((url) => ({ state: { __NA: true }, url }));
    this.idx = urls.length - 1;
  }
  get state() {
    return this.entries[this.idx].state;
  }
  get url() {
    return this.entries[this.idx].url;
  }
  pushState(data: unknown, _unused: string, url?: string) {
    this.entries.splice(this.idx + 1);
    this.entries.push({ state: structuredClone(data), url: url ?? this.url });
    this.idx += 1;
  }
  replaceState(data: unknown, _unused: string, url?: string) {
    this.entries[this.idx] = { state: structuredClone(data), url: url ?? this.url };
  }
  back() {
    this.queue.push(-1);
  }
  forward() {
    this.queue.push(1);
  }
  flush() {
    while (this.queue.length > 0) {
      const next = this.idx + this.queue.shift()!;
      if (next < 0 || next >= this.entries.length) continue;
      this.idx = next;
      for (const l of [...this.listeners]) l();
    }
  }
}

/** use-modal-history を React 抜きで真似る。onBack は refuse でなければ閉じる */
function mountModal(h: FakeHistory, open: Map<string, string>, newId: () => string) {
  const ctrl = createModalHistoryController(h, { open, newId });
  const m = {
    kind: null as string | null,
    refuse: false,
    closes: 0,
    setKind(k: string | null) {
      m.kind = k;
      ctrl.sync(k);
    },
    /** × / 保存など UI から閉じる */
    close() {
      ctrl.dismiss(() => {
        m.closes += 1;
        m.setKind(null);
      });
    },
    unmount() {
      h.listeners = h.listeners.filter((l) => l !== listener);
      ctrl.dispose();
    },
  };
  const listener = () =>
    ctrl.handlePop(m.kind, () => {
      if (m.refuse) return false;
      m.closes += 1;
      m.setKind(null);
    });
  h.listeners.push(listener);
  return m;
}

// use-navigation の popstate (古い印の掃除) が先に走る場合と後に走る場合の両方を見る
describe.each(["nav-first", "nav-last"] as const)("モーダルと history (%s)", (order) => {
  function setup(urls = ["/", "/t"]) {
    const h = new FakeHistory(urls);
    const open = new Map<string, string>();
    let seq = 0;
    const newId = () => `id${++seq}`;
    const nav = () => stripStaleModalMark(h, open);
    if (order === "nav-first") h.listeners.push(nav);
    const mount = () => mountModal(h, open, newId);
    const finish = () => {
      if (order === "nav-last") h.listeners.push(nav);
    };
    return { h, open, mount, finish };
  }

  it("開く → 戻る → 進む → 開く → × で閉じる", () => {
    const { h, open, mount, finish } = setup();
    const m = mount();
    finish();

    m.setKind("checkpoint-post");
    expect(h.idx).toBe(2);
    expect(readModalIds(h.state)).toEqual(["id1"]);

    h.back();
    h.flush();
    expect(m.kind).toBeNull();
    expect(h.idx).toBe(1);
    expect(open.size).toBe(0);

    // 進む: 開き直さず、着いたエントリの印は外れる
    h.forward();
    h.flush();
    expect(m.kind).toBeNull();
    expect(h.idx).toBe(2);
    expect(hasModalMark(h.state)).toBe(false);

    // 同じ種類をもう一度開く。古いエントリと取り違えない
    m.setKind("checkpoint-post");
    expect(readModalIds(h.state)).toEqual(["id2"]);
    m.close();
    expect(m.kind).toBe("checkpoint-post"); // popstate までは開いたまま
    h.flush();
    expect(m.kind).toBeNull();
    expect(m.closes).toBe(2);
    // 現在位置までに印は残らない (先のエントリは着いたときに外れる)
    expect(h.entries.slice(0, h.idx + 1).every((e) => !hasModalMark(e.state))).toBe(true);

    // 戻る → 進むでも開き直さない
    h.back();
    h.flush();
    h.forward();
    h.flush();
    expect(m.kind).toBeNull();
    expect(hasModalMark(h.state)).toBe(false);
  });

  it("開いたまま種類が変わってもエントリは増えない", () => {
    const { h, mount, finish } = setup();
    const m = mount();
    finish();
    m.setKind("thread-edit");
    m.setKind("thread-edit-fields");
    expect(h.entries).toHaveLength(3);
    expect(readModalKind(h.state)).toBe("thread-edit-fields");
    h.back();
    h.flush();
    expect(m.kind).toBeNull();
    expect(h.url).toBe("/t");
  });

  it("× の連打で 2 回戻らない", () => {
    const { h, mount, finish } = setup();
    const m = mount();
    finish();
    m.setKind("share");
    m.close();
    m.close();
    h.flush();
    expect(m.kind).toBeNull();
    expect(m.closes).toBe(1);
    expect(h.idx).toBe(1);
    expect(h.url).toBe("/t");
  });

  it("閉じない確認モーダルは戻るでエントリを積み直し、次の戻るで閉じる", () => {
    const { h, open, mount, finish } = setup();
    const m = mount();
    finish();
    m.setKind("fields-migrate");
    m.refuse = true;
    h.back();
    h.flush();
    expect(m.kind).toBe("fields-migrate");
    expect(h.idx).toBe(2);
    expect(readModalIds(h.state)).toEqual(["id2"]);
    expect([...open.keys()]).toEqual(["id2"]);

    m.refuse = false;
    h.back();
    h.flush();
    expect(m.kind).toBeNull();
    expect(h.idx).toBe(1);
    expect(open.size).toBe(0);
  });

  it("dismiss を通らずに閉じたら、残ったエントリを取り除く", () => {
    const { h, mount, finish } = setup();
    const m = mount();
    finish();
    m.setKind("share");
    m.setKind(null);
    h.flush();
    expect(h.idx).toBe(1);
    expect(hasModalMark(h.state)).toBe(false);
  });

  it("開いたまま navigate (replace) して画面ごと消えても、戻り先に印が残らない", () => {
    const { h, open, mount, finish } = setup();
    const m = mount();
    finish();
    m.setKind("share");
    // use-navigation の navigate: 印があれば push せず replace する
    expect(hasModalMark(h.state)).toBe(true);
    h.replaceState({ __NA: true }, "", "/u");
    m.unmount();
    expect(open.size).toBe(0);
    expect(h.entries.map((e) => e.url)).toEqual(["/", "/t", "/u"]);
    h.back();
    h.flush();
    expect(h.url).toBe("/t");
    expect(hasModalMark(h.state)).toBe(false);
  });

  it("重ねたモーダル: 上だけ閉じ、進むで戻っても下は開いたまま、下も × で閉じられる", () => {
    const { h, mount, finish } = setup();
    const outer = mount();
    const inner = mount();
    finish();
    outer.setKind("checkpoint-post");
    inner.setKind("login");
    expect(readModalIds(h.state)).toEqual(["id1", "id2"]);

    inner.close();
    h.flush();
    expect(inner.kind).toBeNull();
    expect(outer.kind).toBe("checkpoint-post");

    h.forward();
    h.flush();
    expect(inner.kind).toBeNull();
    expect(outer.kind).toBe("checkpoint-post");
    expect(readModalIds(h.state)).toEqual(["id1"]);

    outer.close();
    h.flush();
    expect(outer.kind).toBeNull();
    expect(hasModalMark(h.state)).toBe(false);
  });
});
