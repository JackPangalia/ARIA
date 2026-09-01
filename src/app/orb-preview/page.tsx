"use client";

import { useEffect, useState } from "react";
import { GlowOrb } from "@/components/aria/GlowOrb";
import type { Mode } from "@/components/aria/visual-state";
import {
  ORB_BODIES,
  ORB_BODY_LABELS,
  type OrbBody,
} from "@/lib/orb/orb-body";

const MODES: { mode: Mode; label: string; mic: number; play: number }[] = [
  { mode: "idle", label: "Idle", mic: 0, play: 0 },
  { mode: "listen", label: "Listen", mic: 0.45, play: 0 },
  { mode: "wake", label: "Question", mic: 0.55, play: 0 },
  { mode: "followup", label: "Follow-up", mic: 0.35, play: 0 },
  { mode: "think", label: "Think", mic: 0, play: 0 },
  { mode: "search", label: "Search", mic: 0, play: 0 },
  { mode: "speak", label: "Speak", mic: 0, play: 0.55 },
];

function OrbFrame({
  body,
  mode,
  label,
  mic,
  play,
  still = false,
  large = false,
}: {
  body: OrbBody;
  mode: Mode;
  label: string;
  mic: number;
  play: number;
  still?: boolean;
  large?: boolean;
}) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div
        className={
          large
            ? "relative aspect-square w-[min(16.5rem,50vmin)] max-sm:w-[min(14.5rem,70vw)]"
            : "relative aspect-square w-[min(9rem,28vw)]"
        }
      >
        <GlowOrb
          mode={mode}
          body={body}
          previewMic={mic}
          previewPlayback={play}
          still={still}
          compact={!large}
        />
      </div>
      <figcaption className="text-sm text-app-muted">{label}</figcaption>
    </figure>
  );
}

export default function OrbPreviewPage() {
  const [body, setBody] = useState<OrbBody>("cream");
  const [live, setLive] = useState<(typeof MODES)[number]>(MODES[0]!);
  const [wave, setWave] = useState(0.4);

  useEffect(() => {
    let frame = 0;
    let start = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const t = (now - start) / 1000;
      setWave(0.22 + 0.38 * (0.5 + 0.5 * Math.sin(t * 1.6)));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const liveMic =
    live.mode === "listen" || live.mode === "wake" || live.mode === "followup"
      ? wave
      : live.mic;
  const livePlay = live.mode === "speak" ? wave : live.play;

  return (
    <main className="min-h-dvh bg-app px-6 py-10 text-app">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-2">
          <p className="text-sm text-app-muted">Component preview · session orb</p>
          <h1 className="font-serif text-3xl">Orb skins</h1>
        </header>

        <section className="flex flex-col items-center gap-6">
          <OrbFrame
            large
            body={body}
            mode={live.mode}
            label={`${ORB_BODY_LABELS[body]} · ${live.label}`}
            mic={liveMic}
            play={livePlay}
          />
          <div className="flex flex-wrap justify-center gap-2">
            {ORB_BODIES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setBody(id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  body === id
                    ? "bg-surface-selected text-app"
                    : "text-app-muted hover:bg-surface-hover hover:text-app"
                }`}
              >
                {ORB_BODY_LABELS[id]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {MODES.map((item) => (
              <button
                key={item.mode}
                type="button"
                onClick={() => setLive(item)}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  live.mode === item.mode
                    ? "bg-surface-selected text-app"
                    : "text-app-muted hover:bg-surface-hover hover:text-app"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {ORB_BODIES.map((id) => (
            <OrbFrame
              key={id}
              body={id}
              mode="idle"
              label={ORB_BODY_LABELS[id]}
              mic={0}
              play={0}
              still
            />
          ))}
          <OrbFrame
            body="cream"
            mode="idle"
            label="Cream · reduced motion"
            mic={0}
            play={0}
            still
          />
        </section>
      </div>
    </main>
  );
}
