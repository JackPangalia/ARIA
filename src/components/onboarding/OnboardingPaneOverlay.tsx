"use client";

import { useEffect, useId, useRef } from "react";

type OverlayKind = "welcome" | "appearance" | "voice" | "speakers";

const SPEAKER_PHRASES = [
  "Maya  ·  James  ·  Priya  ·  Alex",
  "Sofia  ·  Jordan  ·  Nina  ·  Cole",
  "Sam  ·  Leah  ·  Omar  ·  Tess",
] as const;

const APPEARANCE_PHRASES = ["Light", "Dark", "System"] as const;

const VOICE_WAKE = "Hey Kivo.";
const VOICE_PHRASES = [
  VOICE_WAKE,
  "What did we decide?",
  VOICE_WAKE,
  "Who's taking this?",
  VOICE_WAKE,
  "Can you recap?",
] as const;

const SPEAKER_LABEL_PHRASES = [
  "Maya",
  "that wasn't Jack",
  "tap a name",
  "James",
  "someone else",
] as const;

const OVERLAY: Record<OverlayKind, { kicker: string; stat: string }> = {
  welcome: { kicker: "Listen", stat: "the room" },
  appearance: { kicker: "Look", stat: "your way" },
  voice: { kicker: "Ask", stat: "out loud" },
  speakers: { kicker: "Name", stat: "who said what" },
};

function useTypedArc(
  phrases: readonly string[],
  wakePhrase?: string,
) {
  const textRef = useRef<SVGTextPathElement>(null);
  const svgTextRef = useRef<SVGTextElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textRef.current;
    const root = rootRef.current;
    if (!el || !root) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) {
      el.textContent = phrases[0] ?? "";
      if (wakePhrase && phrases[0] === wakePhrase) {
        svgTextRef.current?.classList.add("is-wake");
      }
      return;
    }

    let cancelled = false;
    let timer = 0;
    let phraseIndex = 0;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });

    const typePhrase = async (phrase: string) => {
      const wake = Boolean(wakePhrase && phrase === wakePhrase);
      svgTextRef.current?.classList.toggle("is-wake", wake);
      el.textContent = "";
      for (let i = 1; i <= phrase.length; i += 1) {
        if (cancelled) return;
        el.textContent = phrase.slice(0, i);
        const typed = phrase[i - 1];
        const pause = typed === "·" ? 40 : wake ? 14 : 8 + Math.random() * 9;
        await wait(pause);
      }
    };

    const erasePhrase = async () => {
      while ((el.textContent ?? "").length > 0) {
        if (cancelled) return;
        el.textContent = (el.textContent ?? "").slice(0, -1);
        await wait(5 + Math.random() * 6);
      }
    };

    const run = async () => {
      while (!cancelled) {
        const phrase = phrases[phraseIndex % phrases.length];
        if (!phrase) return;
        await typePhrase(phrase);
        if (cancelled) return;
        await wait(phrase === wakePhrase ? 720 : 880);
        if (cancelled) return;
        await erasePhrase();
        phraseIndex += 1;
        await wait(110);
      }
    };

    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phrases, wakePhrase]);

  return { textRef, svgTextRef, rootRef };
}

function ArcOverlay(props: {
  kind: OverlayKind;
  phrases: readonly string[];
  wakePhrase?: string;
}) {
  const reactId = useId();
  const pathId = `kivo-ob-path-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { textRef, svgTextRef, rootRef } = useTypedArc(
    props.phrases,
    props.wakePhrase,
  );
  const copy = OVERLAY[props.kind];

  return (
    <div className="kivo-ob-overlay" ref={rootRef} aria-hidden>
      <div className="kivo-ob-meta">
        <p className="kivo-ob-kicker">{copy.kicker}</p>
        <p className="kivo-ob-stat">{copy.stat}</p>
      </div>
      <svg
        className="kivo-ob-arc"
        viewBox="0 0 1200 360"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <path id={pathId} d="M 40 292 Q 600 22 1160 292" />
        </defs>
        <text ref={svgTextRef}>
          <textPath
            ref={textRef}
            href={`#${pathId}`}
            startOffset="50%"
            textAnchor="middle"
          />
        </text>
      </svg>
    </div>
  );
}

export function OnboardingPaneOverlay({ kind }: { kind: OverlayKind }) {
  if (kind === "appearance") {
    return <ArcOverlay kind={kind} phrases={APPEARANCE_PHRASES} />;
  }
  if (kind === "voice") {
    return (
      <ArcOverlay kind={kind} phrases={VOICE_PHRASES} wakePhrase={VOICE_WAKE} />
    );
  }
  if (kind === "speakers") {
    return <ArcOverlay kind={kind} phrases={SPEAKER_LABEL_PHRASES} />;
  }
  return <ArcOverlay kind={kind} phrases={SPEAKER_PHRASES} />;
}
