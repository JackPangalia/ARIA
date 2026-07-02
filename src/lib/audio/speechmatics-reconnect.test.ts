import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechmaticsLiveClient } from "@/lib/audio/speechmatics-client";
import { getSpeechmaticsToken } from "@/lib/speakers/client";

vi.mock("@/lib/speakers/client", () => ({
  getSpeechmaticsToken: vi.fn(),
  listSpeakerProfiles: vi.fn(),
}));

type Listener = (event: unknown) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  url: string;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  send() {}
  close() {}

  fire(type: string, event: unknown) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

function makeCallbacks() {
  return {
    onUtterance: vi.fn(),
    onUtteranceEnd: vi.fn(),
    onError: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onReconnecting: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.mocked(getSpeechmaticsToken).mockResolvedValue({
    token: "tok",
    expiresIn: 600,
    region: "eu",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SpeechmaticsLiveClient reconnect", () => {
  it("reconnects with backoff on an unexpected close (1006)", async () => {
    const callbacks = makeCallbacks();
    const client = new SpeechmaticsLiveClient(callbacks);
    await client.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.instances[0].fire("close", { code: 1006 });
    expect(callbacks.onReconnecting).toHaveBeenCalledWith(1);

    await vi.advanceTimersByTimeAsync(1600); // 1000ms base + up to 500ms jitter
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("does not reconnect after a client-initiated close", async () => {
    const callbacks = makeCallbacks();
    const client = new SpeechmaticsLiveClient(callbacks);
    await client.connect();

    client.close();
    FakeWebSocket.instances[0].fire("close", { code: 1000 });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(callbacks.onReconnecting).not.toHaveBeenCalled();
  });

  it("resets the attempt counter once recognition restarts", async () => {
    const callbacks = makeCallbacks();
    const client = new SpeechmaticsLiveClient(callbacks);
    await client.connect();

    FakeWebSocket.instances[0].fire("close", { code: 1006 });
    await vi.advanceTimersByTimeAsync(1600);
    FakeWebSocket.instances[1].fire("message", {
      data: JSON.stringify({ message: "RecognitionStarted" }),
    });

    FakeWebSocket.instances[1].fire("close", { code: 1006 });
    expect(callbacks.onReconnecting).toHaveBeenLastCalledWith(1);
  });

  it("gives up with a user-facing error after the retry cap", async () => {
    const callbacks = makeCallbacks();
    const client = new SpeechmaticsLiveClient(callbacks);
    await client.connect();

    for (let i = 0; i < 8; i++) {
      FakeWebSocket.instances[FakeWebSocket.instances.length - 1].fire("close", {
        code: 1006,
      });
      await vi.advanceTimersByTimeAsync(31_000);
    }
    // Ninth close exceeds MAX_RECONNECT_ATTEMPTS.
    FakeWebSocket.instances[FakeWebSocket.instances.length - 1].fire("close", {
      code: 1006,
    });

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Connection lost"),
      })
    );
  });

  it("surfaces quota exhaustion immediately instead of retrying", async () => {
    const callbacks = makeCallbacks();
    const client = new SpeechmaticsLiveClient(callbacks);
    await client.connect();

    vi.mocked(getSpeechmaticsToken).mockRejectedValue(
      Object.assign(new Error("You've used all your listening time."), {
        code: "listening_quota_exhausted",
      })
    );
    FakeWebSocket.instances[0].fire("close", { code: 1006 });
    await vi.advanceTimersByTimeAsync(1600);
    // Let the rejected connect() settle.
    await vi.advanceTimersByTimeAsync(0);

    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("listening time"),
      })
    );
    expect(callbacks.onReconnecting).toHaveBeenCalledTimes(1);
  });

  it("reconnectNow retries immediately when the socket is gone", async () => {
    const callbacks = makeCallbacks();
    const client = new SpeechmaticsLiveClient(callbacks);
    await client.connect();

    FakeWebSocket.instances[0].fire("close", { code: 1006 });
    client.reconnectNow();
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
