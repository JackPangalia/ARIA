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
const MAX_PROFILE_IDENTIFIERS = 3;
const MAX_IDENTIFIERS_PER_PASS = 2;

function combineIdentifierSets(sets: string[][]): string[] {
  return sets
    .flatMap((set) => set.slice(0, MAX_IDENTIFIERS_PER_PASS))
    .slice(0, MAX_PROFILE_IDENTIFIERS);
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

function EnrollmentScriptCard({ pass }: { pass: EnrollmentPass }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-app/60 bg-surface/50 px-4 py-3.5 text-left shadow-sm">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-accent/50 to-accent/10"
      />
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-app-muted">
        {pass.label}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-app-secondary">
        {pass.script}
      </p>
    </div>
  );
}

function EnrollmentOrb(props: {
  phase: EnrollPhase;
  level: number;
  countdown: number;
  secondsLeft: number;
  compact?: boolean;
}) {
  const { phase, level, countdown, secondsLeft, compact = false } = props;

  const scale =
    phase === "recording"
      ? 1 + Math.min(0.35, level * 1.8)
      : phase === "success"
        ? 1.04
        : phase === "processing"
          ? 1
          : 1;

  const ringOpacity =
    phase === "recording" ? Math.min(0.85, 0.28 + level * 2.2) : 0.35;

  const palette =
    phase === "success"
      ? ["#10b981", "#34d399"]
      : phase === "error"
        ? ["#ef4444", "#f87171"]
        : phase === "processing"
          ? ["#3b82f6", "#8b5cf6"]
          : phase === "recording"
            ? ["#10b981", "#22d3ee"]
            : phase === "countdown"
              ? ["#f59e0b", "#fbbf24"]
              : ["#71717a", "#a1a1aa"];

  const shell = compact ? "h-[4.5rem] w-[4.5rem]" : "h-32 w-32";
  const orb = compact ? "h-[3.25rem] w-[3.25rem]" : "h-24 w-24";
  const inner = compact ? "h-[3.25rem] w-[3.25rem]" : "h-24 w-24";

  return (
    <div className={`relative flex shrink-0 items-center justify-center ${shell}`}>
      <div
        aria-hidden
        className={`absolute inset-0 rounded-full transition-opacity duration-200 ${
          phase === "recording" ? "animate-pulse" : ""
        }`}
        style={{
          opacity: ringOpacity,
          background: `radial-gradient(circle at 50% 50%, ${palette[0]}66 0%, transparent 70%)`,
        }}
      />
      <div
        aria-hidden
        className={`absolute rounded-full transition-transform duration-100 ease-out ${orb}`}
        style={{
          transform: `scale(${scale})`,
          background: `radial-gradient(circle at 35% 30%, ${palette[1]} 0%, ${palette[0]} 70%)`,
          boxShadow: compact
            ? `0 0 16px ${palette[0]}44, inset 0 0 12px ${palette[1]}88`
            : `0 0 30px ${palette[0]}55, inset 0 0 20px ${palette[1]}aa`,
        }}
      />
      <div className={`relative z-10 flex items-center justify-center ${inner}`}>
        {phase === "countdown" ? (
          <span
            key={countdown}
            className={`font-light text-white drop-shadow-md ${
              compact ? "text-xl" : "text-3xl"
            }`}
            style={{ animation: "speaker-pop 0.6s ease-out" }}
          >
            {countdown}
          </span>
        ) : phase === "recording" ? (
          <span
            className={`tabular-nums font-light text-white drop-shadow-md ${
              compact ? "text-lg" : "text-2xl"
            }`}
          >
            {secondsLeft}
          </span>
        ) : phase === "processing" ? (
          <span
            aria-hidden
            className={`animate-spin rounded-full border-2 border-white/30 border-t-white ${
              compact ? "h-4 w-4" : "h-6 w-6"
            }`}
          />
        ) : phase === "success" ? (
          <CheckIcon className={compact ? "h-5 w-5 text-white" : "h-8 w-8 text-white"} />
        ) : phase === "error" ? (
          <span className={`font-light text-white ${compact ? "text-lg" : "text-2xl"}`}>
            !
          </span>
        ) : (
          <MicIcon className={compact ? "h-5 w-5 text-white" : "h-7 w-7 text-white"} />
        )}
      </div>

      <style jsx>{`
        @keyframes speaker-pop {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          50% {
            opacity: 1;
            transform: scale(1.15);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

function Waveform(props: { levels: number[]; active: boolean; compact?: boolean }) {
  const compact = props.compact ?? false;
  const maxH = compact ? 22 : 40;
  const minH = compact ? 4 : 8;

  return (
    <div
      className={`flex items-center justify-center ${
        compact ? "h-6 gap-[2px]" : "h-10 gap-[3px]"
      }`}
    >
      {props.levels.map((v, i) => {
        const h = props.active ? Math.max(minH, Math.min(maxH, minH + v * (compact ? 55 : 90))) : minH;
        return (
          <span
            key={i}
            className={`rounded-full bg-accent transition-[height,opacity] duration-100 ease-out ${
              compact ? "w-[2px]" : "w-[3px]"
            }`}
            style={{
              height: `${h}px`,
              opacity: props.active ? 0.45 + Math.min(0.55, v * 1.5) : 0.2,
            }}
          />
        );
      })}
    </div>
  );
}

export function SpeakerProfilesManager(props: { embedded?: boolean; grok?: boolean }) {
  const [profiles, setProfiles] = useState<SpeakerProfileDoc[]>([]);
  const [name, setName] = useState("");
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
  // Identifier sets from completed passes (read-aloud first, then
  // conversational), combined into one profile at the end.
  const passIdentifiersRef = useRef<string[][]>([]);

  const refresh = useCallback(async () => {
    const next = await listSpeakerProfiles();
    setProfiles(next);
  }, []);

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
    window.setTimeout(() => {
      setPhase("idle");
      setPassIndex(0);
      setSavedName(null);
      setSuccessNote(null);
      setSecondsLeft(ENROLL_SECONDS);
    }, 2400);
  };

  // A failed later pass must not discard an earlier good sample: save what we
  // have (the read-aloud pass alone is still a working voiceprint) instead of
  // dead-ending the whole enrollment.
  const failPassOrFallback = async (trimmed: string, message: string) => {
    if (passIdentifiersRef.current.length > 0) {
      try {
        await finishEnrollment(
          trimmed,
          "Only the read-aloud sample was captured — re-enroll anytime to improve matching."
        );
        return;
      } catch {
        // Saving the partial profile failed too — surface the original error.
      }
    }
    setError(message);
    setPhase("error");
    setQualityHint(null);
    await teardown();
  };

  const beginRecording = (pass: number, trimmed: string) => {
    setPhase("recording");
    setSecondsLeft(ENROLL_SECONDS);
    enrollmentAudioActiveRef.current = true;
    enrollPeakRmsRef.current = 0;
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

        if (enrollPeakRmsRef.current < MIN_ENROLL_PEAK_RMS) {
          await failPassOrFallback(
            trimmed,
            "We didn't hear enough. Try again in a quiet room, speaking clearly for the full recording."
          );
          return;
        }

        setPhase("processing");
        setQualityHint(null);

        const client = clientRef.current;
        if (!client) {
          await failPassOrFallback(
            trimmed,
            "Enrollment connection was lost. Try again."
          );
          return;
        }

        processingTimeoutRef.current = window.setTimeout(() => {
          void failPassOrFallback(
            trimmed,
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
              await failPassOrFallback(
                trimmed,
                "We couldn't detect a single clear voice. Try again in a quiet room, speaking naturally."
              );
              return;
            }
            passIdentifiersRef.current.push(speakers[0]!.speakerIdentifiers);
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
      const mic = new MicPcmStreamer({ voiceIdentification: true });
      micRef.current = mic;
      await mic.start((frame) => {
        if (enrollmentAudioActiveRef.current) {
          client.sendPcm(frame);
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
            beginRecording(pass, trimmed);
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
    passIdentifiersRef.current = [];
    await startPass(0, trimmed);
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

  const compact = Boolean(props.embedded || props.grok);
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

  return (
    <section
      className={
        props.embedded
          ? compact
            ? "space-y-5"
            : "space-y-6"
          : "space-y-4 border-t border-app pt-8"
      }
    >
      {!props.embedded ? (
        <div>
          <p className="text-[9px] tracking-[0.22em] text-app-subtle">SPEAKER MEMORY</p>
          <p className="mt-2 text-[11px] leading-snug text-app-subtle">
            Two short recordings per person — one read aloud, one just talking —
            so Kivo knows who is speaking. We store voice identifiers, not raw
            audio.
          </p>
        </div>
      ) : null}

      <div className={props.grok ? "grok-speaker-enroll" : compact ? "" : ""}>
        {enrolling ? (
          <div
            className={
              compact
                ? "mx-auto flex w-full max-w-md flex-col items-center gap-3 py-1"
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
                compact ? "text-xs" : "text-sm"
              } ${phase === "recording" && qualityHint ? "text-amber-600 dark:text-amber-400" : statusClass}`}
            >
              {statusLine}
            </p>

            {phase === "countdown" || phase === "recording" ? (
              <EnrollmentScriptCard pass={ENROLLMENT_PASSES[passIndex]!} />
            ) : null}

            <button
              type="button"
              onClick={() => void cancelEnrollment()}
              className="text-xs font-normal text-app-muted underline-offset-4 transition-colors hover:text-app hover:underline"
            >
              Cancel
            </button>
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
                      props.grok
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
                {props.grok ? (
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

      {error && phase !== "error" ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {!enrolling ? (
      <div className={`space-y-2 ${compact ? "mt-6" : "mt-4"}`}>
        <div className="flex items-center justify-between px-0.5">
          <p
            className={
              props.grok
                ? "grok-connector-group-label"
                : "text-xs text-app-muted"
            }
          >
            Enrolled
          </p>
          <p className="text-xs text-app-subtle">
            {profiles.length} {profiles.length === 1 ? "voice" : "voices"}
          </p>
        </div>

        {profiles.length > 0 ? (
          <ul
            className={
              props.grok
                ? "grok-speaker-list space-y-1"
                : "divide-y divide-app rounded-xl border border-app"
            }
          >
            {profiles.map((profile) => {
              const editing = editingId === profile.id;
              const hue = avatarHue(profile.name);
              return (
                <li
                  key={profile.id}
                  className={
                    props.grok
                      ? "group flex items-center gap-3 py-2"
                      : "group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover/50"
                  }
                >
                  <span
                    aria-hidden
                    className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${
                      props.grok ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"
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
                        <p className="text-xs text-app-muted">Voice enrolled</p>
                      </>
                    )}
                  </div>

                  {!editing ? (
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
              props.grok
                ? "py-3 text-center"
                : "rounded-xl border border-dashed border-app bg-app/30 px-4 py-6 text-center"
            }
          >
            <p className="text-sm text-app-muted">No voices enrolled yet.</p>
            {!props.grok ? (
              <p className="mt-1 text-xs text-app-subtle">
                Add one above so Kivo can recognize who&apos;s speaking.
              </p>
            ) : null}
          </div>
        )}
      </div>
      ) : null}

    </section>
  );
}
