"use client";

import { create } from "zustand";
import type { ProjectDoc } from "@/lib/projects/types";
import type { SessionDetailResponse, SessionDoc } from "@/lib/sessions/types";

export type ProjectFilter = "all" | "unassigned" | "project";

interface SessionUiState {
  projects: ProjectDoc[];
  sessions: SessionDoc[];
  selectedSessionId: string | null;
  selectedProjectId: string | null;
  projectFilter: ProjectFilter;
  detail: SessionDetailResponse | null;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  sidebarOpen: boolean;

  setProjects: (projects: ProjectDoc[]) => void;
  setSessions: (sessions: SessionDoc[]) => void;
  setSelectedSessionId: (sessionId: string | null) => void;
  setProjectSelection: (filter: ProjectFilter, projectId?: string | null) => void;
  setDetail: (detail: SessionDetailResponse | null) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useSessionStore = create<SessionUiState>((set) => ({
  projects: [],
  sessions: [],
  selectedSessionId: null,
  selectedProjectId: null,
  projectFilter: "all",
  detail: null,
  searchQuery: "",
  loading: true,
  error: null,
  sidebarOpen: false,

  setProjects: (projects) => set({ projects }),
  setSessions: (sessions) => set({ sessions }),
  setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),
  setProjectSelection: (projectFilter, selectedProjectId = null) =>
    set({ projectFilter, selectedProjectId }),
  setDetail: (detail) => set({ detail }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
