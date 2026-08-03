"use client";

type GuideStep = {
  /** Orb accent color(s) — two values render as a gradient dot. */
  colors: [string] | [string, string];
  phase: string;
  title: string;
  description: string;
};

const GUIDE_STEPS: GuideStep[] = [
  {
    colors: ["#34d399"],
    phase: "Listen",
    title: "Press Start",
    description: "Kivo transcribes everything in the room. The orb turns green.",
  },
  {
    colors: ["#fbbf24"],
    phase: "Ask",
    title: 'Say "Hey Kivo"',
    description: "Then ask your question — summarize, recall, or get a take.",
  },
  {
    colors: ["#8b5cf6", "#ec4899"],
    phase: "Answer",
    title: "Kivo responds",
    description: "It thinks, then answers out loud through your speakers.",
  },
  {
    colors: ["#fbbf24"],
    phase: "Follow-up",
    title: "Keep the conversation going",
    description: "Ask a quick follow-up right away — no wake word needed.",
  },
  {
    colors: ["#34d399"],
    phase: "Wrap up",
    title: "Back to listening",
    description: 'Say "stop" or "thank you, Kivo" when you\'re done.',
  },
];

function StepDot({ colors }: { colors: GuideStep["colors"] }) {
  const background =
    colors.length === 2
      ? `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`
      : colors[0];

  return (
    <span
      aria-hidden
      className="relative z-10 mt-1 block h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_4px_var(--app-bg)]"
      style={{ background }}
    />
  );
}

export function OnboardingGuide() {
  return (
    <div className="mx-auto w-full max-w-sm text-left">
      <ol className="relative m-0 list-none p-0">
        {GUIDE_STEPS.map((step, index) => {
          const isLast = index === GUIDE_STEPS.length - 1;
          return (
            <li
              key={step.phase}
              className={`relative flex gap-4${isLast ? "" : " pb-7"}`}
            >
              {!isLast ? (
                <span
                  aria-hidden
                  className="absolute left-[5px] top-4 h-[calc(100%-0.5rem)] w-px bg-app-border"
                />
              ) : null}

              <StepDot colors={step.colors} />

              <div className="min-w-0 flex-1 pt-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-app-subtle">
                  {step.phase}
                </p>
                <p className="mt-1 font-sans text-[15px] font-normal leading-snug tracking-[-0.01em] text-app">
                  {step.title}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-app-muted">
                  {step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
