"use client";

type GuideStep = {
  phase: string;
  title: string;
  description: string;
};

const GUIDE_STEPS: GuideStep[] = [
  {
    phase: "Listen",
    title: "Press Start",
    description: "Kivo transcribes everything in the room.",
  },
  {
    phase: "Ask",
    title: 'Say "Hey Kivo"',
    description: "Then ask your question — summarize, recall, or get a take.",
  },
  {
    phase: "Answer",
    title: "Kivo responds",
    description: "It thinks, then answers out loud through your speakers.",
  },
  {
    phase: "Follow-up",
    title: "Keep going",
    description: "Ask a quick follow-up right away — no wake word needed.",
  },
  {
    phase: "Wrap up",
    title: "Back to listening",
    description: 'Say "stop" or "thank you, Kivo" when you\'re done.',
  },
];

export function OnboardingGuide() {
  return (
    <ol className="kivo-stagger mx-auto m-0 w-full max-w-sm list-none space-y-6 p-0 text-left">
      {GUIDE_STEPS.map((step, index) => (
        <li key={step.phase} className="flex gap-4">
          <span className="w-5 shrink-0 pt-0.5 text-[12px] tabular-nums text-app-subtle">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-sans text-[15px] font-medium leading-snug tracking-[-0.02em] text-app">
              {step.title}
            </p>
            <p className="mt-1 text-[13px] leading-[1.55] text-app-muted">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
