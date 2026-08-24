import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AriaStatus, TranscriptUtterance } from "@/lib/types";

const mockStore = vi.hoisted(() => {
  const store: {
    status: AriaStatus;
    clearTranscript: ReturnType<typeof vi.fn>;
    setError: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    setMicLevel: ReturnType<typeof vi.fn>;
    setPlaybackLevel: ReturnType<typeof vi.fn>;
    upsertUtterance: ReturnType<typeof vi.fn>;
    removeUtterances: ReturnType<typeof vi.fn>;
  } = {
    status: "listening",
    clearTranscript: vi.fn(),
    setError: vi.fn(),
    setStatus: vi.fn((status: AriaStatus) => {
      store.status = status;
    }),
    setMicLevel: vi.fn(),
    setPlaybackLevel: vi.fn(),
    upsertUtterance: vi.fn(),
    removeUtterances: vi.fn(),
  };
  return store;
});

const mockCueMethods = vi.hoisted(() => ({
  ensureReady: vi.fn(),
  playWake: vi.fn(),
  playClose: vi.fn(),
  playSearch: vi.fn(),
  startSearchingLoop: vi.fn(),
  stopWorkCue: vi.fn(),
  dispose: vi.fn(),
  playClip: vi.fn(),
  getPlaybackContext: vi.fn(async () => null),
  sampleRate: 48000,
}));

vi.mock("@/lib/store", () => ({
  useAriaStore: {
    getState: () => mockStore,
  },
}));

vi.mock("./cue-engine", () => ({
  CueEngine: vi.fn(function CueEngine() {
    return mockCueMethods;
  }),
}));

vi.mock("./mic-pcm-streamer", () => ({
  MicPcmStreamer: vi.fn(),
}));

vi.mock("./speechmatics-client", () => ({
  SpeechmaticsLiveClient: vi.fn(),
}));

vi.mock("./turn-assembler", () => ({
  TranscriptTurnAssembler: vi.fn(function TranscriptTurnAssembler() {
    return {
      append: vi.fn(),
      flush: vi.fn(),
    };
  }),
}));

vi.mock("./visual-level", () => ({
  VisualMicLevelNormalizer: vi.fn(function VisualMicLevelNormalizer() {
    return {
      reset: vi.fn(),
      update: vi.fn(() => 0),
    };
  }),
}));

vi.mock("@/lib/client/dev-log", () => ({
  devLog: vi.fn(),
}));

vi.mock("@/lib/sessions/client", () => ({
  askSessionQuestion: vi.fn(),
  appendSessionTurn: vi.fn(),
  finalizeSessionTitle: vi.fn(),
  prefetchSessionContext: vi.fn(),
}));

vi.mock("@/lib/speakers/client", () => ({
  listSpeakerProfiles: vi.fn(),
}));

vi.mock("@/lib/plan/client", () => ({
  sendHeartbeat: vi.fn(),
}));

import { AriaEngine } from "./aria-engine";
import { askSessionQuestion } from "@/lib/sessions/client";

function utterance(
  text: string,
  id = "u1",
  overrides: Partial<TranscriptUtterance> = {}
): TranscriptUtterance {
  return {
    id,
    speaker: 0,
    speakerName: "Conversation",
    providerSpeakerLabel: "conversation",
    text,
    start: 0,
    end: 1,
    isFinal: true,
    speechFinal: true,
    ...overrides,
  };
}

function turnAssemblerOf(engine: AriaEngine) {
  return (
    engine as unknown as {
      turnAssembler: { append: ReturnType<typeof vi.fn> };
    }
  ).turnAssembler;
}

function emit(engine: AriaEngine, u: TranscriptUtterance) {
  (
    engine as unknown as {
      handleUtterance: (utterance: TranscriptUtterance) => void;
    }
  ).handleUtterance(u);
}

function capturedQuestion(engine: AriaEngine): string {
  return (
    engine as unknown as {
      getCapturedQuestion: () => { question: string };
    }
  ).getCapturedQuestion().question;
}

describe("AriaEngine follow-up lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns to passive listening after three seconds of silence", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    (
      engine as unknown as { startFollowUpWindow: () => void }
    ).startFollowUpWindow();

    expect(mockStore.status).toBe("follow-up-listening");
    vi.advanceTimersByTime(2_999);
    expect(mockStore.status).toBe("follow-up-listening");
    vi.advanceTimersByTime(1);
    expect(mockStore.status).toBe("listening");

  });

  it("stays silent on a wake-free follow-up", () => {
    // The wake tick means "Kivo was called in". Carrying on in the same
    // conversation is not that, and a chime after every answer is exactly the
    // gadget feel the cue set avoids.
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    (
      engine as unknown as {
        handleFollowUp: (
          id: string,
          speaker: number,
          speakerName: string | null,
          providerSpeakerLabel: string | null
        ) => void;
      }
    ).handleFollowUp("u1", 0, null, null);

    expect(mockStore.status).toBe("capturing-question");
    expect(mockCueMethods.playWake).not.toHaveBeenCalled();
  });

  it("abandons a follow-up capture that never settles", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    (
      engine as unknown as {
        handleFollowUp: (
          id: string,
          speaker: number,
          speakerName: string | null,
          providerSpeakerLabel: string | null
        ) => void;
      }
    ).handleFollowUp("u1", 0, null, null);

    expect(mockStore.status).toBe("capturing-question");
    vi.advanceTimersByTime(5_999);
    expect(mockStore.status).toBe("capturing-question");
    vi.advanceTimersByTime(1);
    expect(mockStore.status).toBe("listening");
    expect(
      (engine as unknown as { capturingQuestion: boolean }).capturingQuestion
    ).toBe(false);

  });
});

describe("AriaEngine assistant command path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
  });

  it("treats real (non-echo) speech while Kivo is speaking as a barge-in and captures it", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";

    emit(
      engine,
      utterance("actually wait can you compare it to the other option")
    );

    // Claude-style: the user just starts talking — the answer stops and their
    // words become the next question.
    expect(mockStore.upsertUtterance).not.toHaveBeenCalled();
    expect(mockStore.setStatus).toHaveBeenCalledWith("capturing-question");
    expect(mockCueMethods.stopWorkCue).toHaveBeenCalled();
    expect(capturedQuestion(engine)).toBe(
      "actually wait can you compare it to the other option"
    );
  });

  it("does not barge in on a short partial while speaking (needs three words)", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";

    emit(
      engine,
      utterance("well the", "p1", { isFinal: false, speechFinal: false })
    );

    expect(mockStore.setStatus).not.toHaveBeenCalledWith("capturing-question");
    expect(mockStore.status).toBe("speaking");
  });

  it("silences Kivo on a stop command while speaking", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";

    emit(engine, utterance("stop"));

    expect(mockStore.upsertUtterance).not.toHaveBeenCalled();
    expect(mockStore.setStatus).toHaveBeenCalledWith("listening");
    expect(mockCueMethods.stopWorkCue).toHaveBeenCalled();
  });

  it("accepts an unambiguous partial stop in Voice Engine V2", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    (
      engine as unknown as { voiceEngineV2: boolean }
    ).voiceEngineV2 = true;
    mockStore.status = "speaking";

    emit(
      engine,
      utterance("stop", "partial-stop", {
        isFinal: false,
        speechFinal: false,
      })
    );

    expect(mockStore.setStatus).toHaveBeenCalledWith("listening");
  });

  it("stops generation synchronously from the local control", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "thinking";

    expect(engine.stopSpeaking()).toBe(true);
    expect(mockStore.status).toBe("listening");
    expect(mockCueMethods.stopWorkCue).toHaveBeenCalled();
  });

  it("uses Kivo as a word-gated barge-in while speaking", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";

    emit(engine, utterance("Kivo"));

    expect(mockStore.upsertUtterance).not.toHaveBeenCalled();
    expect(mockStore.setStatus).toHaveBeenCalledWith("capturing-question");
    expect(mockCueMethods.playWake).toHaveBeenCalled();
  });

  it("allows bare stop commands in speaker mode (echo is timing-gated, not wake-gated)", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "speaker",
    });
    mockStore.status = "speaking";

    emit(engine, utterance("shut up", "u1"));

    expect(mockStore.setStatus).toHaveBeenCalledWith("listening");
  });

  it("routes utterances flagged as assistant echo to the command path even while status has reverted to listening", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "speaker",
    });
    mockStore.status = "listening";

    emit(
      engine,
      utterance("blues", "u1", { overlapsAssistantSpeech: true })
    );

    expect(mockStore.upsertUtterance).not.toHaveBeenCalled();
    expect(mockStore.status).toBe("listening");
  });

  it("drops flagged echo outright, even a stop word (Kivo never interrupts itself)", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "speaker",
    });
    mockStore.status = "speaking";

    // "shut up" spoken by Kivo itself (flagged as echo by the STT client).
    // The old design let this silence Kivo; now flagged echo is dropped.
    emit(
      engine,
      utterance("shut up", "u1", { overlapsAssistantSpeech: true })
    );

    expect(mockStore.upsertUtterance).not.toHaveBeenCalled();
    expect(mockStore.setStatus).not.toHaveBeenCalledWith("listening");
    expect(mockStore.status).toBe("speaking");
  });

  it("stops the answer and opens capture on a confirmed acoustic barge-in", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";
    (engine as unknown as { isAssistantSpeaking: boolean }).isAssistantSpeaking =
      true;

    (
      engine as unknown as {
        handleAcousticBargeIn: (info: { onsetSecondsAgo: number }) => void;
      }
    ).handleAcousticBargeIn({ onsetSecondsAgo: 0.3 });

    expect(mockStore.setStatus).toHaveBeenCalledWith("follow-up-listening");
    expect(mockCueMethods.stopWorkCue).toHaveBeenCalled();
  });

  it("interrupts an answer while it is still generating", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "thinking";

    (
      engine as unknown as {
        handleAcousticBargeIn: (info: { onsetSecondsAgo: number }) => void;
      }
    ).handleAcousticBargeIn({ onsetSecondsAgo: 0.2 });

    expect(mockStore.setStatus).toHaveBeenCalledWith("follow-up-listening");
    expect(mockCueMethods.stopWorkCue).toHaveBeenCalled();
  });

  it("catches a trailing-clause stop word when echo merges with real speech into one final", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";

    emit(
      engine,
      utterance("that is the goal of the app. Stop.")
    );

    expect(mockStore.upsertUtterance).not.toHaveBeenCalled();
    expect(mockStore.setStatus).toHaveBeenCalledWith("listening");
  });
});

describe("AriaEngine question-capture persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
  });

  it("does not buffer the wake-anchor utterance as a speaker turn (avoids duplicate transcript entries)", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    emit(engine, utterance("Kivo what's your favorite color?"));

    expect(turnAssemblerOf(engine).append).not.toHaveBeenCalled();
  });

  it("still buffers ordinary conversational utterances as speaker turns", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    emit(engine, utterance("we should talk about birds next"));

    expect(turnAssemblerOf(engine).append).toHaveBeenCalledTimes(1);
  });

  it("forwards the captured raw utterance ids so the persisted question can dedup them", async () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    // Arm capture from a wake+question utterance so wakeUtteranceId and
    // questionUtterances both reference the raw live utterance id.
    emit(engine, utterance("Kivo what do you think?", "u1"));

    await (
      engine as unknown as {
        resolveCapturedQuestion: (question: string) => Promise<void>;
      }
    ).resolveCapturedQuestion("what do you think?");

    expect(askSessionQuestion).toHaveBeenCalledWith(
      "session-1",
      expect.any(String),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      ["u1"],
      expect.objectContaining({ acceptPcm: expect.any(Boolean) })
    );
  });

  it("silences Kivo instead of asking the LLM when the captured question is itself a stop phrase", async () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    await (
      engine as unknown as {
        resolveCapturedQuestion: (question: string) => Promise<void>;
      }
    ).resolveCapturedQuestion("Just shut up.");

    expect(askSessionQuestion).not.toHaveBeenCalled();
    expect(mockStore.setStatus).toHaveBeenCalledWith("listening");
  });
});

describe("AriaEngine partial wake handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
  });

  it("arms capture on a partial wake but waits for final text as the question", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    emit(engine, {
      ...utterance("Kivo what do you think?", "u1"),
      isFinal: false,
      speechFinal: false,
    });

    expect(mockStore.setStatus).toHaveBeenCalledWith("capturing-question");
    expect(capturedQuestion(engine)).toBe("");

    emit(engine, utterance("Kivo what do you think?", "u1"));

    expect(capturedQuestion(engine)).toBe("what do you think?");
  });
});

describe("AriaEngine semantic fast-path endpointing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
  });

  function armCaptureWithPartial(engine: AriaEngine, partialText: string) {
    // Wake on a partial, then stream the question as a partial — the state
    // maybeForceEndpoint sees when the local VAD hears the voice stop.
    emit(engine, {
      ...utterance(partialText, "u1"),
      isFinal: false,
      speechFinal: false,
    });
  }

  function forceEndpoint(engine: AriaEngine) {
    (engine as unknown as { maybeForceEndpoint: () => void }).maybeForceEndpoint();
  }

  function withFakeStt(engine: AriaEngine) {
    const stt = { forceEndOfUtterance: vi.fn() };
    (engine as unknown as { stt: unknown }).stt = stt;
    return stt;
  }

  it("forces the endpoint when the voice stops on an unambiguous ask", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    armCaptureWithPartial(engine, "Kivo tell me what we should charge");
    forceEndpoint(engine);

    expect(stt.forceEndOfUtterance).toHaveBeenCalledTimes(1);
    // One force per voiced segment — a second silence must not re-fire.
    forceEndpoint(engine);
    expect(stt.forceEndOfUtterance).toHaveBeenCalledTimes(1);
  });

  it("does not force the endpoint on an unpunctuated question shape", () => {
    // The most common mid-thought cut-off: question-shaped words that the
    // speaker is still adding to. The acoustic end-of-turn decides these.
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    armCaptureWithPartial(engine, "Kivo what should we charge for the pro tier");
    forceEndpoint(engine);

    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();
  });

  it("does not force the endpoint on a first-wake rambling statement", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    armCaptureWithPartial(
      engine,
      "Kivo so I've been looking at the landing page numbers"
    );
    forceEndpoint(engine);

    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();
    expect(askSessionQuestion).not.toHaveBeenCalled();
  });

  it("does not force a follow-up complete thought — waits for acoustic EOU", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    (
      engine as unknown as {
        handleFollowUp: (
          id: string,
          speaker: number,
          speakerName: string | null,
          providerSpeakerLabel: string | null
        ) => void;
      }
    ).handleFollowUp("u-fu", 0, null, null);
    emit(engine, {
      ...utterance("so I've been looking at the landing page numbers", "u2"),
      isFinal: false,
      speechFinal: false,
    });
    forceEndpoint(engine);

    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();
    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(askSessionQuestion).mock.calls[0]?.[1]).toEqual(
      expect.stringContaining("landing page numbers")
    );
    expect(vi.mocked(askSessionQuestion).mock.calls[0]?.[6]).toEqual(
      expect.objectContaining({ speculative: true })
    );
  });

  it("does not force a punctuated first-wake briefing", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    armCaptureWithPartial(
      engine,
      "Kivo okay so we have been looking at pricing."
    );
    forceEndpoint(engine);

    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();
    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
    expect(askSessionQuestion).toHaveBeenLastCalledWith(
      "session-1",
      expect.stringContaining("looking at pricing"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ speculative: true })
    );
  });

  it("forces the endpoint on a yield closer even on the first wake", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    armCaptureWithPartial(engine, "Kivo alright yeah");
    forceEndpoint(engine);

    expect(stt.forceEndOfUtterance).toHaveBeenCalledTimes(1);
    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
    expect(askSessionQuestion).toHaveBeenLastCalledWith(
      "session-1",
      expect.stringContaining("alright yeah"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ speculative: true })
    );
  });

  it("does not force an unfinished follow-up tail", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    (
      engine as unknown as {
        handleFollowUp: (
          id: string,
          speaker: number,
          speakerName: string | null,
          providerSpeakerLabel: string | null
        ) => void;
      }
    ).handleFollowUp("u-fu", 0, null, null);
    emit(engine, {
      ...utterance("so I've been looking at the landing page and the", "u2"),
      isFinal: false,
      speechFinal: false,
    });
    forceEndpoint(engine);

    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();
    expect(askSessionQuestion).not.toHaveBeenCalled();
  });

  it("does not force outside question capture", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    forceEndpoint(engine);

    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();
  });

  it("speculatively dispatches a clear-ask while the speaker is still talking", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    withFakeStt(engine);

    armCaptureWithPartial(engine, "Kivo tell me what to charge for the pro tier");

    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
    expect(askSessionQuestion).toHaveBeenLastCalledWith(
      "session-1",
      expect.stringContaining("tell me what to charge"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ speculative: true })
    );
  });

  it("speculates on a likely-ask at speech-end", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = withFakeStt(engine);

    armCaptureWithPartial(engine, "Kivo what should we charge for the pro tier");
    forceEndpoint(engine);

    // Not forced (unpunctuated), but generation is already in flight — that is
    // what makes the longer acoustic wait free.
    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();
    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
    expect(askSessionQuestion).toHaveBeenLastCalledWith(
      "session-1",
      expect.stringContaining("what should we charge"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ speculative: true })
    );
  });

  it("restarts speculation when the draft grows", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    withFakeStt(engine);

    armCaptureWithPartial(engine, "Kivo tell me the price");
    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
    const firstAbort = vi.mocked(askSessionQuestion).mock.calls[0]?.[4] as
      | AbortSignal
      | undefined;

    emit(
      engine,
      utterance("Kivo tell me the price of the enterprise plan", "u1", {
        isFinal: false,
        speechFinal: false,
      })
    );

    expect(askSessionQuestion).toHaveBeenCalledTimes(2);
    expect(firstAbort?.aborted).toBe(true);
    expect(askSessionQuestion).toHaveBeenLastCalledWith(
      "session-1",
      expect.stringContaining("enterprise plan"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ speculative: true })
    );
  });
});

describe("AriaEngine speculative adopt / discard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
    // askAria consumes the response; a not-ok stub lets it unwind cleanly while
    // we assert on call counts / flags.
    vi.mocked(askSessionQuestion).mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
      headers: { get: () => null },
      text: async () => "",
    } as unknown as Response);
  });

  const speculate = (engine: AriaEngine, draft: string) =>
    (
      engine as unknown as { startSpeculativeAsk: (d: string) => void }
    ).startSpeculativeAsk(draft);

  const askAndReset = (engine: AriaEngine, question: string) =>
    (
      engine as unknown as {
        askAndReset: (
          q: string,
          s: number | null,
          n: string | null,
          ids: string[]
        ) => Promise<void>;
      }
    ).askAndReset(question, null, null, []);

  it("adopts a matching speculation instead of issuing a second request", async () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    speculate(engine, "tell me the pro tier price?");
    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
    expect(askSessionQuestion).toHaveBeenLastCalledWith(
      "session-1",
      "tell me the pro tier price?",
      null,
      null,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ speculative: true })
    );

    await askAndReset(engine, "tell me the pro tier price?");

    // Adopted — the in-flight speculative request is reused, no fresh fetch.
    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
  });

  it("discards a mismatched speculation and issues a fresh, non-speculative request", async () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });

    speculate(engine, "tell me the pro tier price?");
    await askAndReset(engine, "what is the enterprise price?");

    // One speculative + one real request.
    expect(askSessionQuestion).toHaveBeenCalledTimes(2);
    const secondCallOptions = vi.mocked(askSessionQuestion).mock.calls[1]?.[6] as
      | { speculative?: boolean }
      | undefined;
    expect(secondCallOptions?.speculative).toBeUndefined();
  });
});

describe("AriaEngine barge-in evidence fusion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
  });

  it("confirms on the first non-echo word when the acoustic detector is already suspicious", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";
    // The detector heard sustained voiced energy and ducked the answer.
    (engine as unknown as { ducked: boolean }).ducked = true;

    emit(
      engine,
      utterance("wait", "p1", { isFinal: false, speechFinal: false })
    );

    expect(mockStore.setStatus).toHaveBeenCalledWith("capturing-question");
  });

  it("still requires three partial words without acoustic corroboration", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";

    emit(
      engine,
      utterance("wait so", "p1", { isFinal: false, speechFinal: false })
    );

    expect(mockStore.setStatus).not.toHaveBeenCalledWith("capturing-question");
    expect(mockStore.status).toBe("speaking");
  });
});

describe("AriaEngine continuation after dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
  });

  function dispatched(
    engine: AriaEngine,
    question: string,
    overrides: Partial<{
      sourceUtteranceIds: string[];
      speaker: number | null;
      providerSpeakerLabel: string | null;
      atMs: number;
    }> = {}
  ) {
    (
      engine as unknown as {
        lastDispatch: {
          question: string;
          sourceUtteranceIds: string[];
          speaker: number | null;
          providerSpeakerLabel: string | null;
          atMs: number;
        } | null;
      }
    ).lastDispatch = {
      question,
      sourceUtteranceIds: ["u1"],
      speaker: 0,
      providerSpeakerLabel: "conversation",
      atMs: Date.now(),
      ...overrides,
    };
    mockStore.status = "thinking";
  }

  it("takes the answer back when the asker keeps going", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    dispatched(engine, "what should we charge for the pro tier");

    emit(engine, utterance("compared to the plus tier", "u2"));

    expect(mockStore.setStatus).toHaveBeenCalledWith("capturing-question");
    // The reopened capture carries the whole thought, not just the tail.
    expect(capturedQuestion(engine)).toContain("what should we charge");
    expect(capturedQuestion(engine)).toContain("compared to the plus tier");
  });

  it("ignores the dispatched question's own final re-arriving", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    dispatched(engine, "what should we charge for the pro tier");

    // Same words, new id — captured from partials, finalized after dispatch.
    emit(engine, utterance("What should we charge for the pro tier?", "u9"));

    expect(mockStore.setStatus).not.toHaveBeenCalledWith("capturing-question");
  });

  it("ignores another person talking while Kivo thinks", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "speaker",
    });
    dispatched(engine, "what should we charge for the pro tier", {
      providerSpeakerLabel: "Mose",
    });

    emit(
      engine,
      utterance("did you see the email from finance", "u2", {
        speaker: 1,
        speakerName: "Sam",
        providerSpeakerLabel: "Sam",
      })
    );

    expect(mockStore.setStatus).not.toHaveBeenCalledWith("capturing-question");
  });

  it("ignores a backchannel from the asker", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    dispatched(engine, "what should we charge for the pro tier");

    emit(engine, utterance("yeah okay", "u2"));

    expect(mockStore.setStatus).not.toHaveBeenCalledWith("capturing-question");
  });

  it("ignores speech once the continuation window has passed", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    dispatched(engine, "what should we charge for the pro tier", {
      atMs: Date.now() - 5_000,
    });

    emit(engine, utterance("compared to the plus tier", "u2"));

    expect(mockStore.setStatus).not.toHaveBeenCalledWith("capturing-question");
  });
});

describe("AriaEngine local speech-end staging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
  });

  function silentEngine(draft: string) {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    const stt = { forceEndOfUtterance: vi.fn() };
    (engine as unknown as { stt: unknown }).stt = stt;
    emit(engine, {
      ...utterance(draft, "u1"),
      isFinal: false,
      speechFinal: false,
    });
    const internals = engine as unknown as {
      localSpeechDetector: { process: () => { probability: number } };
      localSpeechActive: boolean;
      localSpeechLastPositiveMs: number;
      observeLocalSpeech: (frame: Int16Array) => void;
    };
    internals.localSpeechDetector = { process: () => ({ probability: 0 }) };
    internals.localSpeechActive = true;
    const silentFor = (ms: number) => {
      internals.localSpeechLastPositiveMs = performance.now() - ms;
      internals.observeLocalSpeech(new Int16Array(512));
    };
    return { engine, stt, silentFor };
  }

  it("pre-warms an answer on a short gap without ending the turn", () => {
    const { stt, silentFor } = silentEngine("Kivo tell me what we should charge");

    silentFor(300);

    expect(askSessionQuestion).toHaveBeenCalledTimes(1);
    expect(askSessionQuestion).toHaveBeenLastCalledWith(
      "session-1",
      expect.any(String),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ speculative: true })
    );
    // A breath is not an endpoint.
    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();
  });

  it("ends the turn only after a real pause", () => {
    const { stt, silentFor } = silentEngine("Kivo tell me what we should charge");

    silentFor(300);
    expect(stt.forceEndOfUtterance).not.toHaveBeenCalled();

    silentFor(600);
    expect(stt.forceEndOfUtterance).toHaveBeenCalledTimes(1);
  });
});
