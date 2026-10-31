import type { MetadataRoute } from "next";

// output: "export" で out/manifest.webmanifest として書き出すために静的化する。
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trailcast",
    short_name: "Trailcast",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "ja",
    // layout.tsx の viewport.themeColor と揃える
    theme_color: "#0a0e1a",
    background_color: "#020617",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
