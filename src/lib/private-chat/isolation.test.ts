import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The voice path must never read notes or the private chat, and the private
 * side must never write into the voice path. Both are import-level facts, so
 * pin them at the source level: a stray import is the only way either could
 * regress.
 */
const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const VOICE_PATH_FILES = [
  "src/lib/aria/agent.ts",
  "src/lib/aria/answer-pipeline.ts",
  "src/lib/aria/context/build-context.ts",
  "src/lib/aria/context/summarize.ts",
  "src/lib/aria/context/meeting-summary.ts",
  "src/lib/aria/context/auto-title.ts",
  "src/lib/sessions/context-prefetch-cache.ts",
  "src/lib/sessions/repository.ts",
  "src/app/api/ask/route.ts",
];

const PRIVATE_SIDE_FILES = [
  "src/lib/private-chat/pipeline.ts",
  "src/lib/private-chat/context.ts",
  "src/lib/private-chat/repository.ts",
  "src/lib/notes/enhance.ts",
  "src/lib/notes/repository.ts",
];

describe("context isolation", () => {
  it("the voice path never imports notes or the private chat", () => {
    for (const file of VOICE_PATH_FILES) {
      const source = read(file);
      expect(source, file).not.toMatch(/@\/lib\/notes\//);
      expect(source, file).not.toMatch(/@\/lib\/private-chat\//);
    }
  });

  it("the private side never writes turns, compacts, retitles, or primes the prefetch cache", () => {
    for (const file of PRIVATE_SIDE_FILES) {
      const source = read(file);
      expect(source, file).not.toMatch(/\bappendTurn\b/);
      expect(source, file).not.toMatch(/maybeCompactSession|summarizeSession/);
      expect(source, file).not.toMatch(/autoTitleSession/);
      expect(source, file).not.toMatch(/storePrefetchedContext/);
      expect(source, file).not.toMatch(/upsertMeetingSummary|upsertSummary/);
    }
  });
});
