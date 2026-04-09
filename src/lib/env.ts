/**
 * Tauri WebView 内で動作しているかどうかを判定する。
 * Tauri v2 は window.__TAURI_INTERNALS__ を注入する。
 */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window
  );
}

export function isWeb(): boolean {
  return !isTauri();
}
