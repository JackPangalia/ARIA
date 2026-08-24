"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { VoiceSettingsPanel } from "@/components/settings/VoiceSettingsPanel";
import { OnboardingPaneOverlay } from "@/components/onboarding/OnboardingPaneOverlay";
import { completeOnboarding } from "@/lib/onboarding/client";

const TOTAL_STEPS = 4;

type StepKind = "welcome" | "appearance" | "voice" | "speakers";

const STEPS: {
  kind: StepKind;
  kicker: string;
  title: string;
  description: string;
  image: string;
  alt: string;
}[] = [
  {
    kind: "welcome",
    kicker: "In the room with you",
    title: "Welcome",
    description:
      "Kivo listens to the conversation, understands who's speaking, and answers out loud when you ask.",
    image: "/landing/kivo-hero-cinematic-meeting-motion-v2.png",
    alt: "A small team in a thoughtful in-person meeting",
  },
  {
    kind: "appearance",
    kicker: "This device",
    title: "Appearance",
    description: "Choose how Kivo looks on this screen — light, dark, or match the system.",
    image: "/landing/kivo-hero-night-build-motion-v2.png",
    alt: "Founders working together late at night",
  },
  {
    kind: "voice",
    kicker: "When it answers",
    title: "Voice",
    description: "This is the voice Kivo speaks with. Preview a few, then pick one.",
    image: "/landing/kivo-hero-bali-brainstorm-motion-v2.png",
    alt: "A small team brainstorming around a table",
  },
  {
    kind: "speakers",
    kicker: "After the session",
    title: "Who's speaking",
    description:
      "Kivo keeps voices distinct as people talk. Tap a name in the transcript to label someone — no recording first.",
    image: "/landing/kivo-hero-whiteboard-workshop-motion-v2.png",
    alt: "A team collaborating around a whiteboard",
  },
];

type OnboardingFlowProps = {
  onComplete: () => void;
  /** Dev preview — skip persisting onboarding completion. */
  preview?: boolean;
};

const PRIMARY_BTN =
  "inline-flex min-w-[9.5rem] items-center justify-center rounded-full bg-accent px-8 py-2.5 text-[13px] font-medium tracking-[0.02em] text-accent-fg transition-[opacity,transform] duration-150 hover:opacity-90 active:translate-y-px disabled:pointer-events-none disabled:opacity-40";

const GHOST_BTN =
  "rounded-full px-5 py-2.5 text-[13px] font-medium text-app-muted transition-colors duration-150 hover:bg-surface hover:text-app disabled:opacity-40";

function ProgressRail({ step }: { step: number }) {
  return (
    <div className="flex w-full max-w-[9rem] items-center gap-1.5" aria-hidden>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const n = i + 1;
        return (
          <span
            key={n}
            className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
              n <= step ? "bg-app" : "bg-surface-strong"
            }`}
          />
        );
      })}
    </div>
  );
}

export function OnboardingFlow({ onComplete, preview = false }: OnboardingFlowProps) {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const goNext = useCallback(() => {
    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  }, []);

  const goBack = useCallback(() => {
    setStep((current) => Math.max(1, current - 1));
  }, []);

  const finish = useCallback(async () => {
    setFinishing(true);
    setError(null);
    try {
      if (!preview) {
        await completeOnboarding();
      }
      onComplete();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not finish setup."
      );
      setFinishing(false);
    }
  }, [onComplete, preview]);

  if (!mounted) return null;

  const current = STEPS[step - 1]!;
  const photoRight = step % 2 === 0;
  const primaryLabel = step === TOTAL_STEPS ? "Get started" : "Continue";
  const primaryAction =
    step === TOTAL_STEPS ? () => void finish() : goNext;

  const photo = (
    <figure
      className={`kivo-onboarding-pane relative isolate min-h-[34vh] overflow-hidden lg:min-h-0 lg:h-full ${
        photoRight ? "lg:order-2" : ""
      }`}
    >
      <Image
        key={current.image}
        src={current.image}
        alt={current.alt}
        fill
        priority={step === 1}
        sizes="(max-width: 1024px) 100vw, 55vw"
        className="kivo-onboarding-pane-image object-cover"
      />
      <OnboardingPaneOverlay key={current.kind} kind={current.kind} />
    </figure>
  );

  const copy = (
    <section
      className={`flex min-h-0 flex-1 flex-col bg-app ${
        photoRight ? "lg:order-1" : ""
      }`}
    >
      <header className="safe-pt flex shrink-0 items-center justify-between gap-6 px-6 pt-6 pb-2 sm:px-10 lg:px-14 lg:pt-9">
        <p className="kivo-wordmark select-none text-app">Kivo</p>
        <div className="flex items-center gap-3">
          <ProgressRail step={step} />
          <p className="text-[11px] font-medium tabular-nums tracking-[0.08em] text-app-subtle">
            {step} / {TOTAL_STEPS}
          </p>
        </div>
      </header>

      <div
        key={current.kind}
        className="kivo-fade-in flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-8 pb-6 sm:px-10 lg:px-14 lg:pt-14"
      >
        <div className="w-full max-w-[26rem]">
          <p className="kivo-kicker">{current.kicker}</p>
          <h1
            id="onboarding-title"
            className="mt-5 font-serif text-[2.85rem] font-normal leading-[0.94] tracking-[-0.045em] text-balance text-app sm:text-[3.65rem] lg:text-[4.15rem]"
          >
            {current.title}
          </h1>
          <p className="mt-6 max-w-[22rem] text-[1.05rem] leading-[1.65] tracking-[-0.012em] text-pretty text-app-secondary">
            {current.description}
          </p>

          {current.kind === "welcome" ? (
            <p className="mt-5 text-[13px] leading-relaxed text-app-subtle">
              A minute to get set up.
            </p>
          ) : null}

          {current.kind === "appearance" ? (
            <div className="mt-12 grok-settings-embedded">
              <ThemeToggle variant="settings" />
            </div>
          ) : null}

          {current.kind === "voice" ? (
            <div className="kivo-onboarding-voices mt-11 max-h-[min(44vh,24rem)] overflow-y-auto pr-1 grok-settings-embedded">
              <VoiceSettingsPanel variant="onboarding" />
            </div>
          ) : null}

          {current.kind === "speakers" ? (
            <ul className="mt-12 m-0 list-none space-y-6 p-0">
              <li className="max-w-[22rem] text-[1.05rem] leading-[1.6] text-app-muted">
                <span className="font-medium text-app">During the session.</span>{" "}
                Speakers stay distinct as the room talks.
              </li>
              <li className="max-w-[22rem] text-[1.05rem] leading-[1.6] text-app-muted">
                <span className="font-medium text-app">Afterward.</span>{" "}
                Open the transcript and tap a name. Those labels stay with the
                conversation.
              </li>
            </ul>
          ) : null}

          {error ? (
            <p className="mt-6 text-sm text-danger">{error}</p>
          ) : null}
        </div>
      </div>

      <footer className="safe-pb shrink-0 px-6 pt-4 pb-7 sm:px-10 lg:px-14 lg:pb-10">
        <div className="flex flex-wrap items-center gap-3">
          {step > 1 ? (
            <button
              type="button"
              disabled={finishing}
              onClick={goBack}
              className={GHOST_BTN}
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            disabled={finishing}
            onClick={primaryAction}
            className={PRIMARY_BTN}
          >
            {finishing ? "Saving…" : primaryLabel}
          </button>
        </div>
      </footer>
    </section>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className={`kivo-onboarding-shell kivo-overlay-in fixed inset-0 z-[300] grid min-h-dvh grid-rows-[minmax(34vh,38vh)_minmax(0,1fr)] bg-app text-app lg:grid-rows-1 ${
        photoRight
          ? "lg:grid-cols-[minmax(28rem,0.9fr)_minmax(0,1.1fr)]"
          : "lg:grid-cols-[minmax(0,1.1fr)_minmax(28rem,0.9fr)]"
      }`}
    >
      {photo}
      {copy}
    </div>,
    document.body
  );
}
