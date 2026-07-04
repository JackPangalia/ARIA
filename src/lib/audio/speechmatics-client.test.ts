import { describe, expect, it } from "vitest";
import {
  SpeechmaticsLiveClient,
  groupSpeechmaticsResultsAsConversation,
  groupSpeechmaticsResultsBySpeaker,
} from "@/lib/audio/speechmatics-client";

describe("groupSpeechmaticsResultsBySpeaker", () => {
  it("groups contiguous words by Speechmatics speaker labels", () => {
    const groups = groupSpeechmaticsResultsBySpeaker([
      {
        type: "word",
        start_time: 0,
        end_time: 0.4,
        alternatives: [{ content: "Hello", confidence: 0.9, speaker: "S1" }],
      },
      {
        type: "word",
        start_time: 0.4,
        end_time: 0.8,
        alternatives: [{ content: "there", confidence: 0.8, speaker: "S1" }],
      },
      {
        type: "word",
        start_time: 1,
        end_time: 1.4,
        alternatives: [{ content: "Hi", confidence: 0.95, speaker: "Alice" }],
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      providerSpeakerLabel: "S1",
      text: "Hello there",
      start: 0,
      end: 0.8,
    });
    expect(groups[1]).toMatchObject({
      providerSpeakerLabel: "Alice",
      text: "Hi",
      start: 1,
      end: 1.4,
    });
  });

  it("attaches punctuation to the previous speaker run", () => {
    const groups = groupSpeechmaticsResultsBySpeaker([
      {
        type: "word",
        start_time: 0,
        end_time: 0.4,
        alternatives: [{ content: "Hello", confidence: 0.9, speaker: "S1" }],
      },
      {
        type: "punctuation",
        start_time: 0.4,
        end_time: 0.4,
        alternatives: [{ content: ",", confidence: 1 }],
      },
      {
        type: "word",
        start_time: 0.5,
        end_time: 0.9,
        alternatives: [{ content: "ARIA", confidence: 0.9, speaker: "S1" }],
      },
      {
        type: "punctuation",
        start_time: 0.9,
        end_time: 0.9,
        alternatives: [{ content: "?", confidence: 1 }],
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.text).toBe("Hello, ARIA?");
  });
});

describe("groupSpeechmaticsResultsAsConversation", () => {
  it("collapses all words into one generic conversation group", () => {
    const groups = groupSpeechmaticsResultsAsConversation([
      {
        type: "word",
        start_time: 0,
        end_time: 0.4,
        alternatives: [{ content: "Hello", confidence: 0.9, speaker: "S1" }],
      },
      {
        type: "word",
        start_time: 0.4,
        end_time: 0.8,
        alternatives: [{ content: "there", confidence: 0.8, speaker: "S2" }],
      },
      {
        type: "punctuation",
        start_time: 0.8,
        end_time: 0.8,
        alternatives: [{ content: ".", confidence: 1 }],
      },
    ]);

    expect(groups).toEqual([
      {
        providerSpeakerLabel: "conversation",
        text: "Hello there.",
        start: 0,
        end: 0.8,
        confidence: 1,
      },
    ]);
  });
});

describe("SpeechmaticsLiveClient start config", () => {
  const callbacks = {
    onUtterance: () => undefined,
    onUtteranceEnd: () => undefined,
    onError: () => undefined,
    onOpen: () => undefined,
    onClose: () => undefined,
  };

  it("keeps speaker mode on enhanced diarized transcription", () => {
    const client = new SpeechmaticsLiveClient(callbacks, [], {
      transcriptionMode: "speaker",
    });
    const message = client.buildStartRecognitionMessage();
    const config = message.transcription_config;

    expect(config).toMatchObject({
      operating_point: "enhanced",
      diarization: "speaker",
    });
    expect(config).toHaveProperty("speaker_diarization_config");
  });

  it("uses standard transcription with diarization disabled for basic mode", () => {
    const client = new SpeechmaticsLiveClient(callbacks, [], {
      transcriptionMode: "basic",
    });
    const message = client.buildStartRecognitionMessage();
    const config = message.transcription_config;

    expect(config).toMatchObject({
      operating_point: "standard",
      diarization: "none",
    });
    expect(config).not.toHaveProperty("speaker_diarization_config");
  });

  it("uses voice-agent turn detection timing", () => {
    const client = new SpeechmaticsLiveClient(callbacks, [], {
      transcriptionMode: "basic",
    });
    const message = client.buildStartRecognitionMessage();
    const config = message.transcription_config;

    expect(config).toMatchObject({
      enable_partials: true,
      max_delay: 0.7,
      max_delay_mode: "fixed",
      conversation_config: {
        end_of_utterance_silence_trigger: 0.8,
      },
    });
  });

  it("uses the same utterance id for partial and final events from one span", () => {
    const utteranceIds: string[] = [];
    const client = new SpeechmaticsLiveClient({
      ...callbacks,
      onUtterance: (utterance) => {
        utteranceIds.push(utterance.id);
      },
    });
    const emitTranscript = (
      client as unknown as {
        handleTranscript: (message: {
          message: "AddPartialTranscript" | "AddTranscript";
          metadata: { start_time: number; end_time: number; transcript: string };
          results: Array<{
            type: "word";
            start_time: number;
            end_time: number;
            alternatives: Array<{ content: string; speaker: string }>;
          }>;
        }) => void;
      }
    ).handleTranscript.bind(client);

    const transcript = {
      metadata: { start_time: 2.5, end_time: 3, transcript: "hello" },
      results: [
        {
          type: "word" as const,
          start_time: 2.5,
          end_time: 3,
          alternatives: [{ content: "hello", speaker: "S1" }],
        },
      ],
    };

    emitTranscript({ message: "AddPartialTranscript", ...transcript });
    emitTranscript({ message: "AddTranscript", ...transcript });

    expect(utteranceIds).toEqual(["2.5-0", "2.5-0"]);
  });
});

describe("stream epochs (reconnect / speaker-correction restart)", () => {
  const callbacks = {
    onUtterance: () => undefined,
    onUtteranceEnd: () => undefined,
    onError: () => undefined,
    onOpen: () => undefined,
    onClose: () => undefined,
  };

  type Internals = {
    handleMessage: (msg: { message: string }) => void;
    handleTranscript: (msg: {
      message: "AddPartialTranscript" | "AddTranscript";
      metadata: { start_time: number; end_time: number; transcript: string };
      results: Array<{
        type: "word";
        start_time: number;
        end_time: number;
        alternatives: Array<{ content: string; speaker: string }>;
      }>;
    }) => void;
  };

  function emitWord(client: SpeechmaticsLiveClient, content: string) {
    (client as unknown as Internals).handleTranscript({
      message: "AddTranscript",
      metadata: { start_time: 0.5, end_time: 1, transcript: content },
      results: [
        {
          type: "word",
          start_time: 0.5,
          end_time: 1,
          alternatives: [{ content, speaker: "S1" }],
        },
      ],
    });
  }

  function startStream(client: SpeechmaticsLiveClient) {
    (client as unknown as Internals).handleMessage({
      message: "RecognitionStarted",
    });
  }

  it("namespaces utterance ids per stream so restarts cannot collide", () => {
    const ids: string[] = [];
    const client = new SpeechmaticsLiveClient({
      ...callbacks,
      onUtterance: (u) => ids.push(u.id),
    });

    startStream(client);
    emitWord(client, "first");
    startStream(client); // reconnect/restart — provider timestamps reset to 0
    emitWord(client, "second");

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe("0.5-0");
    expect(ids[1]).toBe("2:0.5-0");
  });

  it("rebases the echo timeline on a new stream", () => {
    const events: Array<{ text: string; overlapsAssistantSpeech?: boolean }> =
      [];
    const client = new SpeechmaticsLiveClient({
      ...callbacks,
      onUtterance: (u) => events.push(u),
    });

    startStream(client);
    // 10s of audio, with TTS playing across the stream boundary.
    client.sendPcm(new Int16Array(160000));
    client.markAssistantSpeechStart();
    startStream(client); // restart: word timestamps are near zero again

    // Word at 0.5s on the NEW timeline, while TTS is still playing — must be
    // flagged as echo even though the old timeline was already at 10s.
    emitWord(client, "echoed");
    client.markAssistantSpeechEnd();

    expect(events).toHaveLength(1);
    expect(events[0]?.overlapsAssistantSpeech).toBe(true);
  });
});

describe("assistant-speech echo attribution", () => {
  const callbacks = {
    onUtterance: () => undefined,
    onUtteranceEnd: () => undefined,
    onError: () => undefined,
    onOpen: () => undefined,
    onClose: () => undefined,
  };

  function makeClient(onUtterance: (u: { text: string; overlapsAssistantSpeech?: boolean }) => void) {
    return new SpeechmaticsLiveClient({ ...callbacks, onUtterance });
  }

  function emit(
    client: SpeechmaticsLiveClient,
    message: "AddPartialTranscript" | "AddTranscript",
    startTime: number,
    endTime: number,
    words: Array<{ content: string; start: number; end: number }>
  ) {
    (
      client as unknown as {
        handleTranscript: (msg: {
          message: "AddPartialTranscript" | "AddTranscript";
          metadata: { start_time: number; end_time: number; transcript: string };
          results: Array<{
            type: "word";
            start_time: number;
            end_time: number;
            alternatives: Array<{ content: string; speaker: string }>;
          }>;
        }) => void;
      }
    ).handleTranscript({
      message,
      metadata: { start_time: startTime, end_time: endTime, transcript: "" },
      results: words.map((w) => ({
        type: "word" as const,
        start_time: w.start,
        end_time: w.end,
        alternatives: [{ content: w.content, speaker: "S1" }],
      })),
    });
  }

  it("flags words whose audio timestamp falls inside an assistant-speech interval", () => {
    const events: Array<{ text: string; overlapsAssistantSpeech?: boolean }> = [];
    const client = makeClient((u) => events.push(u));

    // Advance the mic audio-stream clock to 2s, then mark TTS playback
    // starting (interval opens at ~1.85s pre-roll).
    client.sendPcm(new Int16Array(32000)); // 2s of audio sent
    client.markAssistantSpeechStart();
    client.sendPcm(new Int16Array(16000)); // advance to 3s while "speaking"
    client.markAssistantSpeechEnd(); // interval closes at 3.6s (with tail)

    emit(client, "AddTranscript", 2, 4.4, [
      { content: "blues", start: 2.2, end: 2.6 }, // inside [1.85, 3.6] -> echo
      { content: "why", start: 4, end: 4.4 }, // outside -> real speech
    ]);

    expect(events).toHaveLength(2);
    const echo = events.find((e) => e.text === "blues");
    const clean = events.find((e) => e.text === "why");
    expect(echo?.overlapsAssistantSpeech).toBe(true);
    expect(clean?.overlapsAssistantSpeech).toBeFalsy();
  });

  it("does not emit an echo utterance when no words overlap assistant speech", () => {
    const events: Array<{ text: string; overlapsAssistantSpeech?: boolean }> = [];
    const client = makeClient((u) => events.push(u));

    emit(client, "AddTranscript", 0, 1, [
      { content: "hello", start: 0, end: 0.4 },
      { content: "there", start: 0.4, end: 0.8 },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.overlapsAssistantSpeech).toBeFalsy();
  });

  it("treats words well after the echo tail as clean speech again", () => {
    const events: Array<{ text: string; overlapsAssistantSpeech?: boolean }> = [];
    const client = makeClient((u) => events.push(u));

    client.markAssistantSpeechStart(); // opens at ~-0.15s (clamped to 0)
    client.sendPcm(new Int16Array(16000)); // advance to 1s
    client.markAssistantSpeechEnd(); // closes at 1.6s

    emit(client, "AddTranscript", 5, 5.4, [
      { content: "later", start: 5, end: 5.4 },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.overlapsAssistantSpeech).toBeFalsy();
  });
});
