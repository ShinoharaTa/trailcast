import { create } from "zustand";
import {
  getAgent,
  loginWithPassword,
  resumeSession,
  logout as agentLogout,
} from "@/lib/atp-agent";

interface AuthState {
  did: string | null;
  handle: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (identifier: string, password: string) => Promise<void>;
  restore: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  did: null,
  handle: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (identifier, password) => {
    set({ isLoading: true, error: null });
    try {
      await loginWithPassword(identifier, password);
      const agent = getAgent();
      set({
        did: agent.session?.did ?? null,
        handle: agent.session?.handle ?? null,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "ログインに失敗しました";
      set({ isLoading: false, error: msg });
      throw e;
    }
  },

  restore: async () => {
    set({ isLoading: true });
    const ok = await resumeSession();
    if (ok) {
      const agent = getAgent();
      set({
        did: agent.session?.did ?? null,
        handle: agent.session?.handle ?? null,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      set({ isLoading: false });
    }
  },

  logout: () => {
    agentLogout();
    set({
      did: null,
      handle: null,
      isAuthenticated: false,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
