// Framed multiplex for the spoken-answer stream: raw PCM audio chunks and the
// answer's text tokens interleaved over one HTTP response body.
//
// Why: the browser engine needs the answer *text* live, not just its audio —
// it's what lets the client tell Kivo's own echo ("the mic hearing the
// speakers") apart from a user genuinely talking over the answer, which is the
// foundation of reliable just-start-talking barge-in. It also gives the UI a
// live caption for free.
//
// Frame layout: [type: u8][payload length: u32 big-endian][payload]
//   type 1 = audio (raw PCM bytes, encoding/sample-rate from response headers)
//   type 2 = text  (UTF-8 fragment of the assistant's answer, append-only)
//   type 3 = event (UTF-8 JSON control signal, e.g. a tool call starting —
//            arrives ahead of any answer text/audio for that turn)

export const MUX_FRAME_AUDIO = 1;
export const MUX_FRAME_TEXT = 2;
export const MUX_FRAME_EVENT = 3;

const HEADER_BYTES = 5;

export interface MuxEvent {
  type: "tool_started" | "tool_completed";
  tool: string;
}

export function encodeMuxFrame(
  type: typeof MUX_FRAME_AUDIO | typeof MUX_FRAME_TEXT | typeof MUX_FRAME_EVENT,
  payload: Uint8Array
): Uint8Array {
  const frame = new Uint8Array(HEADER_BYTES + payload.length);
  frame[0] = type;
  new DataView(frame.buffer).setUint32(1, payload.length, false);
  frame.set(payload, HEADER_BYTES);
  return frame;
}

export function encodeMuxText(text: string): Uint8Array {
  return encodeMuxFrame(MUX_FRAME_TEXT, new TextEncoder().encode(text));
}

export function encodeMuxAudio(bytes: Uint8Array): Uint8Array {
  return encodeMuxFrame(MUX_FRAME_AUDIO, bytes);
}

export function encodeMuxEvent(event: MuxEvent): Uint8Array {
  return encodeMuxFrame(MUX_FRAME_EVENT, new TextEncoder().encode(JSON.stringify(event)));
}

export interface MuxDecoderCallbacks {
  onAudio: (bytes: Uint8Array) => void;
  onText: (text: string) => void;
  onEvent?: (event: MuxEvent) => void;
}

/**
 * Streaming decoder: feed network chunks in any fragmentation; frames are
 * reassembled across chunk boundaries and dispatched in order.
 */
export class MuxStreamDecoder {
  private buffer: Uint8Array = new Uint8Array(0);
  private readonly textDecoder = new TextDecoder();

  constructor(private readonly cb: MuxDecoderCallbacks) {}

  push(chunk: Uint8Array): void {
    if (chunk.byteLength === 0) return;
    if (this.buffer.length === 0) {
      this.buffer = chunk;
    } else {
      const merged = new Uint8Array(this.buffer.length + chunk.length);
      merged.set(this.buffer, 0);
      merged.set(chunk, this.buffer.length);
      this.buffer = merged;
    }

    while (this.buffer.length >= HEADER_BYTES) {
      const view = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset,
        this.buffer.byteLength
      );
      const type = view.getUint8(0);
      const length = view.getUint32(1, false);
      if (this.buffer.length < HEADER_BYTES + length) return;

      const payload = this.buffer.slice(HEADER_BYTES, HEADER_BYTES + length);
      this.buffer = this.buffer.slice(HEADER_BYTES + length);

      if (type === MUX_FRAME_AUDIO) {
        this.cb.onAudio(payload);
      } else if (type === MUX_FRAME_TEXT) {
        this.cb.onText(this.textDecoder.decode(payload, { stream: true }));
      } else if (type === MUX_FRAME_EVENT) {
        try {
          this.cb.onEvent?.(JSON.parse(new TextDecoder().decode(payload)) as MuxEvent);
        } catch {
          // Malformed event frame — drop it, never let it break audio/text playback.
        }
      }
      // Unknown types are skipped for forward compatibility.
    }
  }
}
