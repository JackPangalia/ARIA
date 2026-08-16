import { describe, expect, it } from "vitest";
import {
  buildProjectContextSection,
  buildSessionHeader,
  trimProjectInstructionsForContext,
} from "@/lib/aria/context/build-context";
import type { ProjectDoc } from "@/lib/projects/types";

function project(patch: Partial<ProjectDoc> = {}): ProjectDoc {
  return {
    id: "project-1",
    name: "Launch",
    instructions: "Answer with launch context.",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...patch,
  };
}

describe("buildProjectContextSection", () => {
  it("formats active project instructions", () => {
    const section = buildProjectContextSection(project());

    expect(section).toContain("# Project");
    expect(section).toContain("Name: Launch");
    expect(section).toContain("Answer with launch context.");
  });

  it("omits archived projects", () => {
    expect(buildProjectContextSection(project({ status: "archived" }))).toBeNull();
  });
});

describe("trimProjectInstructionsForContext", () => {
  it("trims long instructions to the token budget", () => {
    const trimmed = trimProjectInstructionsForContext("a".repeat(100), 10);

    expect(trimmed.length).toBeLessThan(100);
    expect(trimmed).toContain("Project instructions truncated");
  });
});

describe("buildSessionHeader", () => {
  it("omits updatedAt so the cached prefix stays stable across asks", () => {
    const header = buildSessionHeader({
      id: "session-1",
      title: "Planning",
      projectId: "project-1",
      autoTitled: false,
      status: "active",
      speakerCount: 3,
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
      endedAt: null,
      trashedAt: null,
      lastSummaryAt: null,
      tokenEstimate: 0,
      searchableTextPreview: "",
      turnCount: 0,
      mode: "in_person",
      transcriptionMode: "basic",
      botId: null,
      meetingPlatform: null,
      botStatus: null,
    });

    expect(header).toContain("Title: Planning");
    expect(header).toContain("Project ID: project-1");
    expect(header).toContain("Status: active");
    expect(header).not.toContain("Updated:");
    expect(header).not.toContain("2026-08-12");
  });
});
