export const FAQ_ITEMS = [
  {
    q: "Is Kivo a meeting recorder?",
    a: "Kivo can transcribe and summarize meetings, but that isn’t the main idea. Kivo is a voice AI you can interact with during the conversation itself.",
  },
  {
    q: "Does Kivo join Zoom or Google Meet calls?",
    a: "Kivo is designed primarily for conversations happening around you. It listens through your device instead of joining as a meeting bot.",
  },
  {
    q: "How does Kivo know who’s speaking?",
    a: "Kivo uses speaker recognition to distinguish between people in the conversation and keep track of who said what.",
  },
  {
    q: "What can I ask Kivo?",
    a: "You can ask questions about the conversation, request summaries, clarify something that was said, brainstorm ideas, retrieve earlier points, or ask general questions.",
  },
  {
    q: "Does Kivo listen all the time?",
    a: "Kivo only listens while you have an active session running.",
  },
  {
    q: "Is my data private?",
    a: "Your conversations are handled according to Kivo’s privacy policy. You remain in control of your sessions and stored conversation history.",
  },
] as const;

export const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};
