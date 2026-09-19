import { describe, expect, it } from "vitest";
import {
  GENERATION_STALE_MS,
  decideGenerate,
  decideSave,
  generationResultSupersededByEdit,
} from "@/lib/notes/revision";
import { EMPTY_ENHANCED_NOTES, type EnhancedNotesDoc } from "@/lib/notes/types";

function enhanced(overrides: Partial<EnhancedNotesDoc>): EnhancedNotesDoc {
  return { ...EMPTY_ENHANCED_NOTES, ...overrides };
}

describe("decideSave", () => {
  it("writes the next revision when the base matches", () => {
    expect(decideSave(3, 3)).toEqual({ kind: "write", nextRevision: 4 });
  });

  it("refuses a stale base so an old tab cannot clobber newer work", () => {
    expect(decideSave(5, 3)).toEqual({ kind: "conflict" });
    expect(decideSave(0, 1)).toEqual({ kind: "conflict" });
  });
});

describe("decideGenerate", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");

  it("starts on a fresh document", () => {
    expect(decideGenerate(EMPTY_ENHANCED_NOTES, { force: false, now })).toEqual({
      kind: "start",
    });
  });

  it("is busy while a recent generation is flagged", () => {
    const doc = enhanced({
      status: "generating",
      updatedAt: new Date(now - 10_000).toISOString(),
    });
    expect(decideGenerate(doc, { force: false, now })).toEqual({ kind: "busy" });
  });

  it("recovers from a generation that never finished", () => {
    const doc = enhanced({
      status: "generating",
      updatedAt: new Date(now - GENERATION_STALE_MS - 1).toISOString(),
    });
    expect(decideGenerate(doc, { force: false, now })).toEqual({ kind: "start" });
  });

  it("never silently replaces manual edits", () => {
    const doc = enhanced({ status: "ready", content: "<p>x</p>", editedAt: "2026-09-07T11:00:00Z" });
    expect(decideGenerate(doc, { force: false, now })).toEqual({ kind: "edited" });
    expect(decideGenerate(doc, { force: true, now })).toEqual({ kind: "start" });
  });
});

describe("generationResultSupersededByEdit", () => {
  it("drops a result when an edit landed after the generation started", () => {
    const started = "2026-09-07T12:00:00Z";
    expect(
      generationResultSupersededByEdit(
        enhanced({ editedAt: "2026-09-07T12:00:30Z" }),
        started
      )
    ).toBe(true);
    expect(
      generationResultSupersededByEdit(
        enhanced({ editedAt: "2026-09-07T11:59:30Z" }),
        started
      )
    ).toBe(false);
    expect(generationResultSupersededByEdit(enhanced({}), started)).toBe(false);
  });
});
