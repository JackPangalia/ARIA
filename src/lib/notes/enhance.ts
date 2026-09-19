import {
  assertSessionOwner,
  formatTurnForContext,
  getCleanedTranscript,
  getMeetingSummary,
  listTurns,
} from "@/lib/sessions/repository";
import { applyCleanedTranscript } from "@/lib/sessions/cleaned-transcript";
import { llmGenerateText } from "@/lib/aria/llm/anthropic-client";
import { KIVO_MODEL_ID } from "@/lib/aria/models";
import {
  notesHtmlToText,
  sanitizeNotesHtml,
  unwrapModelHtml,
} from "@/lib/notes/sanitize-html";
import { decideGenerate } from "@/lib/notes/revision";
import {
  getEnhancedNotes,
  getPersonalNotes,
  markEnhancedNotesEmpty,
  markEnhancedNotesFailed,
  markEnhancedNotesGenerating,
  writeGeneratedEnhancedNotes,
} from "@/lib/notes/repository";
import {
  EnhancedNotesBusyError,
  EnhancedNotesEditedError,
  type EnhancedNotesDoc,
} from "@/lib/notes/types";
import type { MeetingSummaryDoc, TurnDoc } from "@/lib/sessions/types";

/**
 * Background-task model, like the meeting summary. One constant so the
 * enhanced notes can move to a larger model on their own if quality warrants.
 */
export const ENHANCED_NOTES_MODEL_ID = KIVO_MODEL_ID;

/** Below this many spoken turns the transcript alone is not worth a rewrite. */
const MIN_TRANSCRIPT_TURNS = 3;

/** Keeps the prompt well inside the model's window on very long sessions. */
const MAX_TRANSCRIPT_CHARS = 120_000;

const MAX_OUTPUT_TOKENS = 4096;

export const ENHANCED_NOTES_SYSTEM_PROMPT = `You write "enhanced notes" for the person who owns a set of meeting notes. You are given their own rough notes (possibly empty), a transcript of the room, and sometimes a short summary. Produce the notes they wish they had written: complete, accurate, and in their voice.

Rules:
- Their notes come first. Keep every point they wrote, keep their order and structure where it makes sense, and expand their shorthand using what the transcript says. Never contradict something they wrote unless the transcript plainly shows otherwise; then keep their point and add the correction.
- Fill in what they missed: topics, numbers, names, decisions, and commitments from the transcript that their notes skipped.
- If their notes are empty, write the notes a careful attendee would have taken.
- Group by topic with short headings. Do not use boilerplate headings like "Key points" for the body. Finish with an "Action items" section when there are any, and an "Open questions" section when there are any. Omit either section if it would be empty.
- Refer to the note owner as "you" where their notes say "I" or "me". Do not include speaker labels, timestamps, or a preamble.
- Do not invent anything that is in neither the notes nor the transcript.

Output format: plain HTML fragment only. Use exactly these tags and nothing else: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>. No attributes, no <html> or <body>, no markdown, no code fences, no commentary before or after. Start with one short paragraph (one to three sentences) that says what the conversation was about, then the sections.`;

export interface EnhancedNotesPromptInput {
  notesText: string;
  transcript: string;
  summary: MeetingSummaryDoc | null;
  title: string;
}

/** Pure prompt assembly, exported so tests can pin what the model sees. */
export function buildEnhancedNotesPrompt(input: EnhancedNotesPromptInput): string {
  const sections: string[] = [`# Conversation title\n${input.title}`];
  sections.push(
    `# The owner's own notes\n${input.notesText.trim() || "(They wrote nothing. Write the notes from the transcript alone.)"}`
  );
  if (input.summary) {
    const bullets = (label: string, items: string[]) =>
      items.length > 0 ? `${label}:\n${items.map((item) => `- ${item}`).join("\n")}` : null;
    const summaryText = [
      input.summary.overview,
      bullets("Decisions", input.summary.decisions),
      bullets("Action items", input.summary.actionItems),
    ]
      .filter(Boolean)
      .join("\n\n");
    sections.push(`# Summary already written for this conversation\n${summaryText}`);
  }
  const transcript =
    input.transcript.length > MAX_TRANSCRIPT_CHARS
      ? `${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}\n[transcript truncated]`
      : input.transcript;
  sections.push(`# Transcript of the room\n${transcript.trim() || "(nothing was transcribed)"}`);
  return sections.join("\n\n");
}

export function transcriptHasEnoughToWriteFrom(turns: TurnDoc[]): boolean {
  const substantive = turns.filter(
    (turn) => turn.role === "speaker" || turn.role === "user_question"
  ).length;
  return substantive >= MIN_TRANSCRIPT_TURNS;
}

/**
 * Writes the enhanced notes for a session from the room transcript plus the
 * owner's personal notes. Reads the meeting summary when one exists so both
 * records agree, but never writes back into `turns` or `context` — the
 * enhanced notes are a private document, not model context.
 */
export async function generateEnhancedNotes(
  uid: string,
  sessionId: string,
  options: { force?: boolean } = {}
): Promise<EnhancedNotesDoc> {
  const session = await assertSessionOwner(uid, sessionId);
  const current = await getEnhancedNotes(uid, sessionId);
  const decision = decideGenerate(current, {
    force: Boolean(options.force),
    now: Date.now(),
  });
  if (decision.kind === "busy") throw new EnhancedNotesBusyError(current);
  if (decision.kind === "edited") throw new EnhancedNotesEditedError(current);

  const [rawTurns, cleaned, summary, personal] = await Promise.all([
    listTurns(uid, sessionId, 2000),
    getCleanedTranscript(uid, sessionId).catch(() => null),
    getMeetingSummary(uid, sessionId).catch(() => null),
    getPersonalNotes(uid, sessionId),
  ]);
  const notesText = notesHtmlToText(personal.content);

  if (!notesText && !transcriptHasEnoughToWriteFrom(rawTurns)) {
    return markEnhancedNotesEmpty(uid, sessionId);
  }

  const generating = await markEnhancedNotesGenerating(uid, sessionId);
  const generationStartedAt = generating.updatedAt ?? new Date().toISOString();

  const turns = applyCleanedTranscript(rawTurns, cleaned);
  const transcript = turns.map((turn) => formatTurnForContext(turn)).join("\n");

  let html: string;
  try {
    const raw = await llmGenerateText({
      model: ENHANCED_NOTES_MODEL_ID,
      system: ENHANCED_NOTES_SYSTEM_PROMPT,
      user: buildEnhancedNotesPrompt({
        notesText,
        transcript,
        summary,
        title: session.title,
      }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    });
    html = sanitizeNotesHtml(unwrapModelHtml(raw));
    if (!notesHtmlToText(html)) {
      throw new Error("Kivo returned empty notes.");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enhanced notes failed.";
    await markEnhancedNotesFailed(uid, sessionId, message).catch(() => undefined);
    throw err;
  }

  const { doc } = await writeGeneratedEnhancedNotes(uid, sessionId, {
    content: html,
    generationStartedAt,
    sourceNotesRevision: personal.revision,
    sourceTurnCount: rawTurns.length,
  });
  return doc;
}
