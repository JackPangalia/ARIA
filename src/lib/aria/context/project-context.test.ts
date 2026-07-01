import { describe, expect, it } from "vitest";
import {
  buildProjectContextSection,
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
