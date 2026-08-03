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

function KivoWordmark() {
  return (
    <p className="select-none text-center text-xs font-medium tracking-[0.55em] text-app-secondary">
      KIVO
    </p>
  );
}

function OnboardingStepHeader(props: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <h1
        id="onboarding-title"
        className="font-sans text-[1.75rem] font-normal leading-[1.1] tracking-[-0.02em] text-app sm:text-[2rem]"
      >
        {props.title}
      </h1>
      {props.description ? (
        <p className="mt-3 max-w-sm text-[15px] leading-[1.65] text-app-muted sm:text-base sm:leading-[1.7]">
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

  const primaryButtonClass =
    "min-w-[9.5rem] rounded-full bg-accent px-8 py-2.5 text-[13px] font-medium tracking-[0.04em] text-accent-fg transition-opacity disabled:opacity-40";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[300] flex flex-col bg-app text-app"
    >
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-lg">
          {step > 1 ? (
            <p className="text-center text-[10px] font-normal uppercase tracking-[0.55em] text-app-muted">
              Step {step} of {TOTAL_STEPS}
            </p>
          ) : null}

          {step === 1 ? (
            <div className="flex flex-col items-center px-2 py-6 text-center sm:py-10">
              <KivoWordmark />

              <div className="mt-16 flex max-w-xs flex-col items-center sm:mt-20 sm:max-w-sm">
                <h1
                  id="onboarding-title"
                  className="font-sans text-[2rem] font-normal leading-[1.08] tracking-[-0.03em] text-app sm:text-[2.5rem]"
                >
                  Welcome
                </h1>
                <p className="mt-4 text-[15px] leading-[1.65] text-app-muted sm:text-base sm:leading-[1.7]">
                  Kivo listens to the room, and answers out loud when you ask.
                  Let&apos;s get you set up in a minute.
                </p>
              </div>

              <button
                type="button"
                disabled={finishing}
                onClick={goNext}
                className={`mt-12 sm:mt-14 ${primaryButtonClass}`}
              >
                Continue
              </button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-10 flex flex-col items-center">
              <OnboardingStepHeader
                title="Appearance"
                description="Choose how Kivo looks on this device."
              />
              <div className="mt-8 w-full max-w-xs grok-settings-embedded">
                <ThemeToggle variant="settings" />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mt-10 flex flex-col items-center">
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
            <div className="mt-10 flex flex-col items-center">
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
            <div className="mt-10 flex flex-col items-center">
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
        <div className="border-t border-app bg-app px-6 py-5">
          <div className="mx-auto flex w-full max-w-lg flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={finishing}
              onClick={goBack}
              className="rounded-full px-5 py-2.5 text-[13px] text-app-muted transition-colors hover:text-app disabled:opacity-40"
            >
              Back
            </button>
            {isSpeakerStep && !speakerDone ? (
              <button
                type="button"
                disabled={finishing}
                onClick={skipSpeaker}
                className="rounded-full px-3 py-2.5 text-[13px] text-app-muted underline-offset-4 transition-colors hover:text-app hover:underline disabled:opacity-40"
              >
                Skip for now
              </button>
            ) : null}
            <button
              type="button"
              disabled={primaryDisabled}
              onClick={primaryAction}
              className={primaryButtonClass}
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
