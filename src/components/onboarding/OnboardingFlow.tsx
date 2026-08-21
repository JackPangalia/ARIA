"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SpeakerProfilesManager } from "@/components/firebase/SpeakerProfilesManager";
import { VoiceSettingsPanel } from "@/components/settings/VoiceSettingsPanel";
import { OnboardingGuide } from "@/components/onboarding/OnboardingGuide";
import { completeOnboarding } from "@/lib/onboarding/client";
import { useAuth } from "@/components/firebase/AuthProvider";

const TOTAL_STEPS = 5;

type OnboardingFlowProps = {
  onComplete: () => void;
  /** Dev preview — skip persisting onboarding completion. */
  preview?: boolean;
};

const PRIMARY_BTN =
  "inline-flex min-w-[9.5rem] items-center justify-center rounded-full bg-accent px-8 py-2.5 text-[13px] font-medium tracking-[0.02em] text-accent-fg transition-[opacity,transform] duration-150 hover:opacity-90 active:translate-y-px disabled:pointer-events-none disabled:opacity-40";

const GHOST_BTN =
  "rounded-full px-5 py-2.5 text-[13px] font-medium text-app-muted transition-colors duration-150 hover:bg-surface hover:text-app disabled:opacity-40";

function KivoWordmark() {
  return (
    <p className="kivo-wordmark select-none text-center text-app-muted">
      Kivo
    </p>
  );
}

function ProgressRail({ step }: { step: number }) {
  return (
    <div
      className="mx-auto flex w-full max-w-[10rem] items-center gap-1.5"
      aria-hidden
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const n = i + 1;
        const filled = n <= step;
        return (
          <span
            key={n}
            className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
              filled ? "bg-app" : "bg-surface-strong"
            }`}
          />
        );
      })}
    </div>
  );
}

function OnboardingStepHeader(props: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <h1
        id="onboarding-title"
        className="kivo-display max-w-sm text-[1.75rem] text-app sm:text-[2rem]"
      >
        {props.title}
      </h1>
      {props.description ? (
        <p className="mt-3 max-w-sm text-[15px] leading-[1.55] tracking-[-0.011em] text-app-secondary sm:text-base">
          {props.description}
        </p>
      ) : null}
    </div>
  );
}

export function OnboardingFlow({ onComplete, preview = false }: OnboardingFlowProps) {
  const { user } = useAuth();
  const defaultSpeakerName =
    user?.displayName?.trim().split(/\s+/)[0] ??
    user?.email?.split("@")[0] ??
    "";
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [speakerDone, setSpeakerDone] = useState(false);
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

  const skipSpeaker = useCallback(() => {
    setSpeakerDone(true);
    goNext();
  }, [goNext]);

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

  const isSpeakerStep = step === 4;
  const primaryLabel = step === TOTAL_STEPS ? "Get started" : "Continue";
  const primaryAction =
    step === TOTAL_STEPS ? () => void finish() : goNext;
  const primaryDisabled =
    finishing || (isSpeakerStep && !speakerDone);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="kivo-overlay-in fixed inset-0 z-[300] flex flex-col bg-app text-app"
    >
      <div className="safe-pt flex shrink-0 flex-col items-center gap-5 px-6 pb-2 pt-5">
        <KivoWordmark />
        {step > 1 ? (
          <div className="w-full">
            <ProgressRail step={step} />
            <p className="kivo-kicker mt-3 text-center">
              {step} of {TOTAL_STEPS}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <div key={step} className="kivo-fade-in w-full max-w-lg">
          {step === 1 ? (
            <div className="kivo-stagger flex flex-col items-center px-2 py-4 text-center sm:py-8">
              <div className="flex max-w-sm flex-col items-center">
                <h1
                  id="onboarding-title"
                  className="kivo-display text-[2.25rem] text-app sm:text-[2.75rem]"
                >
                  Welcome
                </h1>
                <p className="mt-4 text-[15px] leading-[1.55] tracking-[-0.011em] text-app-secondary sm:text-base">
                  Kivo listens to the conversation, understands who&apos;s
                  speaking, and answers out loud when you ask.
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-app-subtle">
                  A minute to get set up.
                </p>
              </div>

              <button
                type="button"
                disabled={finishing}
                onClick={goNext}
                className={`mt-12 sm:mt-14 ${PRIMARY_BTN}`}
              >
                Continue
              </button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col items-center">
              <OnboardingStepHeader
                title="Appearance"
                description="Choose how Kivo looks on this device."
              />
              <div className="mt-10 w-full max-w-xs grok-settings-embedded">
                <ThemeToggle variant="settings" />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-col items-center">
              <OnboardingStepHeader
                title="Voice"
                description="Pick the voice Kivo uses when it answers you."
              />
              <div className="mt-8 w-full max-h-[min(50vh,420px)] overflow-y-auto pr-1 grok-settings-embedded">
                <VoiceSettingsPanel variant="onboarding" />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="flex flex-col items-center">
              <OnboardingStepHeader
                title="Your voice"
                description="Two quick recordings so Kivo knows who's speaking."
              />
              <div className="mt-8 w-full max-w-sm">
                <SpeakerProfilesManager
                  variant="onboarding"
                  defaultName={defaultSpeakerName}
                  onEnrollmentSuccess={() => setSpeakerDone(true)}
                />
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="flex flex-col items-center">
              <OnboardingStepHeader
                title="How Kivo works"
                description="One loop — listen, ask, answer, wrap up."
              />
              <div className="mt-10 w-full">
                <OnboardingGuide />
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-6 text-center text-sm text-danger">{error}</p>
          ) : null}
        </div>
      </div>

      {step > 1 ? (
        <div className="safe-pb shrink-0 bg-gradient-to-t from-app via-app to-transparent px-6 pt-6 pb-5">
          <div className="mx-auto flex w-full max-w-lg flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={finishing}
              onClick={goBack}
              className={GHOST_BTN}
            >
              Back
            </button>
            {isSpeakerStep && !speakerDone ? (
              <button
                type="button"
                disabled={finishing}
                onClick={skipSpeaker}
                className="rounded-full px-4 py-2.5 text-[13px] font-medium text-app-subtle underline-offset-4 transition-colors duration-150 hover:text-app hover:underline disabled:opacity-40"
              >
                Skip for now
              </button>
            ) : null}
            <button
              type="button"
              disabled={primaryDisabled}
              onClick={primaryAction}
              className={PRIMARY_BTN}
            >
              {finishing ? "Saving…" : primaryLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
