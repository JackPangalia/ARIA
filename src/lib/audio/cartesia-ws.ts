import WebSocket from "ws";
import { stripMarkdownForSpeech } from "@/lib/aria/tts-phrase-buffer";

// WS uses a newer API version than the HTTP bytes path: continuations are
// only documented against it.
const CARTESIA_WS_VERSION = "2026-03-01";
const CONNECT_TIMEOUT_MS = 3000;
const CONNECT_RETRIES = 1;
const CONNECT_RETRY_DELAY_MS = 150;
/** How long Cartesia may wait for more transcript before starting to speak.
 * Low enough that the first clause starts promptly, high enough that it can
 * join the small word-level fragments the answer pipeline streams into one
 * prosodic phrase instead of synthesizing each fragment in isolation (the
 * per-fragment pitch-reset failure mode). */
const MAX_BUFFER_DELAY_MS = 250;

export const CARTESIA_PCM_SAMPLE_RATE = 24000;
export const CARTESIA_PCM_ENCODING = "pcm_f32le" as const;
export const CARTESIA_PCM_SUPPORTED_SAMPLE_RATES = [
  16000, 22050, 24000, 44100, 48000,
] as const;

export function cartesiaPcmBytesPerSecond(sampleRate: number): number {
  return sampleRate * 4;
}

export function normalizeCartesiaSampleRate(value: number): number {
  return CARTESIA_PCM_SUPPORTED_SAMPLE_RATES.includes(
    value as (typeof CARTESIA_PCM_SUPPORTED_SAMPLE_RATES)[number]
  )
    ? value
    : CARTESIA_PCM_SAMPLE_RATE;
}

export type CartesiaWsConfig = {
  apiKey: string;
  modelId: string;
  voiceId: string;
  sampleRate?: number;
};

/** Cartesia rejects the handshake with a 503 when the account is briefly at its
 * concurrency ceiling — typically the previous turn's context still winding
 * down. Giving up on the first one drops the whole answer onto the slower HTTP
 * path, so absorb a single transient failure before falling back. */
async function connectWithRetry(
  apiKey: string,
  signal?: AbortSignal
): Promise<WebSocket> {
  const url = `wss://api.cartesia.ai/tts/websocket?cartesia_version=${CARTESIA_WS_VERSION}`;
  let lastError: Error = new Error("Cartesia WS connect failed");

  for (let attempt = 0; attempt <= CONNECT_RETRIES; attempt++) {
    if (signal?.aborted) throw lastError;
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, CONNECT_RETRY_DELAY_MS));
      if (signal?.aborted) throw lastError;
    }
    const ws = new WebSocket(url, { headers: { "X-API-Key": apiKey } });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error("Cartesia WS connect timed out"));
        }, CONNECT_TIMEOUT_MS);
        ws.once("open", () => {
          clearTimeout(timer);
          resolve();
        });
        ws.once("error", (err) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });
      ws.removeAllListeners("error");
      return ws;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      ws.removeAllListeners();
      ws.terminate();
    }
  }

  throw lastError;
}

export interface CartesiaContextStream {
  /** Queue a transcript fragment; prosody continues across fragments. */
  sendText(text: string): void;
  /** No more text is coming — synthesize the tail and end the stream. */
  finish(): void;
  /** Tear down immediately (user interruption). The audio stream just ends. */
  abort(): void;
  /** Raw mono PCM for the negotiated sample rate and encoding. */
  audio: ReadableStream<Uint8Array>;
  sampleRate: number;
  encoding: typeof CARTESIA_PCM_ENCODING;
}

/**
 * One Cartesia TTS WebSocket context for one full answer. Unlike the per-chunk
 * HTTP path (cartesia-tts.ts), a single context carries prosody across
 * sentence boundaries — no per-sentence pitch reset — and starts synthesizing
 * while the LLM is still writing. WS output is raw PCM only, so this path is
 * used for clients that advertise PCM playback; MP3 clients stay on HTTP.
 */
export async function createCartesiaContextStream(
  config: CartesiaWsConfig,
  signal?: AbortSignal
): Promise<CartesiaContextStream> {
  const ws = await connectWithRetry(config.apiKey, signal);

  const contextId = crypto.randomUUID();
  const sampleRate = normalizeCartesiaSampleRate(
    config.sampleRate ?? CARTESIA_PCM_SAMPLE_RATE
  );
  const baseMessage = {
    model_id: config.modelId,
    voice: { mode: "id" as const, id: config.voiceId },
    output_format: {
      container: "raw" as const,
      encoding: CARTESIA_PCM_ENCODING,
      sample_rate: sampleRate,
    },
    language: "en",
    context_id: contextId,
    max_buffer_delay_ms: MAX_BUFFER_DELAY_MS,
  };

  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let settled = false;

  const settle = (err?: Error) => {
    if (settled || !controllerRef) return;
    settled = true;
    try {
      if (err) controllerRef.error(err);
      else controllerRef.close();
    } catch {
      // already closed/errored
    }
  };

  const cleanup = () => {
    ws.removeAllListeners();
    if (
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING
    ) {
      ws.close();
    }
  };

  const audio = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      ws.on("message", (raw) => {
        let msg: {
          type?: string;
          data?: string;
          context_id?: string;
          error?: string;
          message?: string;
        };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (msg.context_id && msg.context_id !== contextId) return;

        if (msg.type === "chunk" && msg.data) {
          controller.enqueue(new Uint8Array(Buffer.from(msg.data, "base64")));
          return;
        }
        if (msg.type === "done") {
          settle();
          cleanup();
          return;
        }
        if (msg.type === "error") {
          settle(
            new Error(`Cartesia WS error: ${msg.message ?? msg.error ?? "unknown"}`)
          );
          cleanup();
        }
        // timestamps / flush_done are ignored.
      });

      ws.on("close", () => {
        // Server closed without a done message — end the stream rather than
        // hanging the answer; the pipeline treats a short stream as an error
        // only if nothing at all was produced.
        settle();
      });

      ws.on("error", (err) => {
        settle(err instanceof Error ? err : new Error(String(err)));
        cleanup();
      });

      signal?.addEventListener("abort", () => {
        settle();
        cleanup();
      });
    },
    cancel() {
      cleanup();
    },
  });

  const send = (transcript: string, continues: boolean) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({ ...baseMessage, transcript, continue: continues })
    );
  };

  return {
    sendText(text: string) {
      const clean = stripMarkdownForSpeech(text);
      const t = (clean || text).trim();
      if (!t) return;
      send(`${t} `, true);
    },
    finish() {
      send("", false);
    },
    abort() {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ context_id: contextId, cancel: true }));
      }
      settle();
      cleanup();
    },
    audio,
    sampleRate,
    encoding: CARTESIA_PCM_ENCODING,
  };
}
