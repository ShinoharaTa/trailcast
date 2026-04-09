import { create } from "zustand";

export interface ThreadRecord {
  uri: string;
  rkey: string;
  title: string;
  description?: string;
  visibility: "private" | "public";
  coverImage?: string;
  createdAt: string;
}

export interface PostRecord {
  uri: string;
  rkey: string;
  threadUri: string;
  text?: string;
  images: string[];
  location?: { latitude: number; longitude: number; altitude?: number };
  checkpointAt: string;
  exif?: Record<string, unknown>;
  sourceRef?: string;
  createdAt: string;
  authorDid: string;
  authorHandle?: string;
  authorAvatar?: string;
}

interface ThreadStoreState {
  threads: ThreadRecord[];
  currentThread: ThreadRecord | null;
  currentPosts: PostRecord[];
  isLoadingThreads: boolean;
  isLoadingPosts: boolean;

  setThreads: (threads: ThreadRecord[]) => void;
  setCurrentThread: (thread: ThreadRecord | null) => void;
  setCurrentPosts: (posts: PostRecord[]) => void;
  setLoadingThreads: (v: boolean) => void;
  setLoadingPosts: (v: boolean) => void;
  reset: () => void;
}

export const useThreadStore = create<ThreadStoreState>((set) => ({
  threads: [],
  currentThread: null,
  currentPosts: [],
  isLoadingThreads: false,
  isLoadingPosts: false,

  setThreads: (threads) => set({ threads }),
  setCurrentThread: (currentThread) => set({ currentThread }),
  setCurrentPosts: (currentPosts) => set({ currentPosts }),
  setLoadingThreads: (isLoadingThreads) => set({ isLoadingThreads }),
  setLoadingPosts: (isLoadingPosts) => set({ isLoadingPosts }),
  reset: () =>
    set({
      threads: [],
      currentThread: null,
      currentPosts: [],
    }),
}));
