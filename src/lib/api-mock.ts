// UI 確認・スクリーンショット撮影用の API モック。
//
// `NEXT_PUBLIC_API_MOCK=1` を付けて dev サーバを起動したときだけ有効になり、
// OAuth ログイン済みの状態とサンプルデータをネットワーク無しで再現する。
//
//   NEXT_PUBLIC_API_MOCK=1 npm run dev
//   → http://127.0.0.1:3000/{MOCK_DID}/{MOCK_THREAD_RKEY} でスレッド詳細が開ける
//
// 差し込み口は 2 箇所 (atp-agent.ts の initAuth から呼ばれる):
// - 認証付き操作: モックの SessionManager を持つ Agent (`createMockSessionManager`)
// - 他人 repo の読み取り・identity 解決: window.fetch のラップ (`installApiMockFetch`)
//
// 本番ビルドでは env が未設定のため `API_MOCK_ENABLED` が false になり、何もしない。
// 書き込み系 (putRecord / uploadBlob など) は 501 を返す (表示確認専用)。

import {
  NSID_BOOKMARK,
  NSID_POST,
  NSID_TAG_INDEX,
  NSID_THREAD,
  TAG_INDEX_RKEY,
  buildAtUri,
  type PostRecord,
  type TagIndexRecord,
  type ThreadRecord,
} from "@/lib/types";

export const API_MOCK_ENABLED = process.env.NEXT_PUBLIC_API_MOCK === "1";

export const MOCK_DID = "did:plc:trailcastuimock";
export const MOCK_HANDLE = "demo.trailcast.example";
export const MOCK_THREAD_RKEY = "3mockthread001";

/** 実在しないホスト。plc.directory のモック DID doc がここを指す */
const MOCK_PDS = "https://pds.trailcast-mock.invalid";

const mockThread: ThreadRecord = {
  title: "秋の信州 温泉めぐり",
  description: "松本から白骨温泉まで 2 泊 3 日の記録。",
  visibility: "public",
  sortOrder: "asc",
  createdAt: "2026-08-10T21:00:00.000Z",
};

const threadUri = buildAtUri(MOCK_DID, NSID_THREAD, MOCK_THREAD_RKEY);

/** チェックポイント。タグの件数バリエーションが出るように散らしてある */
const mockPosts: Array<{ rkey: string; value: PostRecord }> = [
  {
    rkey: "3mockpost00001",
    value: {
      thread: threadUri,
      text: "あずさ 1 号で松本へ。車窓の八ヶ岳がきれい。",
      tags: ["移動"],
      checkpointAt: "2026-08-11T07:00:00.000Z",
      createdAt: "2026-08-11T07:00:00.000Z",
    },
  },
  {
    rkey: "3mockpost00002",
    value: {
      thread: threadUri,
      text: "駅前のそば屋で早めの昼。ざるそば大盛りと野沢菜。",
      tags: ["そば", "ランチ"],
      checkpointAt: "2026-08-11T11:30:00.000Z",
      createdAt: "2026-08-11T11:30:00.000Z",
    },
  },
  {
    rkey: "3mockpost00003",
    value: {
      thread: threadUri,
      text: "松本城。天守からの北アルプスの眺めが最高だった。",
      tags: ["観光"],
      checkpointAt: "2026-08-11T14:00:00.000Z",
      createdAt: "2026-08-11T14:00:00.000Z",
    },
  },
  {
    rkey: "3mockpost00004",
    value: {
      thread: threadUri,
      text: "白骨温泉に到着。乳白色の湯に浸かって疲れが飛んだ。",
      tags: ["温泉"],
      checkpointAt: "2026-08-11T17:30:00.000Z",
      createdAt: "2026-08-11T17:30:00.000Z",
    },
  },
  {
    rkey: "3mockpost00005",
    value: {
      thread: threadUri,
      text: "宿の夕食。岩魚の塩焼きと地酒。\n食後にもう一度露天へ。",
      tags: ["宿", "温泉"],
      checkpointAt: "2026-08-11T19:00:00.000Z",
      createdAt: "2026-08-11T19:00:00.000Z",
    },
  },
  {
    rkey: "3mockpost00006",
    value: {
      thread: threadUri,
      text: "朝の散歩。川沿いの霧が幻想的。",
      checkpointAt: "2026-08-12T06:30:00.000Z",
      createdAt: "2026-08-12T06:30:00.000Z",
    },
  },
  {
    rkey: "3mockpost00007",
    value: {
      thread: threadUri,
      text: "古民家カフェで休憩。りんごのタルトが名物らしい。",
      tags: ["カフェ"],
      checkpointAt: "2026-08-12T10:00:00.000Z",
      createdAt: "2026-08-12T10:00:00.000Z",
    },
  },
  {
    rkey: "3mockpost00008",
    value: {
      thread: threadUri,
      text: "帰りのあずさ。車内で旅の写真を整理中。",
      tags: ["移動"],
      checkpointAt: "2026-08-12T16:00:00.000Z",
      createdAt: "2026-08-12T16:00:00.000Z",
    },
  },
];

/** タグ入力のサジェスト用辞書。スレッド未使用のタグも混ぜてある */
const mockTagIndex: TagIndexRecord = {
  tags: [
    { tag: "温泉", count: 12, lastUsedAt: "2026-08-11T19:00:00.000Z" },
    { tag: "移動", count: 9, lastUsedAt: "2026-08-12T16:00:00.000Z" },
    { tag: "ラーメン", count: 7, lastUsedAt: "2026-07-20T12:00:00.000Z" },
    { tag: "カフェ", count: 5, lastUsedAt: "2026-08-12T10:00:00.000Z" },
    { tag: "絶景", count: 4, lastUsedAt: "2026-06-14T09:00:00.000Z" },
    { tag: "そば", count: 3, lastUsedAt: "2026-08-11T11:30:00.000Z" },
    { tag: "神社", count: 2, lastUsedAt: "2026-05-03T10:00:00.000Z" },
    { tag: "宿", count: 2, lastUsedAt: "2026-08-11T19:00:00.000Z" },
  ],
  updatedAt: "2026-08-12T16:00:00.000Z",
};

const mockProfile = {
  did: MOCK_DID,
  handle: MOCK_HANDLE,
  displayName: "Trailcast Demo",
  description: "UI 確認用のモックアカウント",
};

const mockDidDoc = {
  id: MOCK_DID,
  service: [
    {
      id: "#atproto_pds",
      type: "AtprotoPersonalDataServer",
      serviceEndpoint: MOCK_PDS,
    },
  ],
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Agent 経由のレスポンスは lexicon 検証で CID がパースされるため、
// 正規の形式 (CIDv1 / identity multihash / 空) を使う。
const MOCK_CID = "bafkqaaa";

function toRecordEnvelope(collection: string, rkey: string, value: unknown) {
  return {
    uri: buildAtUri(MOCK_DID, collection, rkey),
    cid: MOCK_CID,
    value,
  };
}

/** /xrpc/* をメソッド名で振り分ける。未対応は 501 (呼ばれたら console で気付ける) */
function handleXrpc(url: URL): Response {
  const nsid = url.pathname.replace(/^\/xrpc\//, "");
  const collection = url.searchParams.get("collection");
  const rkey = url.searchParams.get("rkey");

  switch (nsid) {
    case "com.atproto.repo.getRecord": {
      if (collection === NSID_THREAD && rkey === MOCK_THREAD_RKEY) {
        return json(toRecordEnvelope(NSID_THREAD, rkey, mockThread));
      }
      if (collection === NSID_TAG_INDEX && rkey === TAG_INDEX_RKEY) {
        return json(toRecordEnvelope(NSID_TAG_INDEX, rkey, mockTagIndex));
      }
      return json(
        { error: "RecordNotFound", message: `mock: ${collection}/${rkey}` },
        400,
      );
    }
    case "com.atproto.repo.listRecords": {
      if (collection === NSID_POST) {
        return json({
          records: mockPosts.map((p) =>
            toRecordEnvelope(NSID_POST, p.rkey, p.value),
          ),
        });
      }
      if (collection === NSID_THREAD) {
        return json({
          records: [
            toRecordEnvelope(NSID_THREAD, MOCK_THREAD_RKEY, mockThread),
          ],
        });
      }
      if (collection === NSID_BOOKMARK) {
        return json({ records: [] });
      }
      return json({ records: [] });
    }
    case "com.atproto.repo.putRecord": {
      // タグ辞書の再構築などが書き込みに来る。保存はせず成功だけ返す
      // (procedure のためパラメータは body 側にあるが、返り値は使われないので固定で良い)
      return json({
        uri: buildAtUri(MOCK_DID, NSID_TAG_INDEX, TAG_INDEX_RKEY),
        cid: MOCK_CID,
      });
    }
    case "app.bsky.actor.getProfile":
      return json(mockProfile);
    case "com.atproto.identity.resolveHandle":
      return json({ did: MOCK_DID });
    default:
      console.warn("[api-mock] 未対応の XRPC:", nsid, url.toString());
      return json(
        { error: "MethodNotImplemented", message: `mock 未対応: ${nsid}` },
        501,
      );
  }
}

/**
 * このリクエストをモックすべきなら Response を返し、無関係なら null。
 * モック DID に関するものだけ横取りし、それ以外 (dev サーバの asset 等) は素通し。
 */
function matchGlobalMock(urlStr: string): Response | null {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return null;
  }
  if (url.hostname === "plc.directory") {
    return url.pathname.includes(MOCK_DID) ? json(mockDidDoc) : null;
  }
  if (`${url.protocol}//${url.host}` === MOCK_PDS) {
    return handleXrpc(url);
  }
  // 公開 AppView / identity 解決はモックの actor / handle に対してのみ応答する
  if (
    url.hostname === "public.api.bsky.app" ||
    url.hostname === "bsky.social"
  ) {
    const actor =
      url.searchParams.get("actor") ?? url.searchParams.get("handle") ?? "";
    if (actor === MOCK_DID || actor === MOCK_HANDLE) {
      return handleXrpc(url);
    }
  }
  return null;
}

let fetchMockInstalled = false;

/** window.fetch をラップして、モック対象のリクエストだけ横取りする */
export function installApiMockFetch(): void {
  if (fetchMockInstalled || typeof window === "undefined") return;
  fetchMockInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const mocked = matchGlobalMock(urlStr);
    if (mocked) return mocked;
    return originalFetch(input, init);
  };
}

/**
 * ログイン済み Agent の代わりに使う SessionManager。
 * Agent からは相対パス (`/xrpc/...`) で呼ばれるので MOCK_PDS 基準で解決する。
 */
export function createMockSessionManager() {
  return {
    did: MOCK_DID,
    async fetchHandler(pathname: string) {
      return handleXrpc(new URL(pathname, MOCK_PDS));
    },
  };
}
