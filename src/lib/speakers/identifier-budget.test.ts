import { describe, expect, it } from "vitest";
import {
  selectSpeakerIdentifierBudget,
  SPEECHMATICS_MAX_TOTAL_IDENTIFIERS,
} from "./identifier-budget";

function profile(label: string, count: number) {
  return {
    label,
    speakerIdentifiers: Array.from({ length: count }, (_, i) => `${label}-${i}`),
  };
}

describe("selectSpeakerIdentifierBudget", () => {
  it("passes everything through when the budget is not binding", () => {
    const profiles = [profile("alice", 3), profile("bob", 2)];
    expect(selectSpeakerIdentifierBudget(profiles)).toEqual(profiles);
  });

  it("never exceeds the provider ceiling", () => {
    const profiles = Array.from({ length: 25 }, (_, i) => profile(`p${i}`, 8));
    const selected = selectSpeakerIdentifierBudget(profiles);
    const total = selected.reduce(
      (sum, entry) => sum + entry.speakerIdentifiers.length,
      0
    );
    expect(total).toBe(SPEECHMATICS_MAX_TOTAL_IDENTIFIERS);
  });

  it("gives every profile a print before deepening any of them", () => {
    const profiles = Array.from({ length: 25 }, (_, i) => profile(`p${i}`, 8));
    const selected = selectSpeakerIdentifierBudget(profiles);
    expect(selected).toHaveLength(25);
    for (const entry of selected) {
      expect(entry.speakerIdentifiers.length).toBeGreaterThanOrEqual(1);
    }
    // 50 across 25 profiles is exactly two each, anchors first.
    expect(selected[0]!.speakerIdentifiers).toEqual(["p0-0", "p0-1"]);
  });

  it("spends leftover budget on the profiles that have depth", () => {
    const selected = selectSpeakerIdentifierBudget(
      [profile("alice", 5), profile("bob", 1)],
      4
    );
    expect(selected).toEqual([
      { label: "alice", speakerIdentifiers: ["alice-0", "alice-1", "alice-2"] },
      { label: "bob", speakerIdentifiers: ["bob-0"] },
    ]);
  });

  it("drops the tail rather than sending a speaker with no identifiers", () => {
    const profiles = Array.from({ length: 4 }, (_, i) => profile(`p${i}`, 2));
    const selected = selectSpeakerIdentifierBudget(profiles, 2);
    expect(selected).toHaveLength(2);
    expect(
      selected.every((entry) => entry.speakerIdentifiers.length > 0)
    ).toBe(true);
  });

  it("ignores profiles that have no voiceprint yet", () => {
    const selected = selectSpeakerIdentifierBudget([
      { label: "empty", speakerIdentifiers: [] },
      profile("alice", 1),
    ]);
    expect(selected).toEqual([{ label: "alice", speakerIdentifiers: ["alice-0"] }]);
  });
});
