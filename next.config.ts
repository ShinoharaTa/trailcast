import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // next dev 中のみ有効 (output: "export" では本番ビルドで無視されるため警告が出るが動作に影響なし)
  // 本番の静的エクスポートでは public/_redirects が SPA フォールバックを担う。
  // ここではクライアントルーター管轄の全パスを / に巻き戻す (既存ファイル/Next 内部パスは対象外)。
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/:path*",
          destination: "/",
        },
      ],
    };
  },
};

export default nextConfig;
