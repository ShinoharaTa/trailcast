import { create } from "zustand";
import {
  getAgent,
  initAuth,
  signOutCurrent,
  startSignIn,
} from "@/lib/atp-agent";

interface AuthState {
  did: string | null;
  handle: string | null;
  isAuthenticated: boolean;
  /** アプリ起動直後の OAuth init / セッション復元中フラグ */
  isLoading: boolean;
  /** signIn ボタン押下後、認可サーバへのリダイレクト発火直前まで true */
  isLoggingIn: boolean;
  error: string | null;

  /** ハンドル / DID / PDS URL を渡して認可サーバへリダイレクト */
  login: (identifier: string) => Promise<void>;
  /** ページロード毎に呼ぶ。OAuth callback の取り込みも兼ねる */
  restore: () => Promise<void>;
  /** サーバ側で revoke + ローカル状態クリア */
  logout: () => Promise<void>;
  clearError: () => void;
}

/** OAuth セッションの subject (DID) からハンドルを取りに行く */
async function fetchHandleForCurrentSession(did: string): Promise<string> {
  try {
    const agent = getAgent();
    const profile = await agent.app.bsky.actor.getProfile({ actor: did });
    return profile.data.handle;
  } catch {
    // ハンドル解決失敗時は DID をそのまま表示用フォールバックにする
    return did;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  did: null,
  handle: null,
  isAuthenticated: false,
  isLoading: true,
  isLoggingIn: false,
  error: null,

  login: async (identifier) => {
    const trimmed = identifier.trim();
    if (!trimmed) return;
    set({ isLoggingIn: true, error: null });
    try {
      // 通常はリダイレクトで離脱するため戻ってこない
      await startSignIn(trimmed);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "ログインに失敗しました";
      set({ isLoggingIn: false, error: msg });
      throw e;
    }
  },

  restore: async () => {
    set({ isLoading: true });
    try {
      const info = await initAuth();
      if (info) {
        const handle = await fetchHandleForCurrentSession(info.did);
        set({
          did: info.did,
          handle,
          isAuthenticated: true,
          isLoading: false,
          isLoggingIn: false,
        });
      } else {
        set({
          did: null,
          handle: null,
          isAuthenticated: false,
          isLoading: false,
          isLoggingIn: false,
        });
      }
    } catch (e) {
      console.warn("[auth] restore failed", e);
      set({
        did: null,
        handle: null,
        isAuthenticated: false,
        isLoading: false,
        isLoggingIn: false,
      });
    }
  },

  logout: async () => {
    try {
      await signOutCurrent();
    } finally {
      set({
        did: null,
        handle: null,
        isAuthenticated: false,
        isLoggingIn: false,
        error: null,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
