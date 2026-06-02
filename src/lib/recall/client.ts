import type { MeetingPlatform } from "@/lib/sessions/types";
import { SILENT_MP3_B64 } from "@/lib/recall/silent-mp3";

// Thin wrapper over the Recall.ai REST API for meeting-bot mode.
//
// Docs: https://docs.recall.ai/  (Bot, Output Audio, Real-time endpoints)
// NOTE: Recall's request/response shapes vary by API version. The payload
// builders below are kept in one place and annotated so they're easy to align
// with the dashboard's API reference during live integration. Auth is
// `Authorization: Token <api_key>` and the host is region-scoped.

export interface RecallClientConfig {
  apiKey: string;
  /** Region host segment, e.g. "us-east-1" → https://us-east-1.recall.ai */
  region: string;
  /** Streaming-ASR bias. Default low_latency — accuracy is opt-in (much slower). */
  transcriptMode?: "accuracy" | "low_latency";
}

export interface CreateBotInput {
  meetingUrl: string;
  /** Public wss URL on the bot worker that Recall pushes real-time events to. */
  realtimeWsUrl: string;
  botName?: string;
  /** Echoed back on webhooks so we can map a bot to its session. */
  metadata?: Record<string, string>;
}

export interface CreateBotResult {
  botId: string;
  raw: unknown;
}

const DEFAULT_BOT_NAME = "Kivo";

export class RecallApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
    this.name = "RecallApiError";
  }
}

export function isRecallConfigured(env: {
  RECALL_API_KEY?: string;
  BOT_WORKER_PUBLIC_URL?: string;
}): boolean {
  return Boolean(env.RECALL_API_KEY && env.BOT_WORKER_PUBLIC_URL);
}

/**
 * Build the worker websocket URL Recall connects to, carrying the session
 * identity as query params. `https://host` → `wss://host/recall?...`.
 */
export function buildRealtimeWsUrl(
  publicUrl: string,
  params: { sessionId: string; uid: string }
): string {
  const base = new URL(publicUrl);
  base.protocol = base.protocol === "http:" ? "ws:" : "wss:";
  base.pathname = "/recall";
  base.searchParams.set("sessionId", params.sessionId);
  base.searchParams.set("uid", params.uid);
  return base.toString();
}

export function detectMeetingPlatform(meetingUrl: string): MeetingPlatform | null {
  const url = meetingUrl.toLowerCase();
  if (url.includes("zoom.")) return "zoom";
  if (url.includes("meet.google.")) return "meet";
  if (url.includes("teams.microsoft.") || url.includes("teams.live.")) {
    return "teams";
  }
  if (url.includes("webex.")) return "webex";
  return null;
}

export class RecallClient {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly transcriptMode: "accuracy" | "low_latency";

  constructor(config: RecallClientConfig) {
    this.apiKey = config.apiKey;
    this.base = `https://${config.region}.recall.ai/api/v1`;
    this.transcriptMode = config.transcriptMode ?? "low_latency";
  }

  static fromEnv(env: {
    RECALL_API_KEY?: string;
    RECALL_REGION?: string;
    RECALL_TRANSCRIPT_MODE?: "accuracy" | "low_latency";
  }): RecallClient {
    if (!env.RECALL_API_KEY) {
      throw new Error("RECALL_API_KEY is not configured.");
    }
    return new RecallClient({
      apiKey: env.RECALL_API_KEY,
      region: env.RECALL_REGION || "us-east-1",
      transcriptMode: env.RECALL_TRANSCRIPT_MODE,
    });
  }

  private async request<T>(
    path: string,
    init: { method: string; body?: unknown }
  ): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new RecallApiError(
        `Recall ${init.method} ${path} failed (${res.status})`,
        res.status,
        body
      );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  /**
   * Send a bot into a meeting and ask Recall to stream real-time transcript
   * events (with per-participant identity) to our worker's websocket.
   */
  async createBot(input: CreateBotInput): Promise<CreateBotResult> {
    const body = {
      meeting_url: input.meetingUrl,
      bot_name: input.botName ?? DEFAULT_BOT_NAME,
      metadata: input.metadata,
      recording_config: {
        // Fast streaming ASR + websocket partials. Wake word is handled in our
        // layer (fuzzy "Kivo" matching on partials) — not Recall key_terms,
        // which only works in slow accuracy mode anyway.
        transcript: {
          provider: {
            recallai_streaming: {
              mode:
                this.transcriptMode === "low_latency"
                  ? "prioritize_low_latency"
                  : "prioritize_accuracy",
              language_code: "en",
              ...(this.transcriptMode === "accuracy" && {
                key_terms: ["Kivo", "Hey Kivo", "Hi Kivo", "KIVO"],
              }),
            },
          },
          // Separate per-participant streams slow bot startup; roster names still
          // arrive on transcript events when the platform provides them.
          diarization: { use_separate_streams_when_available: false },
        },
        realtime_endpoints: [
          {
            type: "websocket",
            url: input.realtimeWsUrl,
            events: ["transcript.data", "transcript.partial_data"],
          },
        ],
      },
      // Required so the on-demand Output Audio endpoint works later. We seed a
      // silent placeholder; real answers are pushed via outputAudio() at runtime.
      automatic_audio_output: {
        in_call_recording: {
          data: { kind: "mp3", b64_data: SILENT_MP3_B64 },
        },
      },
    };

    const raw = await this.request<{ id: string }>("/bot/", {
      method: "POST",
      body,
    });
    return { botId: raw.id, raw };
  }

  /** Play an MP3 (base64) into the meeting — this is how Kivo "speaks". */
  async outputAudio(botId: string, mp3Base64: string): Promise<void> {
    await this.request(`/bot/${botId}/output_audio/`, {
      method: "POST",
      body: { kind: "mp3", b64_data: mp3Base64 },
    });
  }

  /** Remove the bot from the call. */
  async leaveBot(botId: string): Promise<void> {
    await this.request(`/bot/${botId}/leave_call/`, { method: "POST" });
  }
}
