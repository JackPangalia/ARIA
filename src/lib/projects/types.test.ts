import { describe, expect, it } from "vitest";
import { CreateProjectSchema, PatchProjectSchema } from "@/lib/projects/types";
import { CreateSessionSchema, PatchSessionSchema } from "@/lib/sessions/types";

describe("project schemas", () => {
  it("normalizes project names and default instructions", () => {
    const parsed = CreateProjectSchema.parse({ name: "  Launch plan  " });

    expect(parsed.name).toBe("Launch plan");
    expect(parsed.instructions).toBe("");
  });

  it("rejects oversized project instructions", () => {
    expect(() =>
      PatchProjectSchema.parse({ instructions: "x".repeat(12001) })
    ).toThrow();
  });
});

describe("session project assignment schemas", () => {
  it("accepts assigning and unassigning projects on create and patch", () => {
    expect(CreateSessionSchema.parse({ projectId: "proj_123" }).projectId).toBe(
      "proj_123"
    );
    expect(PatchSessionSchema.parse({ projectId: null }).projectId).toBeNull();
  });

  it("rejects empty project ids", () => {
    expect(() => CreateSessionSchema.parse({ projectId: "" })).toThrow();
    expect(() => PatchSessionSchema.parse({ projectId: "   " })).toThrow();
  });
});
