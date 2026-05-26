"use client";

import { create } from "zustand";
import type { SessionDetailResponse, SessionDoc } from "@/lib/sessions/types";

interface SessionUiState {
  sessions: SessionDoc[];
  selectedSessionId: string | null;
  detail: SessionDetailResponse | null;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  sidebarOpen: boolean;

  setSessions: (sessions: SessionDoc[]) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setDetail: (detail: SessionDetailResponse | null) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useSessionStore = create<SessionUiState>((set) => ({
  sessions: [],
  selectedSessionId: null,
  detail: null,
  searchQuery: "",
  loading: true,
  error: null,
  sidebarOpen: false,

  setSessions: (sessions) => set({ sessions }),
  setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),
  setDetail: (detail) => set({ detail }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
