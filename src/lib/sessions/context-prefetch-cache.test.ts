import { beforeEach, describe, expect, it } from "vitest";
import {
  resetContextPrefetchCacheForTests,
  storePrefetchedContext,
  takePrefetchedContext,
  type PrefetchedContextBundle,
} from "./context-prefetch-cache";

const bundle = {
  messages: "stable context",
  stableContext: "stable context",
  liveTranscript: "",
  history: [],
  tokenEstimate: 10,
  question: "draft",
  log: {},
} as unknown as PrefetchedContextBundle;

describe("context prefetch cache", () => {
  beforeEach(resetContextPrefetchCacheForTests);

  it("reuses a near-final draft and preserves the exact settled question", () => {
    storePrefetchedContext(
      "session",
      "What did we decide about the launch timeline",
      bundle
    );

    const result = takePrefetchedContext(
      "session",
      "What did we decide about the launch timeline yesterday?"
    );

    expect(result?.messages).toBe("stable context");
    expect(result?.question).toBe(
      "What did we decide about the launch timeline yesterday?"
    );
  });

  it("rejects an unrelated question", () => {
    storePrefetchedContext("session", "What is the launch timeline?", bundle);
    expect(
      takePrefetchedContext("session", "Who is presenting the design review?")
    ).toBeNull();
  });
});

