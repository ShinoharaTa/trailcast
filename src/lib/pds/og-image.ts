// スレッド用 OG 画像の生成 + PDS アップロードを束ねるヘルパー。
//
// `renderThreadOgImage` (Canvas) で生成した JPEG を `com.atproto.repo.uploadBlob`
// で PDS に保存し、`BlobRef` を返す。失敗時は null を返して呼び出し元で握りつぶす
// (= OG 画像が無いスレッドはデフォルト OG にフォールバックする運用)。

import type { BlobRef } from "@atproto/api";
import {
  buildBlobUrl,
  extractBlobCid,
  resolveDidPds,
} from "@/lib/pds/blob-url";
import { getProfile } from "@/lib/pds/identity";
import { uploadImage } from "@/lib/pds/posts";
import { getRecordViaPds } from "@/lib/pds/repo-read";
import {
  renderThreadOgImage,
  type ThreadOgRenderInput,
} from "@/lib/og/render-thread-og";

interface BskyProfileRecord {
  displayName?: string;
  description?: string;
  avatar?: BlobRef;
  banner?: BlobRef;
}

export interface BuildOgImageInput {
  /** 描画するタイトル。 */
  title: string;
  /** スレッド所有者の DID。アバター解決に使用。 */
  did: string;
  /**
   * 直近で処理したカバー画像 (Blob)。
   * 新規アップロード直後など、PDS から取り直すよりこちらを使った方が高速。
   */
  coverBlob?: Blob | null;
  /**
   * 既存スレッドの coverImage BlobRef。`coverBlob` が無いときに PDS 経由で
   * blob URL を組み立てて読み込む。
   */
  coverImage?: BlobRef | null;
}

/**
 * 与えられた情報から OG 画像 (1200x630 JPEG) を生成して PDS にアップロードする。
 * 生成・アップロードのいずれかに失敗した場合は警告を出して null を返す。
 */
export async function generateAndUploadThreadOgImage(
  input: BuildOgImageInput,
): Promise<BlobRef | null> {
  if (typeof document === "undefined") {
    // SSR / Node 上では Canvas を使えないのでスキップ
    return null;
  }
  try {
    const renderInput = await buildRenderInput(input);
    const out = await renderThreadOgImage(renderInput);
    const blob = await uploadImage(out.bytes, out.mimeType);
    return blob;
  } catch (e) {
    console.warn("[og] generate/upload failed", e);
    return null;
  }
}

async function buildRenderInput(
  input: BuildOgImageInput,
): Promise<ThreadOgRenderInput> {
  // カバー画像のソース解決:
  //   1) 引数の Blob があればそれを使う (アップロード直後パス)
  //   2) coverImage BlobRef があれば PDS URL を組み立てて URL を渡す
  //   3) どちらも無ければ undefined (デフォルト背景)
  let cover: Blob | string | null | undefined;
  if (input.coverBlob) {
    cover = input.coverBlob;
  } else if (input.coverImage) {
    const cid = extractBlobCid(input.coverImage);
    if (cid) {
      try {
        const pds = await resolveDidPds(input.did);
        cover = buildBlobUrl(pds, input.did, cid);
      } catch (e) {
        console.warn("[og] failed to resolve cover blob URL", e);
      }
    }
  }

  // プロフィール (表示名 / handle) を AppView から取得。
  // 取得失敗時はアバター無しでも生成できるよう、catch して進める。
  const profile = await getProfile(input.did).catch((e) => {
    console.warn("[og] getProfile failed", e);
    return null;
  });

  // アバターは AppView が返す cdn.bsky.app URL ではなく、ユーザー本人の PDS
  // (`com.atproto.sync.getBlob`) から取得する URL を使う。
  // 理由: cdn.bsky.app は CORS ヘッダー (Access-Control-Allow-Origin) を返さない
  // ため、ブラウザの fetch (mode: "cors") が拒否される。一方、PDS の getBlob は
  // CORS 許可済みなのでブラウザから取得できる。
  let avatarUrl: string | null = null;
  try {
    const profileRec = await getRecordViaPds<BskyProfileRecord>(
      input.did,
      "app.bsky.actor.profile",
      "self",
    );
    const avatarCid = extractBlobCid(profileRec.value?.avatar);
    if (avatarCid) {
      const pds = await resolveDidPds(input.did);
      avatarUrl = buildBlobUrl(pds, input.did, avatarCid);
    }
  } catch (e) {
    console.warn("[og] failed to resolve avatar from PDS", e);
  }

  return {
    title: input.title,
    cover,
    avatar: avatarUrl,
    displayName: profile?.displayName ?? null,
    handle: profile?.handle ?? null,
  };
}
