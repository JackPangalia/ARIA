"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchVoicePreview,
  getVoiceSettings,
  updateVoiceSettings,
  type VoiceSettingsPreference,
} from "@/lib/plan/client";
import {
  GrokSettingsButton,
  GrokSettingsRow,
} from "@/components/settings/SettingsRow";

type VoiceSettingsPanelProps = {
  variant?: "settings" | "onboarding";
};

export function VoiceSettingsPanel({ variant = "settings" }: VoiceSettingsPanelProps) {
  const [prefs, setPrefs] = useState<VoiceSettingsPreference | null>(null);
  const [busyVoice, setBusyVoice] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const isOnboarding = variant === "onboarding";

  useEffect(() => {
    let cancelled = false;
    void getVoiceSettings()
      .then((data) => {
        if (!cancelled) setPrefs(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load voice settings."
          );
        }
      });
    return () => {
      cancelled = true;
      previewAudioRef.current?.pause();
    };
  }, []);

  const selectVoice = async (voiceId: string) => {
    if (!prefs || prefs.current.voiceId === voiceId) return;
    setBusyVoice(voiceId);
    setError(null);
    try {
      setPrefs(await updateVoiceSettings({ voiceId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update voice.");
    } finally {
      setBusyVoice(null);
    }
  };

  const playPreview = async (voiceId: string) => {
    if (!prefs || previewing) return;
    setPreviewing(voiceId);
    setError(null);
    try {
      const buf = await fetchVoicePreview({ voiceId });
      previewAudioRef.current?.pause();
      const url = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      const revoke = () => URL.revokeObjectURL(url);
      audio.onended = revoke;
      audio.onerror = revoke;
      await audio.play();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not play the preview."
      );
    } finally {
      setPreviewing(null);
    }
  };

  const voices = prefs?.voices ?? [];

  return (
    <section className={isOnboarding ? "" : "mt-8"}>
      {!isOnboarding ? (
        <>
          <p className="grok-settings-section-title">Voice</p>
          <p className="grok-settings-section-desc">
            Pick the voice Kivo answers with. Preview plays a short sample.
          </p>
        </>
      ) : null}

      {error ? (
        <p
          className={
            isOnboarding
              ? "mt-2 text-xs text-danger"
              : "grok-settings-delete-error mt-2 text-xs"
          }
        >
          {error}
        </p>
      ) : null}

      <div className={isOnboarding ? "mt-1 space-y-1" : "mt-2"}>
        {voices.map((voice) => (
          <GrokSettingsRow
            key={voice.id}
            title={<span className="font-medium">{voice.label}</span>}
            description={isOnboarding ? undefined : voice.description}
            action={
              <span className="flex items-center gap-2">
                <GrokSettingsButton
                  disabled={!prefs || previewing !== null}
                  onClick={() => void playPreview(voice.id)}
                >
                  {previewing === voice.id ? "Playing…" : "Preview"}
                </GrokSettingsButton>
                <GrokSettingsButton
                  disabled={
                    !prefs ||
                    prefs.current.voiceId === voice.id ||
                    busyVoice !== null
                  }
                  onClick={() => void selectVoice(voice.id)}
                >
                  {busyVoice === voice.id
                    ? "Saving…"
                    : prefs?.current.voiceId === voice.id
                      ? "Current"
                      : "Use this"}
                </GrokSettingsButton>
              </span>
            }
          />
        ))}
      </div>

    </section>
  );
}
