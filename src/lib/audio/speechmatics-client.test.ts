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

describe("groupSpeechmaticsResultsBySpeaker echo runs", () => {
  const word = (content: string, start: number) => ({
    type: "word" as const,
    start_time: start,
    end_time: start + 0.2,
    alternatives: [{ content, confidence: 1, speaker: "S1" }],
  });

  it("keeps words in spoken order when an echo run splits a sentence", () => {
    // "Yes," lands inside an assistant-speech window; the rest does not.
    const groups = groupSpeechmaticsResultsBySpeaker(
      [word("Yes", 0), word("I", 0.4), word("have", 0.6), word("been", 0.8)],
      (item) => (item.start_time ?? 0) < 0.3
    );

    expect(groups.map((group) => group.text)).toEqual(["Yes", "I have been"]);
    expect(groups.map((group) => group.overlapsAssistantSpeech)).toEqual([
      true,
      false,
    ]);
  });

  it("keeps trailing punctuation attached to the run it terminates", () => {
    const groups = groupSpeechmaticsResultsBySpeaker(
      [
        word("Israel", 0),
        {
          type: "punctuation" as const,
          start_time: 0.2,
          end_time: 0.2,
          alternatives: [{ content: ".", confidence: 1, speaker: "S1" }],
        },
      ],
      (item) => item.type === "punctuation"
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].text).toBe("Israel.");
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
        overlapsAssistantSpeech: false,
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
      model: "enhanced",
      diarization: "speaker",
    });
    expect(config).not.toHaveProperty("operating_point");
    expect(config).toHaveProperty("speaker_diarization_config");
    expect(config.speaker_diarization_config).toMatchObject({
      get_speakers: true,
    });
  });

  it("keeps enrolled voiceprints under the provider's 50-identifier ceiling", () => {
    // Speechmatics caps identifiers across *all* speakers and rejects the whole
    // recognition when the total is exceeded — 25 profiles (every plan's limit)
    // carrying 8 prints each is well past it.
    const profiles = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`,
      name: `Person ${i}`,
      speakerIdentifiers: Array.from({ length: 8 }, (_, j) => `p${i}-print-${j}`),
      anchorCount: 3,
      sampleCount: 8,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    }));
    const client = new SpeechmaticsLiveClient(callbacks, profiles, {
      transcriptionMode: "speaker",
    });
    const config = client.buildStartRecognitionMessage().transcription_config;
    const speakers = (
      config.speaker_diarization_config as {
        speakers: Array<{ label: string; speaker_identifiers: string[] }>;
      }
    ).speakers;

    const total = speakers.reduce(
      (sum, speaker) => sum + speaker.speaker_identifiers.length,
      0
    );
    expect(total).toBeLessThanOrEqual(50);
    // Every enrolled speaker still gets a print — dropping people entirely
    // would make them permanently unrecognisable.
    expect(speakers).toHaveLength(25);
    expect(
      speakers.every((speaker) => speaker.speaker_identifiers.length > 0)
    ).toBe(true);
  });

  it("biases recognition toward Kivo's core product vocabulary", () => {
    const client = new SpeechmaticsLiveClient(callbacks, [], {
      transcriptionMode: "speaker",
    });
    const config = client.buildStartRecognitionMessage().transcription_config;
    const vocabulary = config.additional_vocab as Array<{
      content: string;
      sounds_like?: string[];
    }>;

    expect(vocabulary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "Kivo" }),
        expect.objectContaining({
          content: "Speechmatics",
          sounds_like: expect.arrayContaining([
            "speech matics",
            "speech mattox",
            "speech matters",
          ]),
        }),
        expect.objectContaining({ content: "Cartesia" }),
        expect.objectContaining({ content: "Anthropic" }),
        expect.objectContaining({ content: "Claude" }),
      ])
    );
  });

  it("namespaces captured voiceprints to their recognition stream", () => {
    const results: Array<{
      label: string;
      speakerIdentifiers: string[];
      streamEpoch: number;
    }> = [];
    const client = new SpeechmaticsLiveClient({
      ...callbacks,
      onSpeakersResult: (speakers) => results.push(...speakers),
    });
    const handleMessage = (
      client as unknown as {
        handleMessage: (message: unknown) => void;
      }
    ).handleMessage.bind(client);

    handleMessage({ message: "RecognitionStarted" });
    handleMessage({
      message: "SpeakersResult",
      speakers: [{ label: "S1", speaker_identifiers: ["voice-a"] }],
    });

    expect(results).toEqual([
      {
        label: "S1",
        speakerIdentifiers: ["voice-a"],
        streamEpoch: 1,
      },
    ]);
  });

  it("uses standard transcription with diarization disabled for basic mode", () => {
    const client = new SpeechmaticsLiveClient(callbacks, [], {
      transcriptionMode: "basic",
    });
    const message = client.buildStartRecognitionMessage();
    const config = message.transcription_config;

    expect(config).toMatchObject({
      model: "standard",
      diarization: "none",
    });
    expect(config).not.toHaveProperty("operating_point");
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
      transcript_filtering_config: { remove_disfluencies: true },
      max_delay: 4,
      max_delay_mode: "flexible",
      conversation_config: {
        // Must stay LESS than max_delay per Speechmatics turn-detection docs.
        end_of_utterance_silence_trigger: 0.6,
      },
    });
  });

  it("keeps V2 end-of-utterance silence below max delay", () => {
    const client = new SpeechmaticsLiveClient(callbacks, [], {
      transcriptionMode: "speaker",
      voiceEngineV2: true,
    });
    const config = client.buildStartRecognitionMessage().transcription_config;
    const conversation = config.conversation_config as {
      end_of_utterance_silence_trigger: number;
    };

    expect(conversation.end_of_utterance_silence_trigger).toBe(0.8);
    expect(conversation.end_of_utterance_silence_trigger).toBeLessThan(
      config.max_delay as number
    );
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
