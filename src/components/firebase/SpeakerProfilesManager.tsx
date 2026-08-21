"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MicPcmStreamer } from "@/lib/audio/mic-pcm-streamer";
import { SpeechmaticsLiveClient } from "@/lib/audio/speechmatics-client";
import {
  deleteSpeakerProfile,
  listSpeakerProfiles,
  patchSpeakerProfile,
  saveSpeakerProfile,
} from "@/lib/speakers/client";
import {
  ENROLLMENT_IDLE_HINT,
  ENROLLMENT_PASSES,
  type EnrollmentPass,
} from "@/lib/speakers/enrollment-script";
import { EnrollmentQualityTracker } from "@/lib/speakers/enrollment-quality";
import { MAX_STORED_SPEAKER_IDENTIFIERS } from "@/lib/speakers/identifier-cap";
import type { SpeakerProfileDoc } from "@/lib/speakers/types";
import { GrokSettingsButton } from "@/components/settings/SettingsRow";

const ENROLL_SECONDS = 15;
const COUNTDOWN_SECONDS = 3;
const ENROLL_PROCESSING_TIMEOUT_MS = 25_000;
const WAVEFORM_BARS = 28;
const MIN_ENROLL_PEAK_RMS = 0.012;
const ENROLL_TOO_LOUD_RMS = 0.45;
// Voiceprint size cap (established against match drift — see git history).
// Both passes must survive the cap so the stored voiceprint covers read and
// conversational speech, hence at most 2 identifiers per pass.
const MAX_IDENTIFIERS_PER_PASS = 2;

function combineIdentifierSets(sets: string[][]): string[] {
  return sets
    .flatMap((set) => set.slice(0, MAX_IDENTIFIERS_PER_PASS))
    .slice(0, MAX_STORED_SPEAKER_IDENTIFIERS);
}

type EnrollPhase =
  | "idle"
  | "countdown"
  | "recording"
  | "processing"
  | "success"
  | "error";

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

// Hue derived from name so each speaker has a consistent color across renders.
function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function rmsFromInt16(frame: Int16Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const v = frame[i]! / 0x8000;
    sum += v * v;
  }
  return Math.sqrt(sum / frame.length);
}

function recordingQualityHint(
  level: number,
  peak: number,
  secondsLeft: number,
  passIndex: number
): string | null {
  if (level >= ENROLL_TOO_LOUD_RMS) {
    return "A little softer — you're very close to the mic.";
  }
  // Avoid nagging on natural pauses: only nudge if we're past halfway and
  // we still haven't picked up any clear speech at all.
  if (secondsLeft <= 7 && peak < MIN_ENROLL_PEAK_RMS) {
    return passIndex === 0
      ? "Keep reading the script aloud — we haven't heard enough yet."
      : "Keep talking — we haven't heard enough yet.";
  }
  return null;
}

function EnrollmentScriptCard(props: {
  pass: EnrollmentPass;
  onboarding?: boolean;
}) {
  if (props.onboarding) {
    return (
      <div className="w-full rounded-2xl border border-app bg-surface/80 px-4 py-3.5 text-left">
        <p className="text-[11px] font-medium tracking-[0.06em] text-app-subtle uppercase">
          {props.pass.label}
        </p>
        <p className="mt-2 text-[14px] leading-[1.55] tracking-[-0.011em] text-app-secondary">
          {props.pass.script}
        </p>
      </div>
    );
  }

  return (
    <div className="grok-speaker-script-card w-full text-left">
      <p className="grok-speaker-script-label">{props.pass.label}</p>
      <p className="grok-speaker-script-body">{props.pass.script}</p>
    </div>
  );
}

// Flat circular-progress indicator — a single ring that fills as the
// recording elapses, replacing what used to be a glowing multicolor orb.
// Kept monochrome to match the rest of the settings surface; green/red are
// reserved for the same success/error semantics used elsewhere (see
// grok-connector-status-dot and --grok-danger-fg).
function EnrollmentOrb(props: {
  phase: EnrollPhase;
  level: number;
  countdown: number;
  secondsLeft: number;
  compact?: boolean;
}) {
  const { phase, level, countdown, secondsLeft, compact = false } = props;

  const size = compact ? 64 : 96;
  const stroke = compact ? 3 : 3.5;
  const radius = size / 2 - stroke * 2;
  const circumference = 2 * Math.PI * radius;

  const progress =
    phase === "countdown"
      ? (COUNTDOWN_SECONDS - countdown + 1) / COUNTDOWN_SECONDS
      : phase === "recording"
        ? (ENROLL_SECONDS - secondsLeft) / ENROLL_SECONDS
        : phase === "success" || phase === "error"
          ? 1
          : 0;

  const ringColor =
    phase === "success"
      ? "#4ade80"
      : phase === "error"
        ? "var(--grok-danger-fg)"
        : "var(--grok-fg)";

  const pulse = phase === "recording" ? 1 + Math.min(0.06, level * 0.3) : 1;

  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90 transition-transform duration-150 ease-out"
        style={{ transform: `rotate(-90deg) scale(${pulse})` }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--grok-border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-300 ease-linear"
        />
      </svg>

      <div className="relative z-10 flex items-center justify-center">
        {phase === "countdown" ? (
          <span
            key={countdown}
            className={`grok-speaker-orb-glyph font-medium ${compact ? "text-lg" : "text-2xl"}`}
          >
            {countdown}
          </span>
        ) : phase === "recording" ? (
          <span
            className={`grok-speaker-orb-glyph tabular-nums font-medium ${
              compact ? "text-base" : "text-xl"
            }`}
          >
            {secondsLeft}
          </span>
        ) : phase === "processing" ? (
          <span
            aria-hidden
            className={`animate-spin rounded-full border-2 border-current border-t-transparent opacity-60 ${
              compact ? "h-4 w-4" : "h-5 w-5"
            }`}
            style={{ color: "var(--grok-fg)" }}
          />
        ) : phase === "success" ? (
          <CheckIcon
            className={`text-[#4ade80] ${compact ? "h-5 w-5" : "h-6 w-6"}`}
          />
        ) : phase === "error" ? (
          <span
            className={`font-medium text-[color:var(--grok-danger-fg)] ${
              compact ? "text-lg" : "text-xl"
            }`}
          >
            !
          </span>
        ) : (
          <MicIcon
            className={`text-[color:var(--grok-muted)] ${compact ? "h-4 w-4" : "h-5 w-5"}`}
          />
        )}
      </div>
    </div>
  );
}

function Waveform(props: { levels: number[]; active: boolean; compact?: boolean }) {
  const compact = props.compact ?? false;
  const maxH = compact ? 20 : 36;
  const minH = compact ? 3 : 6;

  return (
    <div
      className={`flex items-center justify-center ${
        compact ? "h-5 gap-[2px]" : "h-9 gap-[3px]"
      }`}
    >
      {props.levels.map((v, i) => {
        const h = props.active ? Math.max(minH, Math.min(maxH, minH + v * (compact ? 55 : 90))) : minH;
        return (
          <span
            key={i}
            className={`rounded-full transition-[height,opacity] duration-100 ease-out ${
              compact ? "w-[2px]" : "w-[3px]"
            }`}
            style={{
              height: `${h}px`,
              background: "var(--grok-fg, currentColor)",
              opacity: props.active ? 0.35 + Math.min(0.5, v * 1.4) : 0.15,
            }}
          />
        );
      })}
    </div>
  );
}

function OnboardingEnrollmentSuccess(props: {
  name: string;
  note?: string | null;
}) {
  return (
    <div className="kivo-fade-in flex flex-col items-center gap-3 px-2 py-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-app">
        <CheckIcon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-medium tracking-[-0.01em] text-app">
          {props.name} enrolled
        </p>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-app-muted">
          {props.note ?? "Kivo will label your lines in the transcript."}
        </p>
      </div>
    </div>
  );
}

export function SpeakerProfilesManager(props: {
  embedded?: boolean;
  grok?: boolean;
  variant?: "settings" | "onboarding";
  /** Settings keeps the saved-speaker list; transcript tagging is how new voices are added. */
  allowEnrollment?: boolean;
  defaultName?: string;
  onEnrollmentSuccess?: () => void;
}) {
  const isOnboarding = props.variant === "onboarding";
  const embedded = Boolean(props.embedded || isOnboarding);
  const grok = Boolean(props.grok && !isOnboarding);
  const allowEnrollment = props.allowEnrollment ?? true;
  const [profiles, setProfiles] = useState<SpeakerProfileDoc[]>([]);
  const [name, setName] = useState(() => props.defaultName?.trim() ?? "");
  const [phase, setPhase] = useState<EnrollPhase>("idle");
  const [passIndex, setPassIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ENROLL_SECONDS);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [level, setLevel] = useState(0);
  const [qualityHint, setQualityHint] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<number[]>(() =>
    Array(WAVEFORM_BARS).fill(0)
  );

  const clientRef = useRef<SpeechmaticsLiveClient | null>(null);
  const micRef = useRef<MicPcmStreamer | null>(null);
  const requestTimerRef = useRef<number | null>(null);
  const processingTimeoutRef = useRef<number | null>(null);
  const countdownTickRef = useRef<number | null>(null);
  const recordTickRef = useRef<number | null>(null);
  const preTimerRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const waveformRef = useRef<number[]>(Array(WAVEFORM_BARS).fill(0));
  const rafRef = useRef<number | null>(null);
  const enrollmentAudioActiveRef = useRef(false);
  const enrollPeakRmsRef = useRef(0);
  const enrollmentQualityRef = useRef<EnrollmentQualityTracker | null>(null);
  // Identifier sets from completed passes (read-aloud first, then
  // conversational), combined into one profile at the end.
  const passIdentifiersRef = useRef<string[][]>([]);

  const refresh = useCallback(async () => {
    const next = await listSpeakerProfiles();
    setProfiles(next);
  }, []);

  useEffect(() => {
    const fallback = props.defaultName?.trim();
    if (!fallback) return;
    setName((current) => (current.trim() ? current : fallback));
  }, [props.defaultName]);

  useEffect(() => {
    if (isOnboarding && profiles.length > 0) {
      props.onEnrollmentSuccess?.();
    }
  }, [isOnboarding, profiles.length, props.onEnrollmentSuccess]);

  const clearTimers = useCallback(() => {
    if (requestTimerRef.current) {
      window.clearTimeout(requestTimerRef.current);
      requestTimerRef.current = null;
    }
    if (processingTimeoutRef.current) {
      window.clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    if (countdownTickRef.current) {
      window.clearInterval(countdownTickRef.current);
      countdownTickRef.current = null;
    }
    if (recordTickRef.current) {
      window.clearInterval(recordTickRef.current);
      recordTickRef.current = null;
    }
    if (preTimerRef.current) {
      window.clearInterval(preTimerRef.current);
      preTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const teardown = useCallback(async () => {
    clearTimers();
    await micRef.current?.stop();
    micRef.current = null;
    clientRef.current?.close();
    clientRef.current = null;
    enrollmentAudioActiveRef.current = false;
    enrollPeakRmsRef.current = 0;
    enrollmentQualityRef.current = null;
    levelRef.current = 0;
    waveformRef.current = Array(WAVEFORM_BARS).fill(0);
    setLevel(0);
    setQualityHint(null);
    setWaveform(Array(WAVEFORM_BARS).fill(0));
  }, [clearTimers]);

  const cancelEnrollment = useCallback(async () => {
    await teardown();
    passIdentifiersRef.current = [];
    setPhase("idle");
    setPassIndex(0);
    setSecondsLeft(ENROLL_SECONDS);
    setCountdown(COUNTDOWN_SECONDS);
  }, [teardown]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await listSpeakerProfiles();
        if (!cancelled) setProfiles(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load speakers.");
        }
      }
    })();
    return () => {
      cancelled = true;
      void teardown();
    };
  }, [teardown]);

  // Smoothly project the latest mic level into React state at ~30fps so the
  // orb scales but we don't thrash on every PCM frame.
  useEffect(() => {
    if (phase !== "recording") return;
    let last = 0;
    const tick = () => {
      const raw = levelRef.current;
      const smoothed = last * 0.7 + raw * 0.3;
      last = smoothed;
      setLevel(smoothed);
      setQualityHint(
        recordingQualityHint(
          smoothed,
          enrollPeakRmsRef.current,
          secondsLeft,
          passIndex
        )
      );
      setWaveform([...waveformRef.current]);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase, secondsLeft, passIndex]);

  const finishEnrollment = async (trimmed: string, note: string | null) => {
    await saveSpeakerProfile({
      name: trimmed,
      speakerIdentifiers: combineIdentifierSets(passIdentifiersRef.current),
      sampleCount: passIdentifiersRef.current.length,
    });
    passIdentifiersRef.current = [];
    setName("");
    setSavedName(trimmed);
    setSuccessNote(note);
    setPhase("success");
    await refresh();
    await teardown();
    props.onEnrollmentSuccess?.();
    if (!isOnboarding) {
      window.setTimeout(() => {
        setPhase("idle");
        setPassIndex(0);
        setSavedName(null);
        setSuccessNote(null);
        setSecondsLeft(ENROLL_SECONDS);
      }, 2400);
    }
  };

  // Keep any earlier clean pass in memory and retry only this pass. A
  // read-aloud-only identifier is not representative enough of live sessions
  // to save as a completed profile.
  const failPass = async (message: string) => {
    setError(message);
    setPhase("error");
    setQualityHint(null);
    await teardown();
  };

  const beginRecording = () => {
    setPhase("recording");
    setSecondsLeft(ENROLL_SECONDS);
    enrollmentAudioActiveRef.current = true;
    enrollPeakRmsRef.current = 0;
    enrollmentQualityRef.current = new EnrollmentQualityTracker();
    setQualityHint(null);

    recordTickRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (recordTickRef.current) {
            window.clearInterval(recordTickRef.current);
            recordTickRef.current = null;
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    requestTimerRef.current = window.setTimeout(() => {
      void (async () => {
        enrollmentAudioActiveRef.current = false;
        if (recordTickRef.current) {
          window.clearInterval(recordTickRef.current);
          recordTickRef.current = null;
        }
        await micRef.current?.stop();
        micRef.current = null;

        const quality = enrollmentQualityRef.current?.result();
        if (quality?.failure === "clipping") {
          await failPass(
            "That sample clipped. Move a little farther from the microphone and try this sample again."
          );
          return;
        }

        setPhase("processing");
        setQualityHint(null);

        const client = clientRef.current;
        if (!client) {
          await failPass("Enrollment connection was lost. Try again.");
          return;
        }

        processingTimeoutRef.current = window.setTimeout(() => {
          void failPass(
            "Creating your voice profile timed out. Try again in a quiet room."
          );
        }, ENROLL_PROCESSING_TIMEOUT_MS);

        client.sendEndOfStream();
      })();
    }, ENROLL_SECONDS * 1000);
  };

  const startPass = async (pass: number, trimmed: string): Promise<void> => {
    setPassIndex(pass);
    setPhase("countdown");
    setCountdown(COUNTDOWN_SECONDS);
    setSecondsLeft(ENROLL_SECONDS);
    levelRef.current = 0;
    waveformRef.current = Array(WAVEFORM_BARS).fill(0);
    enrollmentAudioActiveRef.current = false;

    let handled = false;
    const client = new SpeechmaticsLiveClient(
      {
        onOpen: () => {
          clientRef.current?.requestSpeakers({ final: true });
        },
        onClose: () => {
          // Wait for SpeakersResult or the processing timeout — do not reset UI here.
        },
        onError: (err) => {
          if (handled) return;
          handled = true;
          setError(err.message);
          setPhase("error");
          void teardown();
        },
        onUtterance: () => {},
        onUtteranceEnd: () => {},
        onSpeakersResult: (speakers) => {
          void (async () => {
            if (handled) return;
            handled = true;
            if (processingTimeoutRef.current) {
              window.clearTimeout(processingTimeoutRef.current);
              processingTimeoutRef.current = null;
            }
            if (
              speakers.length !== 1 ||
              speakers[0]!.speakerIdentifiers.length === 0
            ) {
              await failPass(
                "We couldn't detect a single clear voice. Try again in a quiet room, speaking naturally."
              );
              return;
            }
            passIdentifiersRef.current[pass] =
              speakers[0]!.speakerIdentifiers;
            // This pass's stream ended with EndOfStream; the next pass (or
            // nothing) gets a fresh connection.
            clientRef.current?.close();
            clientRef.current = null;
            if (pass + 1 < ENROLLMENT_PASSES.length) {
              await startPass(pass + 1, trimmed);
              return;
            }
            await finishEnrollment(trimmed, null);
          })().catch((err) => {
            setError(
              err instanceof Error ? err.message : "Failed to save speaker."
            );
            setPhase("error");
            void teardown();
          });
        },
      },
      [],
      { enrollment: true }
    );

    try {
      clientRef.current = client;
      await client.connect();
      const mic = new MicPcmStreamer({
        voiceIdentification: true,
        continuousEchoCancellation: true,
      });
      micRef.current = mic;
      await mic.start((frame) => {
        if (enrollmentAudioActiveRef.current) {
          client.sendPcm(frame);
          enrollmentQualityRef.current?.process(frame);
        }
        const rms = rmsFromInt16(frame);
        levelRef.current = rms;
        if (enrollmentAudioActiveRef.current) {
          enrollPeakRmsRef.current = Math.max(enrollPeakRmsRef.current, rms);
        }
        const next = waveformRef.current.slice(1);
        next.push(rms);
        waveformRef.current = next;
      });

      // Run the 3-2-1 countdown, then begin the actual recording window.
      preTimerRef.current = window.setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            if (preTimerRef.current) {
              window.clearInterval(preTimerRef.current);
              preTimerRef.current = null;
            }
            beginRecording();
            return 0;
          }
          return c - 1;
        });
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment failed.");
      setPhase("error");
      await teardown();
    }
  };

  const startEnrollment = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name before enrolling.");
      return;
    }

    setError(null);
    setSavedName(null);
    setSuccessNote(null);
    const retryPass = phase === "error" ? passIndex : 0;
    passIdentifiersRef.current =
      phase === "error"
        ? passIdentifiersRef.current.slice(0, retryPass)
        : [];
    await startPass(retryPass, trimmed);
  };

  const onRename = async (profile: SpeakerProfileDoc) => {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === profile.name) {
      setEditingId(null);
      return;
    }
    setError(null);
    try {
      await patchSpeakerProfile(profile.id, { name: trimmed });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    }
  };

  const onDelete = async (profile: SpeakerProfileDoc) => {
    setError(null);
    try {
      await deleteSpeakerProfile(profile.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const totalPasses = ENROLLMENT_PASSES.length;
  const passProgress = `sample ${passIndex + 1} of ${totalPasses}`;
  const statusLine =
    phase === "countdown"
      ? `Get ready to speak — ${passProgress}`
      : phase === "recording"
        ? qualityHint ??
          (passIndex === 0
            ? "Read the script below aloud"
            : "Just talk naturally — the prompt below has ideas")
        : phase === "processing"
          ? passIndex + 1 < totalPasses
            ? `Checking ${passProgress}…`
            : "Creating voice profile…"
          : phase === "success"
            ? successNote
              ? `${savedName ?? "Voice"} saved. ${successNote}`
              : `${savedName ?? "Voice"} saved — Kivo can recognize this speaker`
            : phase === "error"
              ? "Something went wrong"
              : "Ready to enroll";

  const compact = Boolean(embedded || grok);
  const enrolling =
    phase === "countdown" || phase === "recording" || phase === "processing";
  const showEnrollmentForm =
    phase === "idle" || phase === "error" || phase === "success";

  const statusClass =
    phase === "error"
      ? "text-danger"
      : phase === "success"
        ? "text-app"
        : "text-app-secondary";

  const onboardingEnrolledName =
    phase === "success"
      ? savedName
      : profiles.length > 0
        ? profiles[0]?.name ?? null
        : null;

  if (isOnboarding && onboardingEnrolledName && !enrolling) {
    return (
      <section>
        <OnboardingEnrollmentSuccess
          name={onboardingEnrolledName}
          note={phase === "success" ? successNote : null}
        />
      </section>
    );
  }

  return (
    <section
      className={
        embedded
          ? compact
            ? "space-y-5"
            : "space-y-6"
          : "space-y-4 border-t border-app pt-8"
      }
    >
      {isOnboarding ? null : !embedded ? (
        <div>
          <p className="text-[9px] tracking-[0.22em] text-app-subtle">SPEAKER MEMORY</p>
          <p className="mt-2 text-[11px] leading-snug text-app-subtle">
            Two short recordings per person — one read aloud, one just talking —
            so Kivo knows who is speaking. We store voice identifiers, not raw
            audio.
          </p>
        </div>
      ) : null}

      {allowEnrollment ? (
      <div className={grok ? "grok-speaker-enroll" : compact ? "" : ""}>
        {enrolling ? (
          <div
            className={
              isOnboarding || compact
                ? "onboarding-enroll-active mx-auto flex w-full max-w-sm flex-col items-center gap-5 py-2"
                : "flex flex-col items-center gap-4"
            }
          >
            <EnrollmentOrb
              compact={compact}
              phase={phase}
              level={level}
              countdown={countdown}
              secondsLeft={secondsLeft}
            />

            <Waveform
              compact={compact}
              levels={waveform}
              active={phase === "recording" || phase === "countdown"}
            />

            <p
              className={`text-center transition-colors ${
                isOnboarding ? "text-[13px] leading-relaxed" : compact ? "text-xs" : "text-sm"
              } ${phase === "recording" && qualityHint ? "text-amber-600 dark:text-amber-400" : statusClass}`}
            >
              {statusLine}
            </p>

            {phase === "countdown" || phase === "recording" ? (
              <div className="w-full max-w-sm">
                <EnrollmentScriptCard
                  pass={ENROLLMENT_PASSES[passIndex]!}
                  onboarding={isOnboarding}
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void cancelEnrollment()}
              className={
                isOnboarding
                  ? "text-[13px] text-app-muted underline-offset-4 transition-colors hover:text-app hover:underline"
                  : grok
                    ? "grok-settings-btn-ghost mt-1 text-xs"
                    : "text-xs font-normal text-app-muted underline-offset-4 transition-colors hover:text-app hover:underline"
              }
            >
              Cancel
            </button>
          </div>
        ) : isOnboarding ? (
          <div className="mx-auto w-full max-w-sm space-y-5 text-center">
            <ol className="m-0 list-none space-y-2.5 p-0 text-left">
              {[
                "Enter your name",
                "Read aloud for 15 seconds",
                "Talk naturally for 15 seconds",
              ].map((label, index) => (
                <li
                  key={label}
                  className="flex gap-3 text-[13px] leading-[1.55] text-app-muted"
                >
                  <span className="w-4 shrink-0 text-center text-[11px] font-medium text-app-subtle">
                    {index + 1}
                  </span>
                  <span>{label}</span>
                </li>
              ))}
            </ol>

            <input
              id="speaker-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              className="w-full rounded-2xl border border-app bg-app px-4 py-3 text-center text-sm tracking-[-0.011em] text-app outline-none transition-colors placeholder:text-app-subtle focus:border-app-strong"
            />

            {phase === "error" && error ? (
              <p className="text-[13px] text-danger">{error}</p>
            ) : null}

            <button
              type="button"
              onClick={() => void startEnrollment()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[13px] font-medium tracking-[0.02em] text-accent-fg transition-[opacity,transform] duration-150 hover:opacity-90 active:translate-y-px disabled:opacity-40"
            >
              <MicIcon className="h-4 w-4" />
              {phase === "error" ? "Try again" : "Start enrollment"}
            </button>

            <p className="text-[12px] leading-relaxed text-app-subtle">
              Both clean samples are required. We store voice identifiers, not
              audio.
            </p>
          </div>
        ) : (
          <div
            className={
              compact
                ? "grok-speaker-enroll-idle space-y-3"
                : "rounded-xl border border-app bg-app/20 px-4 py-4"
            }
          >
            {showEnrollmentForm ? (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="speaker-name"
                    className="mb-1.5 block text-xs text-app-muted"
                  >
                    Speaker name
                  </label>
                  <input
                    id="speaker-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Alex"
                    className={
                      grok
                        ? "grok-settings-input"
                        : "w-full rounded-lg border border-app bg-surface px-3 py-2.5 text-sm text-app outline-none focus:border-app-strong"
                    }
                  />
                </div>
                {phase === "error" && error ? (
                  <p className="text-xs text-danger">{error}</p>
                ) : phase === "success" ? (
                  <p className={`text-sm ${statusClass}`}>{statusLine}</p>
                ) : (
                  <p className="text-xs leading-relaxed text-app-subtle">
                    {ENROLLMENT_IDLE_HINT}
                  </p>
                )}
                {grok ? (
                  <GrokSettingsButton
                    variant="primary"
                    onClick={() => void startEnrollment()}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <MicIcon className="h-3.5 w-3.5" />
                      {phase === "error" ? "Try again" : "Enroll voice"}
                    </span>
                  </GrokSettingsButton>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startEnrollment()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm text-accent-fg transition-opacity hover:opacity-90"
                  >
                    <MicIcon className="h-4 w-4" />
                    {phase === "error" ? "Try again" : "Enroll voice"}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
      ) : null}

      {error && phase !== "error" ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {!enrolling && !isOnboarding && (profiles.length > 0 || !allowEnrollment) ? (
      <div className={`space-y-2 ${allowEnrollment ? (compact ? "mt-6" : "mt-4") : ""}`}>
        <div className="flex items-center justify-between px-0.5">
          <p
            className={
              grok
                ? "grok-connector-group-label"
                : "text-xs text-app-muted"
            }
          >
            Known speakers
          </p>
          <p className="text-xs text-app-subtle">
            {profiles.length} {profiles.length === 1 ? "speaker" : "speakers"}
          </p>
        </div>

        {profiles.length > 0 ? (
          <ul
            className={
              grok
                ? "grok-speaker-list"
                : "divide-y divide-app rounded-xl border border-app"
            }
          >
            {profiles.map((profile, index) => {
              const editing = editingId === profile.id;
              const hue = avatarHue(profile.name);
              const isLast = index === profiles.length - 1;
              return (
                <li
                  key={profile.id}
                  className={
                    grok
                      ? `group flex items-center gap-3 py-2.5${
                          isLast ? "" : " grok-speaker-list-item--divided"
                        }`
                      : "group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover/50"
                  }
                >
                  <span
                    aria-hidden
                    className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${
                      grok ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${(hue + 40) % 360} 65% 45%))`,
                    }}
                  >
                    {avatarInitials(profile.name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void onRename(profile);
                          if (event.key === "Escape") setEditingId(null);
                        }}
                        onBlur={() => void onRename(profile)}
                        className="w-full rounded-[var(--grok-radius-control,10px)] border border-app bg-app px-2 py-1 text-sm text-app outline-none"
                      />
                    ) : (
                      <>
                        <p className="truncate text-sm font-normal text-app">
                          {profile.name}
                        </p>
                        <p className="text-xs text-app-muted">Known speaker</p>
                      </>
                    )}
                  </div>

                  {!editing && !isOnboarding ? (
                    <div className="flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                      <button
                        type="button"
                        aria-label={`Rename ${profile.name}`}
                        onClick={() => {
                          setEditingId(profile.id);
                          setEditingName(profile.name);
                        }}
                        className="rounded-[var(--grok-radius-control,8px)] p-2 text-app-muted transition-colors hover:bg-surface hover:text-app lg:p-1.5"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${profile.name}`}
                        onClick={() => void onDelete(profile)}
                        className="rounded-[var(--grok-radius-control,8px)] p-2 text-app-muted transition-colors hover:bg-danger/10 hover:text-danger lg:p-1.5"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <div
            className={
              grok
                ? "py-3 text-center"
                : "rounded-xl border border-dashed border-app bg-app/30 px-4 py-6 text-center"
            }
          >
            <p className="text-sm text-app-muted">No named speakers yet.</p>
            <p className="mt-1 text-xs text-app-subtle">
              After a session, open Transcript and name an Other speaker.
            </p>
          </div>
        )}
      </div>
      ) : null}

    </section>
  );
}
