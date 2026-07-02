import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AriaStatus, TranscriptUtterance } from "@/lib/types";

const mockStore = vi.hoisted(() => {
  const store: {
    status: AriaStatus;
    clearTranscript: ReturnType<typeof vi.fn>;
    setError: ReturnType<typeof vi.fn>;
    setStatus: ReturnType<typeof vi.fn>;
    setMicLevel: ReturnType<typeof vi.fn>;
    upsertUtterance: ReturnType<typeof vi.fn>;
  } = {
    status: "listening",
    clearTranscript: vi.fn(),
    setError: vi.fn(),
    setStatus: vi.fn((status: AriaStatus) => {
      store.status = status;
    }),
    setMicLevel: vi.fn(),
    upsertUtterance: vi.fn(),
  };
  return store;
});

const mockCueMethods = vi.hoisted(() => ({
  ensureReady: vi.fn(),
  playError: vi.fn(),
  playWake: vi.fn(),
  playClose: vi.fn(),
  playFollowUp: vi.fn(),
  startThinkingLoop: vi.fn(),
  stopThinkingLoop: vi.fn(),
  dispose: vi.fn(),
  playClip: vi.fn(),
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

describe("AriaEngine assistant command path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.status = "listening";
  });

  it("drops non-command speech while Kivo is speaking", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "basic",
    });
    mockStore.status = "speaking";

    emit(
      engine,
      utterance("That is the answer I was giving out loud from the speakers.")
    );

    expect(mockStore.upsertUtterance).not.toHaveBeenCalled();
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
    expect(mockCueMethods.stopThinkingLoop).toHaveBeenCalled();
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

  it("silences Kivo when a flagged echo utterance contains a stop word", () => {
    const engine = new AriaEngine({
      sessionId: "session-1",
      transcriptionMode: "speaker",
    });
    mockStore.status = "listening";

    emit(
      engine,
      utterance("shut up", "u1", { overlapsAssistantSpeech: true })
    );

    expect(mockStore.upsertUtterance).not.toHaveBeenCalled();
    expect(mockStore.setStatus).toHaveBeenCalledWith("listening");
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
      ["u1"]
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
