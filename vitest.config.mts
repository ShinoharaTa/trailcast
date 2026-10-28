import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 純関数の単体テスト用。`@/` は tsconfig の paths と揃える。
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // 日付キーはブラウザのローカル時刻で作るので、テストは JST に固定する (record-mode.md §3.4)
    env: { TZ: "Asia/Tokyo" },
  },
});
