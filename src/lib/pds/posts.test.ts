import { beforeEach, describe, expect, it, vi } from "vitest";

// 実 PDS・インデックスに触れないよう、Agent と通知はすべてモックにする
const putRecord = vi.fn();
vi.mock("@/lib/atp-agent", () => ({
  getAgent: () => ({ com: { atproto: { repo: { putRecord } } } }),
  getMyDid: () => "did:plc:me",
}));
vi.mock("@/lib/index-api", () => ({ notifyPostIndexed: vi.fn() }));
vi.mock("@/lib/pds/thread-activity", () => ({ touchThread: vi.fn() }));
vi.mock("@/lib/pds/repo-read", () => ({ getRecordViaPds: vi.fn() }));

import { rewritePost } from "@/lib/pds/posts";
import { touchThread } from "@/lib/pds/thread-activity";
import type { PostRecord } from "@/lib/types";

const record: PostRecord = {
  thread: "at://did:plc:me/net.shino3.trailcast.thread/t1",
  text: "本文",
  checkpointAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("rewritePost", () => {
  beforeEach(() => {
    putRecord.mockReset();
  });

  it("uri の rkey に swapRecord 付きで書く。touchThread は呼ばない", async () => {
    putRecord.mockResolvedValueOnce({
      data: { uri: "at://did:plc:me/net.shino3.trailcast.post/r1", cid: "cid-new" },
    });
    const res = await rewritePost(
      "at://did:plc:me/net.shino3.trailcast.post/r1",
      record,
      "cid-old",
    );
    expect(putRecord).toHaveBeenCalledWith({
      repo: "did:plc:me",
      collection: "net.shino3.trailcast.post",
      rkey: "r1",
      record,
      swapRecord: "cid-old",
    });
    expect(res.cid).toBe("cid-new");
    expect(res.rkey).toBe("r1");
    expect(touchThread).not.toHaveBeenCalled();
  });

  it("他人の repo の uri は書かずに throw", async () => {
    await expect(
      rewritePost("at://did:plc:other/net.shino3.trailcast.post/r1", record, "cid-old"),
    ).rejects.toThrow();
    expect(putRecord).not.toHaveBeenCalled();
  });
});
