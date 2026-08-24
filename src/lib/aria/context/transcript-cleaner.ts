import {
  assertSessionOwner,
  listTurns,
  upsertCleanedTranscript,
} from "@/lib/sessions/repository";
import { llmCleanTranscript } from "@/lib/aria/llm/anthropic-client";
import { KIVO_MODEL_ID } from "@/lib/aria/models";
import {
  isCleanableTurn,
  validateCleanedTurns,
} from "@/lib/sessions/cleaned-transcript";
import type {
  CleanedTranscriptDoc,
  CleanedTranscriptTurn,
  TurnDoc,
} from "@/lib/sessions/types";

/** Below this, there is nothing to clean up that a reader would notice. */
const MIN_CLEANABLE_TURNS = 3;

/**
 * Turns per model call. Large enough that a thought split across several turns
 * is visible in one window and can be stitched back together.
 */
export const CLEAN_CHUNK_SIZE = 40;

const MAX_OUTPUT_TOKENS_PER_CHUNK = 8192;

/**
 * Chunks in flight at once. The route this runs under has a 60s ceiling and a
 * long session is many chunks, so they cannot go one at a time; capped so a
 * long transcript doesn't open dozens of concurrent Anthropic calls.
 */
const MAX_CONCURRENT_CHUNKS = 4;

const SYSTEM_PROMPT = `Clean this transcript up

Each turn has an id. Return the cleaned transcript in order, each entry listing the ids it came from. Merge turns that belong together and list every id you merged. Never merge different speakers.
`;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Produces a readable version of the transcript, stored alongside the raw
 * turns rather than replacing them.
 *
 * Raw stays the record of what was recognized: the cleaner is an LLM and will
 * occasionally smooth a phrase into something slightly different from what was
 * said, so both are kept and either can be shown. Runs when a session stops,
 * before the summary, so the summary reads clean input.
 */
export async function cleanSessionTranscript(
  uid: string,
  sessionId: string
): Promise<CleanedTranscriptDoc | null> {
  await assertSessionOwner(uid, sessionId);

  const turns = await listTurns(uid, sessionId, 2000);
  const cleanable = turns.filter(
    (turn) => isCleanableTurn(turn) && turn.text.trim().length > 0
  );
  if (cleanable.length < MIN_CLEANABLE_TURNS) return null;

  // Where each turn sits in the real transcript. Merges are checked against
  // this, so two questions Kivo answered between can't be fused into one.
  const position = new Map(turns.map((turn, index) => [turn.id, index]));

  // Chunk the whole transcript, not just the cleanable turns: without Kivo's
  // replies in view the model sees consecutive questions where the room had a
  // back-and-forth, and merges them.
  const batches = chunk(
    turns.filter((turn) => turn.text.trim().length > 0),
    CLEAN_CHUNK_SIZE
  );
  const results: CleanedTranscriptTurn[][] = new Array(batches.length).fill([]);

  const cleanBatch = async (batch: TurnDoc[], index: number) => {
    // Kivo's replies are context only — truncated, since the model just needs
    // to see that a reply happened, not read the whole answer.
    const payload = batch.map((turn) =>
      isCleanableTurn(turn)
        ? {
            id: turn.id,
            speaker: turn.speakerName ?? `Speaker ${(turn.speaker ?? 0) + 1}`,
            text: turn.text,
          }
        : {
            id: turn.id,
            speaker: "Kivo",
            reply: true,
            text: `${turn.text.slice(0, 120)}…`,
          }
    );

    try {
      const parsed = await llmCleanTranscript({
        model: KIVO_MODEL_ID,
        system: SYSTEM_PROMPT,
        user: JSON.stringify({ turns: payload }, null, 2),
        maxOutputTokens: MAX_OUTPUT_TOKENS_PER_CHUNK,
      });
      results[index] = validateCleanedTurns(
        batch.filter(isCleanableTurn),
        parsed.turns,
        position
      );
    } catch (err) {
      // One bad chunk must not lose its turns: record them verbatim so the
      // readable transcript still contains them, just uncleaned.
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error(`[TranscriptCleaner] Chunk failed (${msg})`);
      results[index] = batch.filter(isCleanableTurn).map((turn) => ({
        sourceTurnIds: [turn.id],
        text: turn.text,
      }));
    }
  };

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_CHUNKS) {
    await Promise.all(
      batches
        .slice(i, i + MAX_CONCURRENT_CHUNKS)
        .map((batch, offset) => cleanBatch(batch, i + offset))
    );
  }

  const cleaned = results.flat();
  if (cleaned.length === 0) return null;

  return upsertCleanedTranscript(uid, sessionId, {
    turns: cleaned,
    turnCountAtGeneration: turns.length,
    model: KIVO_MODEL_ID,
  });
}
