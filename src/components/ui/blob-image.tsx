"use client";

import { useEffect, useState } from "react";
import {
  buildBlobUrl,
  extractBlobCid,
  getCachedPdsUrl,
  resolveDidPds,
} from "@/lib/pds/blob-url";

/**
 * 指定 DID の PDS URL を解決して返すフック。
 * 初回レンダリング時にキャッシュにあれば即同期で値を返す。
 */
export function usePdsUrl(did: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    did ? getCachedPdsUrl(did) : null,
  );
  useEffect(() => {
    if (!did) {
      setUrl(null);
      return;
    }
    const cached = getCachedPdsUrl(did);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    resolveDidPds(did)
      .then((pds) => {
        if (!cancelled) setUrl(pds);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [did]);
  return url;
}

/**
 * DID と BlobRef から at-proto の blob URL を解決して `<img>` を描画する。
 * - PDS URL が既にキャッシュされていれば初回レンダリングで即表示
 * - キャッシュ無しなら DID doc を解決してから src を更新
 */
export function useBlobUrl(
  did: string | null | undefined,
  blobRef: unknown,
): string | null {
  const cid = extractBlobCid(blobRef);
  const [url, setUrl] = useState<string | null>(() => {
    if (!did || !cid) return null;
    const pds = getCachedPdsUrl(did);
    return pds ? buildBlobUrl(pds, did, cid) : null;
  });

  useEffect(() => {
    if (!did || !cid) {
      setUrl(null);
      return;
    }
    // キャッシュがあれば同期的に反映
    const cached = getCachedPdsUrl(did);
    if (cached) {
      setUrl(buildBlobUrl(cached, did, cid));
      return;
    }
    let cancelled = false;
    resolveDidPds(did)
      .then((pds) => {
        if (!cancelled) setUrl(buildBlobUrl(pds, did, cid));
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [did, cid]);

  return url;
}

export interface BlobImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  did: string | null | undefined;
  blobRef: unknown;
  fallback?: React.ReactNode;
}

export function BlobImage({
  did,
  blobRef,
  fallback = null,
  alt = "",
  ...imgProps
}: BlobImageProps) {
  const url = useBlobUrl(did, blobRef);
  if (!url) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} {...imgProps} />;
}
