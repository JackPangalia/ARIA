import { readFileSync } from "node:fs";

type Mark = {
  event: string;
  atMs: number;
  data?: Record<string, unknown>;
};

type Summary = {
  type: "voice-summary";
  turnId: string;
  marks: Mark[];
};

const inputPath = process.argv[2];
if (!inputPath) {
  console.error(
    "Usage: npm run voice:benchmark -- path/to/electron.log\n" +
      "                              -- .next/dev/logs/next-development.log"
  );
  process.exit(2);
}

/**
 * Two log formats carry the same lines. The Electron shell prints them raw;
 * `next dev` wraps every line in a JSON envelope
 * (`{"timestamp":…,"source":…,"message":"[VOICE_METRIC] {…}"}`), which escapes
 * the quotes of the payload inside it. Slicing a marker out of the envelope
 * yields unparseable JSON, so unwrap to the inner message first — without this
 * the whole Next dev log reads as zero turns.
 */
function logMessage(line: string): string {
  if (!line.startsWith("{")) return line;
  try {
    const envelope = JSON.parse(line) as { message?: unknown };
    return typeof envelope.message === "string" ? envelope.message : line;
  } catch {
    return line;
  }
}

const messages = readFileSync(inputPath, "utf8").split(/\r?\n/).map(logMessage);

const summaries: Summary[] = [];
for (const message of messages) {
  const marker = message.indexOf("[VOICE_METRIC] ");
  if (marker < 0) continue;
  try {
    const value = JSON.parse(message.slice(marker + "[VOICE_METRIC] ".length));
    if (value.type === "voice-summary" && Array.isArray(value.marks)) {
      summaries.push(value as Summary);
    }
  } catch {
    // Ignore non-JSON terminal decoration.
  }
}

/**
 * Server-side half of the same turn, from the `[ARIA] ask` pipeline log. The
 * client marks say *when* audio arrived; these say which stage spent the time
 * getting there, so one command covers both halves.
 *
 * Shape: `[ARIA] ask │ <session> │ <offset> │ <stage> │ k=v k=v`
 */
type ServerStage = { stage: string; detail: Record<string, string> };

const serverStages: ServerStage[] = [];
for (const message of messages) {
  if (!message.includes("[ARIA] ask ")) continue;
  const parts = message.split("│").map((part) => part.trim());
  if (parts[0] !== "[ARIA] ask" || parts.length < 4) continue;
  const detail: Record<string, string> = {};
  for (const pair of (parts[4] ?? "").split(/\s+/)) {
    const eq = pair.indexOf("=");
    if (eq > 0) detail[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  serverStages.push({ stage: parts[3]!, detail });
}

function stageValues(stage: string, key: string): number[] {
  return serverStages
    .filter((entry) => entry.stage === stage)
    .map((entry) => Number(entry.detail[key]))
    .filter((value) => Number.isFinite(value));
}

function duration(markers: Mark[], from: string, to: string): number | null {
  const start = markers.findLast((mark) => mark.event === from);
  const end = markers.find((mark) => mark.event === to && mark.atMs >= (start?.atMs ?? 0));
  return start && end ? end.atMs - start.atMs : null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
}

const speechToAudio = summaries
  .map(
    (turn) =>
      duration(turn.marks, "speech_end", "first_audible_sample") ??
      duration(turn.marks, "end_of_utterance", "first_audible_sample")
  )
  .filter((value): value is number => value != null);
const interrupts = summaries
  .map((turn) => duration(turn.marks, "barge_in_confirmed", "interrupt_complete"))
  .filter((value): value is number => value != null);
const stops = summaries
  .map((turn) => duration(turn.marks, "stop_requested", "stop_complete"))
  .filter((value): value is number => value != null);
const ducks = summaries.flatMap((turn) =>
  turn.marks
    .filter((mark) => mark.event === "barge_in_suspected")
    .map((mark) => mark.data?.duckMs)
    .filter((value): value is number => typeof value === "number")
);
const underruns = summaries.reduce(
  (count, turn) =>
    count + turn.marks.filter((mark) => mark.event === "playback_underrun").length,
  0
);
const pcmTurns = summaries.filter((turn) =>
  turn.marks.some(
    (mark) =>
      mark.event === "response_headers" && mark.data?.format === "pcm"
  )
);
const fallbacks = pcmTurns.filter((turn) =>
  turn.marks.some(
    (mark) =>
      mark.event === "response_headers" &&
      typeof mark.data?.fallback === "string"
  )
);

const p50 = percentile(speechToAudio, 0.5);
const p95 = percentile(speechToAudio, 0.95);
const interruptP95 = percentile(interrupts, 0.95);
const stopP95 = percentile(stops, 0.95);
const duckP95 = percentile(ducks, 0.95);
const fallbackRate = pcmTurns.length > 0 ? fallbacks.length / pcmTurns.length : 0;

console.log({
  turns: summaries.length,
  measuredSpeechToAudio: speechToAudio.length,
  speechEndToFirstAudioP50Ms: p50,
  speechEndToFirstAudioP95Ms: p95,
  hardInterruptP95Ms: interruptP95,
  duckP95Ms: duckP95,
  localStopP95Ms: stopP95,
  playbackUnderruns: underruns,
  cartesiaWsFallbackRate: fallbackRate,
});

// Server-side breakdown. Diagnostic only — the gates below stay on the
// client-measured spoken latency, which is what a person in the room feels.
const cacheReads = stageValues("llm.cache", "cacheRead");
if (serverStages.length > 0) {
  console.log({
    asks: stageValues("session.ok", "setupMs").length,
    completions: cacheReads.length,
    setupP50Ms: percentile(stageValues("session.ok", "setupMs"), 0.5),
    contextBuildP50Ms: percentile(stageValues("context.done", "ms"), 0.5),
    llmFirstTokenP50Ms: percentile(stageValues("llm.first_token", "ms"), 0.5),
    ttsEnqueueP50Ms: percentile(stageValues("tts.enqueue", "ms"), 0.5),
    audioFirstByteP50Ms: percentile(stageValues("audio.first_byte", "ms"), 0.5),
    promptCacheHitRate:
      cacheReads.length > 0
        ? cacheReads.filter((value) => value > 0).length / cacheReads.length
        : null,
    inputTokensP50: percentile(stageValues("llm.cache", "inputTokens"), 0.5),
    speculationsDiscarded: summaries.filter((turn) =>
      turn.marks.some((mark) => mark.event === "speculation_discarded")
    ).length,
    speculationsAdopted: summaries.filter((turn) =>
      turn.marks.some((mark) => mark.event === "speculation_adopted")
    ).length,
  });
}

const failures = [
  p50 != null && p50 > 1300 ? `p50 ${p50}ms > 1300ms` : null,
  p95 != null && p95 > 1800 ? `p95 ${p95}ms > 1800ms` : null,
  interruptP95 != null && interruptP95 > 250
    ? `interrupt p95 ${interruptP95}ms > 250ms`
    : null,
  duckP95 != null && duckP95 > 100 ? `duck p95 ${duckP95}ms > 100ms` : null,
  stopP95 != null && stopP95 > 50 ? `stop p95 ${stopP95}ms > 50ms` : null,
  fallbackRate >= 0.01
    ? `Cartesia fallback ${(fallbackRate * 100).toFixed(1)}% >= 1%`
    : null,
].filter(Boolean);

if (failures.length > 0) {
  console.error(`Voice quality gates failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

