import { beforeEach, describe, expect, it, vi } from "vitest";

// 実 PDS・インデックスに触れないよう、Agent と OG 生成はすべてモックにする
const putRecord = vi.fn();
vi.mock("@/lib/atp-agent", () => ({
  getAgent: () => ({ com: { atproto: { repo: { putRecord } } } }),
  getMyDid: () => "did:plc:me",
}));
vi.mock("@/lib/index-api", () => ({ listIndexedPostRefs: vi.fn() }));
vi.mock("@/lib/pds/repo-read", () => ({
  getRecordViaPds: vi.fn(),
  listAllRecordsViaPds: vi.fn(),
}));
vi.mock("@/lib/pds/og-image", () => ({
  generateAndUploadThreadOgImage: vi.fn(),
}));

import { updateThread } from "@/lib/pds/threads";
import type { ThreadRecord } from "@/lib/types";

const record: ThreadRecord = {
  title: "スレッド",
  visibility: "private",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("updateThread", () => {
  beforeEach(() => {
    putRecord.mockReset();
    putRecord.mockResolvedValue({
      data: { uri: "at://did:plc:me/net.shino3.trailcast.thread/t1", cid: "cid-new" },
    });
  });

  it("swapCid を渡すと swapRecord 付きで書く", async () => {
    const res = await updateThread("t1", record, {
      skipOgImage: true,
      swapCid: "cid-old",
    });
    expect(putRecord).toHaveBeenCalledWith({
      repo: "did:plc:me",
      collection: "net.shino3.trailcast.thread",
      rkey: "t1",
      record,
      swapRecord: "cid-old",
    });
    expect(res.cid).toBe("cid-new");
  });

  it("swapCid が無ければ swapRecord を付けない", async () => {
    await updateThread("t1", record, { skipOgImage: true });
    expect(putRecord.mock.calls[0][0]).not.toHaveProperty("swapRecord");
  });
});
