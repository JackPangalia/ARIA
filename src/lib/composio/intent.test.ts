import { describe, expect, it } from "vitest";
import { resolveConnectorToolkits } from "@/lib/composio/intent";

describe("resolveConnectorToolkits", () => {
  it("returns empty for conversational questions", () => {
    expect(resolveConnectorToolkits("What's the color of the sky?")).toEqual([]);
    expect(resolveConnectorToolkits("What did Sarah say about Q3?")).toEqual([]);
  });

  it("detects explicit toolkit names", () => {
    expect(
      resolveConnectorToolkits("Send this to my notion database")
    ).toEqual(["notion"]);
    expect(resolveConnectorToolkits("Check my gmail inbox")).toEqual(["gmail"]);
  });

  it("maps synonyms to toolkits", () => {
    expect(resolveConnectorToolkits("Draft an email to the team")).toEqual([
      "gmail",
    ]);
    expect(resolveConnectorToolkits("What's on my calendar tomorrow")).toEqual(
      ["googlecalendar"]
    );
  });
});
