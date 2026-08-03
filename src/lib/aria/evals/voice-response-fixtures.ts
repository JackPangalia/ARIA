export type VoiceResponseFixture = {
  id: string;
  category:
    | "direct"
    | "ambiguous"
    | "disagreement"
    | "context_recall"
    | "factual_lookup"
    | "interruption";
  context: string;
  question: string;
  rubric: string[];
  maxSpokenSentences: number;
};

/**
 * Stable quality set for Haiku/Sonnet comparisons. Replace anonymized context
 * with additional real failures as they are captured, but keep old fixtures so
 * prompt/model changes can be compared longitudinally.
 */
export const VOICE_RESPONSE_FIXTURES: VoiceResponseFixture[] = [
  {
    id: "direct-recommendation",
    category: "direct",
    context: "The team values reliability over novelty and has one engineer.",
    question: "Which database should we use?",
    rubric: ["answers in the first sentence", "makes one recommendation", "uses context"],
    maxSpokenSentences: 3,
  },
  {
    id: "ambiguous-material-detail",
    category: "ambiguous",
    context: "The group discussed shipping a desktop app and a browser app.",
    question: "How long will that take?",
    rubric: ["asks one brief clarification", "does not invent a timeline"],
    maxSpokenSentences: 2,
  },
  {
    id: "disagreement-pricing",
    category: "disagreement",
    context:
      "Maya wants a low launch price. Leon argues support costs require a higher tier.",
    question: "Who has the stronger argument?",
    rubric: ["takes a position", "names the decisive tradeoff", "stays respectful"],
    maxSpokenSentences: 3,
  },
  {
    id: "early-context-recall",
    category: "context_recall",
    context:
      "At the start, the team agreed the beta is in-person only. Later they discussed video calls.",
    question: "What did we decide the beta includes?",
    rubric: ["recalls in-person only", "does not confuse later discussion with the decision"],
    maxSpokenSentences: 2,
  },
  {
    id: "current-factual-lookup",
    category: "factual_lookup",
    context: "The team is choosing an API based on current pricing.",
    question: "Look up the current price and tell me the cheaper option.",
    rubric: ["uses search", "states the source", "answers the comparison directly"],
    maxSpokenSentences: 4,
  },
  {
    id: "interrupted-correction",
    category: "interruption",
    context:
      "Kivo began recommending option A. The user interrupted: No, I meant for offline use.",
    question: "No, I meant for offline use.",
    rubric: ["answers the correction immediately", "does not defend the old answer"],
    maxSpokenSentences: 3,
  },
];

