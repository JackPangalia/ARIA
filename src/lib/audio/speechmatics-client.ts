"use client";

import { devLog } from "@/lib/client/dev-log";
import { selectSpeakerIdentifierBudget } from "@/lib/speakers/identifier-budget";
import {
  maxSpeakersForProfiles,
  preferCurrentSpeakerForProfiles,
  speakerSensitivityForProfiles,
} from "@/lib/speakers/diarization-config";
import type { SpeakerProfileDoc } from "@/lib/speakers/types";
import type { TranscriptionMode } from "@/lib/sessions/types";
import type { TranscriptUtterance } from "@/lib/types";
import { VOICE_ENGINE_V2_TIMING } from "./voice-engine-config";

type SpeechmaticsTranscriptResult = {
  type: "word" | "punctuation" | "entity";
  start_time?: number;
  end_time?: number;
  alternatives?: Array<{
    content: string;
    confidence?: number;
    speaker?: string;
  }>;
};

type SpeechmaticsMessage =
  | {
      message: "RecognitionStarted";
    }
  | {
      message: "AddPartialTranscript" | "AddTranscript";
      metadata: {
        start_time: number;
        end_time: number;
        transcript: string;
      };
      results: SpeechmaticsTranscriptResult[];
    }
  | {
      message: "EndOfUtterance";
    }
  | {
      message: "SpeakersResult";
      speakers: Array<{
        label: string;
        speaker_identifiers: string[];
      }>;
    }
  | {
      message: "Error";
      type?: string;
      reason?: string;
    }
  | {
      message: string;
      [key: string]: unknown;
    };

type TranscriptMessage = {
  message: "AddPartialTranscript" | "AddTranscript";
  metadata: {
    start_time: number;
    end_time: number;
    transcript: string;
  };
  results: SpeechmaticsTranscriptResult[];
};

type SpeakersResultMessage = {
  message: "SpeakersResult";
  speakers: Array<{
    label: string;
    speaker_identifiers: string[];
  }>;
};

export interface SpeechmaticsSpeakerResult {
  label: string;
  speakerIdentifiers: string[];
  /** Recognition-stream namespace; provider labels restart after reconnects. */
  streamEpoch: number;
}

export interface SpeechmaticsClientCallbacks {
  onUtterance: (u: TranscriptUtterance) => void;
  onUtteranceEnd: () => void;
  onSpeakersResult?: (speakers: SpeechmaticsSpeakerResult[]) => void;
  onError: (err: Error) => void;
  onOpen: () => void;
  onClose: () => void;
  /** Fired when a dropped connection is being retried (attempt is 1-based). */
  onReconnecting?: (attempt: number) => void;
}

export type SpeechmaticsClientOptions = {
  /** Recommended enrollment mode: auto-return speaker identifiers at end of stream. */
  enrollment?: boolean;
  /** Basic mode keeps transcription live but disables speaker diarization. */
  transcriptionMode?: TranscriptionMode;
  voiceEngineV2?: boolean;
};

type SpeakerGroup = {
  providerSpeakerLabel: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  /** Whether this run's audio fell inside a known assistant-speech interval. */
  overlapsAssistantSpeech: boolean;
};

const BASIC_PROVIDER_SPEAKER_LABEL = "conversation";
const BASIC_SPEAKER_NAME = "Conversation";

const SAMPLE_RATE = 16000;
// Reconnect policy: a session should only end when the user ends it, so every
// close the client didn't initiate is retried with exponential backoff.
const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;
// Small guard windows around actual TTS playback: words captured just before
// playback starts (mic buffering lag) or shortly after it ends (speaker/room
// echo tail) are still attributed to Kivo's own voice, not the user's.
const ASSISTANT_SPEECH_PRE_ROLL_SECONDS = 0.15;
const ASSISTANT_SPEECH_ECHO_TAIL_SECONDS = 0.6;
const ASSISTANT_SPEECH_INTERVAL_MAX_AGE_SECONDS = 60;

export function safeSpeakerLabel(label: string): string {
  const clean = label.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!clean) return "Unknown speaker";
  // Speechmatics reserves labels like S1/S2 for internal generic speakers.
  return /^s\d+$/i.test(clean) ? `Speaker ${clean.slice(1)}` : clean;
}

function appendToken(current: string, token: string, type: string): string {
  if (!current) return token;
  if (type === "punctuation") return `${current}${token}`;
  return `${current} ${token}`;
}

export function groupSpeechmaticsResultsBySpeaker(
  results: SpeechmaticsTranscriptResult[],
  isEcho: (item: SpeechmaticsTranscriptResult) => boolean = () => false
): SpeakerGroup[] {
  const groups: SpeakerGroup[] = [];
  let current: SpeakerGroup | null = null;
  let lastSpeaker: string = "S1";

  for (const item of results) {
    const alt = item.alternatives?.[0];
    if (!alt?.content) continue;

    // Punctuation carries no speech of its own: it inherits the run it
    // terminates. Letting it open a run strands it as its own utterance,
    // which downstream rejoins with a space (" ." instead of ".").
    const punctuation = item.type === "punctuation";
    let speaker = alt.speaker ?? lastSpeaker;
    let echo = isEcho(item);
    if (punctuation && current) {
      speaker = current.providerSpeakerLabel;
      echo = current.overlapsAssistantSpeech;
    } else {
      lastSpeaker = speaker;
    }

    const start: number = item.start_time ?? current?.end ?? 0;
    const end: number = item.end_time ?? start;
    const confidence: number = alt.confidence ?? current?.confidence ?? 0;

    // A run breaks on a speaker change or an echo-flag change. Both are
    // emitted in this same chronological pass, so a run of Kivo's own echo in
    // the middle of a sentence no longer reorders the words around it.
    if (
      !current ||
      current.providerSpeakerLabel !== speaker ||
      current.overlapsAssistantSpeech !== echo
    ) {
      current = {
        providerSpeakerLabel: speaker,
        text: "",
        start,
        end,
        confidence,
        overlapsAssistantSpeech: echo,
      };
      groups.push(current);
    }

    current.text = appendToken(current.text, alt.content, item.type).trim();
    current.end = end;
    current.confidence = Math.max(current.confidence, confidence);
  }

  return groups.filter((group) => group.text.length > 0);
}

export function groupSpeechmaticsResultsAsConversation(
  results: SpeechmaticsTranscriptResult[]
): SpeakerGroup[] {
  let text = "";
  let start = 0;
  let end = 0;
  let confidence = 0;
  let sawToken = false;

  for (const item of results) {
    const alt = item.alternatives?.[0];
    if (!alt?.content) continue;

    if (!sawToken) {
      start = item.start_time ?? 0;
      confidence = alt.confidence ?? 0;
      sawToken = true;
    }

    text = appendToken(text, alt.content, item.type).trim();
    end = item.end_time ?? end;
    confidence = Math.max(confidence, alt.confidence ?? 0);
  }

  if (!sawToken || text.length === 0) return [];
  return [
    {
      providerSpeakerLabel: BASIC_PROVIDER_SPEAKER_LABEL,
      text,
      start,
      end,
      confidence,
      overlapsAssistantSpeech: false,
    },
  ];
}

export class SpeechmaticsLiveClient {
  private ws: WebSocket | null = null;
  private seqNo = 0;
  private recognitionStarted = false;
  private audioQueue: ArrayBuffer[] = [];
  private speakerLabelToIndex = new Map<string, number>();
  private speakerLabelToName = new Map<string, string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByClient = false;
  private endOfStreamSent = false;
  private reconnectAttempts = 0;
  private loggedStartConfig = false;
  private transcriptionMode: TranscriptionMode;
  // Counts recognition streams on this client (reconnects and restarts start a
  // new stream). Speechmatics timestamps restart at zero per stream, so the
  // epoch namespaces utterance ids and scopes the audio timeline below.
  private streamEpoch = 0;
  private finishSpeakersResolver:
    | ((speakers: SpeechmaticsSpeakerResult[]) => void)
    | null = null;
  private finishSpeakersTimer: ReturnType<typeof setTimeout> | null = null;
  // Seconds of mic PCM delivered to the *current* stream — the same timeline
  // Speechmatics uses for word start_time/end_time. Reset when a new stream
  // starts; counted at actual socket send so frames queued during an outage
  // (delivered to the next stream) land on the right timeline.
  private audioSecondsSent = 0;
  private assistantSpeechIntervals: Array<{ start: number; end: number | null }> =
    [];

  constructor(
    private callbacks: SpeechmaticsClientCallbacks,
    private profiles: SpeakerProfileDoc[] = [],
    private options: SpeechmaticsClientOptions = {}
  ) {
    this.transcriptionMode = options.enrollment
      ? "speaker"
      : (options.transcriptionMode ?? "speaker");
    for (const profile of profiles) {
      const label = safeSpeakerLabel(profile.name);
      this.speakerLabelToName.set(label, profile.name);
    }
  }

  /**
   * Swaps the enrolled voiceprints used to seed diarization. Takes effect on
   * the next StartRecognition — pair it with restartRecognition() when a voice
   * is learned mid-session, or the new profile sits unused until the next one.
   */
  setSpeakerProfiles(profiles: SpeakerProfileDoc[]): void {
    this.profiles = profiles;
    for (const profile of profiles) {
      this.speakerLabelToName.set(safeSpeakerLabel(profile.name), profile.name);
    }
    this.loggedStartConfig = false;
  }

  async connect(): Promise<void> {
    this.closedByClient = false;
    this.endOfStreamSent = false;
    const { getSpeechmaticsToken } = await import("@/lib/speakers/client");
    // Every (re)connect mints a fresh token, so the 600s token TTL is only ever
    // checked at connection time — an established stream outlives its token.
    const { token, region } = await getSpeechmaticsToken();
    const ws = new WebSocket(
      `wss://${region}.rt.speechmatics.com/v2?jwt=${encodeURIComponent(token)}`
    );
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.sendJson(this.buildStartRecognitionMessage());
    });

    // Every listener bails if this.ws has moved on — a socket abandoned by
    // restartRecognition() still fires its close/error events asynchronously
    // and must not clobber the replacement stream's state.
    ws.addEventListener("message", (event) => {
      if (this.ws !== ws) return;
      if (typeof event.data !== "string") return;
      let msg: SpeechmaticsMessage;
      try {
        msg = JSON.parse(event.data) as SpeechmaticsMessage;
      } catch {
        return;
      }
      this.handleMessage(msg);
    });

    ws.addEventListener("error", () => {
      if (this.ws !== ws) return;
      this.callbacks.onError(new Error("Speechmatics WebSocket error"));
    });

    ws.addEventListener("close", (event) => {
      if (this.ws !== ws) return;
      this.recognitionStarted = false;
      this.ws = null;
      this.callbacks.onClose();
      // Deliberate teardown (user stop, enrollment EndOfStream) ends here;
      // anything else — 1006 network blips included — gets retried.
      if (this.closedByClient || this.endOfStreamSent) return;
      devLog("speechmatics", `WS closed (code ${event.code}); reconnecting.`);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.callbacks.onError(
        new Error("Connection lost — check your network and restart listening.")
      );
      return;
    }
    this.reconnectAttempts += 1;
    const attempt = this.reconnectAttempts;
    this.callbacks.onReconnecting?.(attempt);
    const delay =
      Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
        RECONNECT_MAX_DELAY_MS
      ) +
      Math.random() * 500;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch((err) => this.handleConnectFailure(err));
    }, delay);
  }

  private handleConnectFailure(err: unknown) {
    if (this.closedByClient) return;
    // A 402 on token re-mint means the listening quota is gone — retrying
    // cannot succeed this billing period, so surface it instead of backing off.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "listening_quota_exhausted"
    ) {
      this.callbacks.onError(
        err instanceof Error ? err : new Error("Listening limit reached.")
      );
      return;
    }
    this.scheduleReconnect();
  }

  /**
   * Semantic fast-path endpoint: tell Speechmatics the turn is over *now*
   * instead of waiting out `end_of_utterance_silence_trigger`. The server
   * replies with the punctuated final AddTranscript followed by
   * EndOfUtterance. Used by the engine when its own VAD hears the voice stop
   * and the draft already reads like a completed ask.
   */
  forceEndOfUtterance() {
    if (!this.recognitionStarted) return;
    this.sendJson({
      message: "ForceEndOfUtterance",
      timestamp: this.audioSecondsSent,
    });
  }

  /**
   * Immediate reconnect (backoff reset) — used when the tab returns to the
   * foreground and the socket died while the page was hidden.
   */
  reconnectNow() {
    if (this.closedByClient || this.endOfStreamSent || this.ws) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    void this.connect().catch((err) => this.handleConnectFailure(err));
  }

  /**
   * Tears down the current stream and starts a fresh recognition on purpose.
   * Speechmatics' in-stream speaker clusters adapt online — a wrong first
   * attribution self-reinforces and cannot be corrected mid-stream — so the
   * only way to shed a poisoned cluster is a new StartRecognition, which
   * re-seeds clean clusters from the (never-modified) enrolled voiceprints.
   * The mic keeps streaming; frames queue while the socket is down and flush
   * into the new stream, so speech during the gap is delayed, not lost.
   */
  async restartRecognition(): Promise<void> {
    if (this.closedByClient || this.endOfStreamSent) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    const previous = this.ws;
    this.ws = null;
    this.recognitionStarted = false;
    try {
      previous?.close();
    } catch {
      // ignore — the socket may already be dead.
    }
    await this.connect().catch((err) => this.handleConnectFailure(err));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.recognitionStarted;
  }

  get currentStreamEpoch(): number {
    return this.streamEpoch;
  }

  buildStartRecognitionMessage() {
    const profileCount = this.profiles.length;
    const enrolledIdentifierCount = this.profiles.reduce(
      (total, profile) => total + profile.speakerIdentifiers.length,
      0
    );
    const preferCurrentSpeaker = preferCurrentSpeakerForProfiles();
    const speakerSensitivity = speakerSensitivityForProfiles(
      this.profiles.map((profile) => profile.speakerIdentifiers.length)
    );
    const maxSpeakers = this.options.enrollment
      ? 2
      : maxSpeakersForProfiles(profileCount);
    const speakerDiarizationConfig: Record<string, unknown> = {
      max_speakers: maxSpeakers,
      prefer_current_speaker: preferCurrentSpeaker,
      // Capture anonymous cluster voiceprints too. They remain ephemeral until
      // the user explicitly names that cluster in the transcript.
      get_speakers: true,
    };

    if (!this.options.enrollment && profileCount > 0) {
      // The provider caps identifiers across *all* speakers, not per speaker,
      // and rejects the whole recognition when the total is exceeded.
      const budgeted = selectSpeakerIdentifierBudget(
        this.profiles.map((profile) => ({
          label: safeSpeakerLabel(profile.name),
          speakerIdentifiers: profile.speakerIdentifiers,
        }))
      );
      speakerDiarizationConfig.speakers = budgeted.map((entry) => ({
        label: entry.label,
        speaker_identifiers: entry.speakerIdentifiers,
      }));
      if (budgeted.length < profileCount) {
        devLog(
          "speaker",
          `Speaker identifier budget trimmed ${profileCount - budgeted.length} profile(s) from this stream.`
        );
      }
      if (speakerSensitivity != null) {
        // `speaker_sensitivity`, singular. Speechmatics' *speaker
        // identification* pages document `speakers_sensitivity` (plural) as
        // the knob for favouring enrolled speakers — that field does not
        // exist on the realtime API. Probed 2026-08-24: it is rejected with
        // the same "Additional property ... is not allowed" error as a
        // made-up field name, which kills the entire recognition. The plural
        // form appears to be batch-only. Do not "correct" this to match the
        // docs without probing first.
        speakerDiarizationConfig.speaker_sensitivity = speakerSensitivity;
      }
    }

    if (!this.loggedStartConfig) {
      this.loggedStartConfig = true;
      const profileSummary =
        this.profiles
          .map(
            (profile) =>
              `${safeSpeakerLabel(profile.name)}:${profile.speakerIdentifiers.length}`
          )
          .join(", ") || "none";
      devLog(
        "speaker",
        `Speechmatics config: mode=${this.transcriptionMode} enrollment=${this.options.enrollment ?? false} profiles=${profileCount} identifiers=${enrolledIdentifierCount} maxSpeakers=${maxSpeakers} preferCurrent=${preferCurrentSpeaker} sensitivity=${speakerSensitivity ?? "default"}`
      );
      devLog("speaker", `Speechmatics profile counts: ${profileSummary}`);
    }

    // NOTE: the realtime StartRecognition schema is closed — an unrecognised
    // property anywhere in transcription_config fails the whole session with a
    // protocol_error, rather than being ignored. Probe any new field against
    // the API before shipping it (scratch probes live in git history for this
    // commit); a typo here takes the mic down for every user at once.
    const transcriptionConfig: Record<string, unknown> = {
      language: "en",
      model: "enhanced",
      diarization: "speaker",
      enable_partials: true,
      // How long the provider may hold a final (`AddTranscript`) to buy accuracy.
      // Valid range 0.7–4; 4 is the API default, which is what this was sitting
      // at. That matters more than it looks: finals are the only messages that
      // carry terminal punctuation, punctuation is what grades a draft
      // `clear-ask`, and `clear-ask` is the sole trigger for
      // ForceEndOfUtterance — so a maximal `max_delay` starves the one fast
      // path out of end-of-turn and leaves every turn waiting on the acoustic
      // silence trigger.
      //
      // 1.5 rather than the 1.0 floor: this is a straight speed/accuracy trade
      // (Speechmatics documents it as such) and the words still have to be right.
      // Must stay above `end_of_utterance_silence_trigger` (0.8).
      max_delay: 1.5,
      max_delay_mode: "flexible",
      additional_vocab: [
        // Wake word — must be right or Kivo never triggers.
        {
          content: "Kivo",
          sounds_like: [
            "kivo",
            "keevo",
            "keyvo",
            "quivo",
            "qui vo",
            "kee vo",
          ],
        },
        {
          content: "Hey Kivo",
          sounds_like: [
            "hey kivo",
            "hey keevo",
            "hey keyvo",
            "hey quivo",
          ],
        },
        // Models and AI tools that come up constantly in conversation.
        { content: "Claude" },
        { content: "ChatGPT", sounds_like: ["chat gpt", "chat g p t"] },
        { content: "Anthropic", sounds_like: ["an thropic", "anthro pic", "an throw pick"] },
        { content: "OpenAI", sounds_like: ["open ai", "open a i"] },
        { content: "Gemini", sounds_like: ["gemin i", "jem in eye"] },
        { content: "Sonnet" },
        { content: "Opus" },
        { content: "Haiku", sounds_like: ["hi ku", "high koo"] },
        { content: "nano banana" },
        { content: "LLM", sounds_like: ["l l m", "el el em"] },
        // Dev tools.
        { content: "Cursor" },
        { content: "Copilot", sounds_like: ["co pilot"] },
        { content: "Vercel", sounds_like: ["ver sell", "vur sell"] },
        { content: "Firestore", sounds_like: ["fire store"] },
        { content: "Firebase", sounds_like: ["fire base"] },
        { content: "Supabase", sounds_like: ["supa base", "super base"] },
        // Competitors / comparables in this product's space.
        { content: "Granola" },
        { content: "Otter" },
        { content: "Notion" },
        // Vendors behind Kivo — discussed out loud often enough to keep.
        {
          content: "Speechmatics",
          sounds_like: [
            "speech matics",
            "speech mattics",
            "speech mattox",
            "speech maddox",
            "speech matters",
          ],
        },
        {
          content: "Cartesia",
          sounds_like: ["car tesia", "cart asia", "carte sia"],
        },
      ],
      // Strip hesitation sounds ("um", "uh", "hmm") server-side so the stored
      // transcript reads cleanly. English-only, and it adjusts capitalization
      // and spacing around what it removes. Note the removal list also covers
      // acknowledgement tokens (`mhm`, `uh-huh`, `uh-uh`), so a speaker who
      // agrees by grunting leaves no trace in the transcript.
      transcript_filtering_config: {
        remove_disfluencies: true,
      },
      conversation_config: {
        // Silence gap (s) before EndOfUtterance fires — the main knob for how
        // quickly Kivo reacts when a speaker stops. Speechmatics requires this
        // to be LESS than max_delay (1.5 above) or end-of-turn goes unreliable.
        end_of_utterance_silence_trigger: this.options.voiceEngineV2
          ? VOICE_ENGINE_V2_TIMING.endOfUtteranceSilenceSeconds
          : 0.6,
      },
      speaker_diarization_config: speakerDiarizationConfig,
    };

    return {
      message: "StartRecognition",
      audio_format: {
        type: "raw",
        encoding: "pcm_s16le",
        sample_rate: 16000,
      },
      transcription_config: transcriptionConfig,
    };
  }

  private handleMessage(msg: SpeechmaticsMessage) {
    if (msg.message === "RecognitionStarted") {
      this.streamEpoch += 1;
      // Word timestamps restart at zero on a new stream, so the mic timeline
      // rebases too (before the queue flush below): audio queued during the
      // outage becomes the head of this stream, so the counter restarts at
      // the queued duration, not zero. An assistant-speech interval still
      // open across the boundary re-opens at zero (it covers the queued audio
      // as well); closed ones belong to the old timeline and are dropped.
      this.audioSecondsSent = this.audioQueue.reduce(
        (seconds, frame) => seconds + frame.byteLength / 2 / SAMPLE_RATE,
        0
      );
      this.assistantSpeechIntervals = this.assistantSpeechIntervals.some(
        (interval) => interval.end === null
      )
        ? [{ start: 0, end: null }]
        : [];
      this.recognitionStarted = true;
      this.reconnectAttempts = 0;
      this.callbacks.onOpen();
      this.flushAudioQueue();
      return;
    }

    if (msg.message === "AddPartialTranscript" || msg.message === "AddTranscript") {
      this.handleTranscript(msg as TranscriptMessage);
      return;
    }

    if (msg.message === "EndOfUtterance") {
      this.callbacks.onUtteranceEnd();
      return;
    }

    if (msg.message === "SpeakersResult") {
      const result = msg as SpeakersResultMessage;
      const speakers = result.speakers.map((speaker) => ({
          label: speaker.label,
          speakerIdentifiers: speaker.speaker_identifiers,
          streamEpoch: this.streamEpoch,
        }));
      this.callbacks.onSpeakersResult?.(speakers);
      this.resolveFinishedSpeakers(speakers);
      return;
    }

    if (msg.message === "Error") {
      this.callbacks.onError(
        new Error(
          `Speechmatics error${msg.type ? ` (${msg.type})` : ""}: ${
            msg.reason ?? "unknown"
          }`
        )
      );
    }
  }

  private handleTranscript(
    msg: TranscriptMessage
  ) {
    const isFinal = msg.message === "AddTranscript";
    const speechFinal = isFinal;
    // start_time restarts at zero per stream; the epoch prefix keeps ids from
    // colliding across reconnects/restarts (dedup sets and the transcript
    // store are keyed by these ids). Epoch 1 stays unprefixed.
    const baseId =
      this.streamEpoch > 1
        ? `${this.streamEpoch}:${msg.metadata.start_time}`
        : `${msg.metadata.start_time}`;

    // Classify each word by whether its audio-timeline timestamp falls inside
    // a known assistant-speech interval. This identifies Kivo's own echo by
    // *when the audio was actually spoken*, not by current UI status — so it
    // still works even if the transcript for that audio arrives late (after
    // playback has already ended and the status has moved on).
    //
    // The flag splits runs but never reorders them: words are emitted in the
    // order Speechmatics sent them. Emitting all clean words before all
    // flagged words scrambled any sentence that straddled a guard window
    // ("Yes, I have been" -> "I Yes, have been").
    const isEcho = (item: SpeechmaticsTranscriptResult) => {
      const start = item.start_time ?? 0;
      const end = item.end_time ?? start;
      return this.overlapsAssistantSpeech((start + end) / 2);
    };

    this.emitTranscriptGroups(msg.results, {
      isFinal,
      speechFinal,
      baseId,
      isEcho,
    });
  }

  private emitTranscriptGroups(
    results: SpeechmaticsTranscriptResult[],
    opts: {
      isFinal: boolean;
      speechFinal: boolean;
      baseId: string;
      isEcho: (item: SpeechmaticsTranscriptResult) => boolean;
    }
  ) {
    if (results.length === 0) return;

    const groups = groupSpeechmaticsResultsBySpeaker(results, opts.isEcho);

    groups.forEach((group, index) => {
      const speaker = this.speakerIndexForLabel(group.providerSpeakerLabel);
      const speakerName =
        this.speakerLabelToName.get(group.providerSpeakerLabel) ??
        (/^s\d+$/i.test(group.providerSpeakerLabel)
          ? null
          : safeSpeakerLabel(group.providerSpeakerLabel));

      if (opts.isFinal) {
        devLog("speaker", "Speechmatics speaker label mapped.", {
          providerSpeakerLabel: group.providerSpeakerLabel,
          speaker,
          speakerName: speakerName ?? null,
          mappedAs: speakerName ?? "Other speaker",
          textPreview: group.text.slice(0, 120),
          overlapsAssistantSpeech: group.overlapsAssistantSpeech,
        });
      }

      this.callbacks.onUtterance({
        id: `${opts.baseId}${group.overlapsAssistantSpeech ? "-echo" : ""}-${index}`,
        speaker,
        speakerName,
        providerSpeakerLabel: group.providerSpeakerLabel,
        text: group.text,
        start: group.start,
        end: group.end,
        isFinal: opts.isFinal,
        speechFinal: opts.speechFinal,
        overlapsAssistantSpeech: group.overlapsAssistantSpeech,
      });
    });
  }

  private speakerIndexForLabel(label: string): number {
    const generic = /^s(\d+)$/i.exec(label);
    if (generic) {
      return Math.max(0, Number(generic[1]) - 1);
    }

    const existing = this.speakerLabelToIndex.get(label);
    if (existing != null) return existing;
    const next = this.speakerLabelToIndex.size;
    this.speakerLabelToIndex.set(label, next);
    return next;
  }

  private sendJson(data: unknown) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(data));
  }

  private flushAudioQueue() {
    const pending = this.audioQueue;
    this.audioQueue = [];
    for (const frame of pending) {
      this.sendArrayBuffer(frame);
    }
  }

  private sendArrayBuffer(buffer: ArrayBuffer) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.recognitionStarted) {
      this.audioQueue.push(buffer);
      return;
    }
    if (ws.bufferedAmount > 2_000_000) return;
    this.seqNo += 1;
    ws.send(buffer);
  }

  sendPcm(pcm: Int16Array) {
    this.audioSecondsSent += pcm.length / SAMPLE_RATE;
    const bytes = new Uint8Array(pcm.byteLength);
    bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    this.sendArrayBuffer(bytes.buffer);
  }

  /**
   * Marks the start of assistant TTS playback on the shared mic audio-stream
   * timeline. Any word whose timestamp falls inside the resulting interval is
   * Kivo's own voice being picked up by the mic, not the user speaking.
   */
  markAssistantSpeechStart() {
    if (this.assistantSpeechIntervals.some((interval) => interval.end === null)) {
      return;
    }
    const start = Math.max(
      0,
      this.audioSecondsSent - ASSISTANT_SPEECH_PRE_ROLL_SECONDS
    );
    this.assistantSpeechIntervals.push({ start, end: null });
  }

  /**
   * Marks the end of assistant TTS playback.
   *
   * Normal end (playback finished naturally): the interval extends a short
   * echo tail past "now" to cover room/speaker echo still decaying on the mic.
   *
   * Barge-in end (`onsetBackoffSeconds` given): the user cut Kivo off, so the
   * interval is instead *rewound* to the start of their interruption
   * (`now - onsetBackoffSeconds`). This un-flags the user's interrupting words
   * — which were spoken while the interval was still open — so they transcribe
   * as real speech instead of being discarded as Kivo's echo.
   */
  markAssistantSpeechEnd(options: { onsetBackoffSeconds?: number } = {}) {
    const open = this.assistantSpeechIntervals.find(
      (interval) => interval.end === null
    );
    if (!open) return;
    open.end =
      options.onsetBackoffSeconds != null
        ? Math.max(open.start, this.audioSecondsSent - options.onsetBackoffSeconds)
        : this.audioSecondsSent + ASSISTANT_SPEECH_ECHO_TAIL_SECONDS;
    this.pruneAssistantSpeechIntervals();
  }

  private pruneAssistantSpeechIntervals() {
    const cutoff =
      this.audioSecondsSent - ASSISTANT_SPEECH_INTERVAL_MAX_AGE_SECONDS;
    this.assistantSpeechIntervals = this.assistantSpeechIntervals.filter(
      (interval) => interval.end === null || interval.end >= cutoff
    );
  }

  private overlapsAssistantSpeech(midpointSeconds: number): boolean {
    return this.assistantSpeechIntervals.some(
      (interval) =>
        midpointSeconds >= interval.start &&
        (interval.end === null || midpointSeconds <= interval.end)
    );
  }

  requestSpeakers(options: { final?: boolean } = {}) {
    this.sendJson({ message: "GetSpeakers", final: options.final ?? false });
  }

  /**
   * Gracefully ends the stream and waits briefly for its final voiceprints.
   * A timeout keeps stopping a session responsive if the provider is delayed.
   */
  async finishAndGetSpeakers(
    timeoutMs = 2500
  ): Promise<SpeechmaticsSpeakerResult[]> {
    if (!this.isConnected) {
      this.close();
      return [];
    }

    const result = await new Promise<SpeechmaticsSpeakerResult[]>((resolve) => {
      this.finishSpeakersResolver = resolve;
      this.finishSpeakersTimer = setTimeout(
        () => this.resolveFinishedSpeakers([]),
        timeoutMs
      );
      this.requestSpeakers({ final: true });
      this.sendEndOfStream();
    });
    this.close();
    return result;
  }

  private resolveFinishedSpeakers(
    speakers: SpeechmaticsSpeakerResult[]
  ): void {
    if (!this.finishSpeakersResolver) return;
    if (this.finishSpeakersTimer) {
      clearTimeout(this.finishSpeakersTimer);
      this.finishSpeakersTimer = null;
    }
    const resolve = this.finishSpeakersResolver;
    this.finishSpeakersResolver = null;
    resolve(speakers);
  }

  /** Ends recognition; required before `GetSpeakers({ final: true })` can return. */
  sendEndOfStream() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || !this.recognitionStarted) {
      return;
    }
    this.recognitionStarted = false;
    this.endOfStreamSent = true;
    ws.send(JSON.stringify({ message: "EndOfStream", last_seq_no: this.seqNo }));
  }

  close() {
    this.closedByClient = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN && this.recognitionStarted) {
        ws.send(JSON.stringify({ message: "EndOfStream", last_seq_no: this.seqNo }));
      }
      ws.close();
    } catch {
      // ignore close failures
    } finally {
      this.resolveFinishedSpeakers([]);
      this.ws = null;
      this.recognitionStarted = false;
      this.audioQueue = [];
    }
  }
}
