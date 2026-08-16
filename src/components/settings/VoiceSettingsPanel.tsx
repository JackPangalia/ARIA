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

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3 w-3 translate-x-px"
    >
      <path d="M4.5 2.8c0-.7.8-1.2 1.4-.8l8 4.7c.6.3.6 1.2 0 1.6l-8 4.7c-.6.4-1.4-.1-1.4-.8V2.8Z" />
    </svg>
  );
}

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
    <section className={isOnboarding ? "" : "mb-7"}>
      {!isOnboarding ? (
        <p className="kivo-settings-group-label">Voice</p>
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

      {isOnboarding ? (
        <div className="mt-1 space-y-1">
          {voices.map((voice) => (
            <GrokSettingsRow
              key={voice.id}
              title={<span className="font-medium">{voice.label}</span>}
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
      ) : (
        <div className="kivo-settings-card">
          {voices.map((voice, index) => {
            const selected = prefs?.current.voiceId === voice.id;
            const isLast = index === voices.length - 1;
            return (
              <div
                key={voice.id}
                className={`kivo-settings-card-row${isLast ? " kivo-settings-card-row--last" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="kivo-settings-row-title">{voice.label}</div>
                  <div className="kivo-settings-row-desc">{voice.description}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {busyVoice === voice.id ? (
                    <span className="text-xs text-app-muted">Saving…</span>
                  ) : selected ? (
                    <span className="grok-current-badge">Current</span>
                  ) : (
                    <GrokSettingsButton
                      disabled={!prefs || busyVoice !== null}
                      onClick={() => void selectVoice(voice.id)}
                    >
                      Use this
                    </GrokSettingsButton>
                  )}
                  <button
                    type="button"
                    className="grok-icon-btn"
                    data-active={previewing === voice.id}
                    aria-label={`Preview ${voice.label}`}
                    disabled={!prefs || previewing !== null}
                    onClick={() => void playPreview(voice.id)}
                  >
                    <PlayIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </section>
  );
}
