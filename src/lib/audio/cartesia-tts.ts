const CARTESIA_API_VERSION = "2025-04-16";
const TTS_RETRY_ATTEMPTS = 3;
const TTS_RETRY_BASE_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type CartesiaTtsConfig = {
  apiKey: string;
  modelId: string;
  voiceId: string;
};

/** Stream MP3 bytes from Cartesia for a single transcript chunk. */
export async function createCartesiaSpeechStream(
  config: CartesiaTtsConfig,
  transcript: string,
  signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const body = JSON.stringify({
    model_id: config.modelId,
    transcript,
    voice: { mode: "id", id: config.voiceId },
    output_format: {
      container: "mp3",
      sample_rate: 44100,
      bit_rate: 128000,
    },
  });

  let response: Response | undefined;
  for (let attempt = 0; attempt < TTS_RETRY_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Cartesia-Version": CARTESIA_API_VERSION,
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal,
    });
    if (response.ok || response.status !== 429) break;
    if (attempt < TTS_RETRY_ATTEMPTS - 1) {
      await sleep(TTS_RETRY_BASE_MS * (attempt + 1));
    }
  }

  if (!response?.ok) {
    const detail = await response?.text().catch(() => "");
    throw new Error(
      `Cartesia TTS failed (${response?.status ?? 0}): ${detail || response?.statusText || "unknown"}`
    );
  }

  if (!response.body) {
    throw new Error("Cartesia TTS returned no response body");
  }

  return response.body;
}
