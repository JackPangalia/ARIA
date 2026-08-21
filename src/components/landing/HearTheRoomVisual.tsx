"use client";

import Image from "next/image";
import { useEffect, useId, useRef } from "react";

const SPEAKERS = [
  "Maya",
  "James",
  "Priya",
  "Alex",
  "Sofia",
  "Jordan",
  "Nina",
  "Cole",
  "Sam",
  "Leah",
  "Omar",
  "Tess",
  "Ravi",
  "Chloe",
  "Kenji",
] as const;

const NAMES_PER_PHRASE = 4;
const NAME_GAP = "\u00A0\u00A0·\u00A0\u00A0";

function speakerPhrases(): string[] {
  const phrases: string[] = [];
  for (let i = 0; i < SPEAKERS.length; i += NAMES_PER_PHRASE) {
    phrases.push(
      Array.from(
        { length: NAMES_PER_PHRASE },
        (_, offset) => SPEAKERS[(i + offset) % SPEAKERS.length],
      ).join(NAME_GAP),
    );
  }
  return phrases;
}

export function HearTheRoomVisual() {
  const reactId = useId();
  const pathId = `lp-hear-path-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<SVGTextPathElement>(null);

  useEffect(() => {
    const el = textRef.current;
    const root = rootRef.current;
    if (!el || !root) return;

    const phrases = speakerPhrases();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      el.textContent = phrases[0] ?? "";
      return;
    }

    let cancelled = false;
    let timer = 0;
    let inView = false;
    let phraseIndex = 0;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });

    const waitUntilVisible = () =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (cancelled) return;
          if (inView) resolve();
          else timer = window.setTimeout(check, 180);
        };
        check();
      });

    const typePhrase = async (phrase: string) => {
      el.setAttribute("startOffset", "50%");
      el.textContent = "";
      for (let i = 1; i <= phrase.length; i += 1) {
        if (cancelled) return;
        await waitUntilVisible();
        el.textContent = phrase.slice(0, i);
        const typed = phrase[i - 1];
        const pause = typed === "·" ? 42 : 7 + Math.random() * 9;
        await wait(pause);
      }
    };

    const erasePhrase = async () => {
      while ((el.textContent ?? "").length > 0) {
        if (cancelled) return;
        await waitUntilVisible();
        el.textContent = (el.textContent ?? "").slice(0, -1);
        await wait(5 + Math.random() * 6);
      }
    };

    const run = async () => {
      while (!cancelled) {
        await waitUntilVisible();
        const phrase = phrases[phraseIndex % phrases.length];
        if (!phrase) return;
        await typePhrase(phrase);
        if (cancelled) return;
        await wait(520);
        await waitUntilVisible();
        if (cancelled) return;
        await erasePhrase();
        phraseIndex += 1;
        await wait(120);
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? false;
      },
      { threshold: 0.28 },
    );
    io.observe(root);
    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, []);

  return (
    <figure className="lp-scene-visual lp-scene-photo lp-scene-hear">
      <Image
        src="/landing/kivo-lifestyle-coastal-run-motion-v1.png"
        alt="A group running together along a sunlit coastal trail"
        fill
        sizes="(max-width: 820px) 100vw, 62vw"
      />
      <div className="lp-hear" ref={rootRef} aria-hidden="true">
        <div className="lp-hear-meta">
          <p className="lp-hear-kicker">Listen</p>
          <p className="lp-hear-stat">every voice</p>
        </div>
        <svg
          className="lp-hear-arc"
          viewBox="0 0 1200 360"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <path
              id={pathId}
              d="M 40 292 Q 600 18 1160 292"
            />
          </defs>
          <text>
            <textPath
              ref={textRef}
              href={`#${pathId}`}
              startOffset="50%"
              textAnchor="middle"
            />
          </text>
        </svg>
        <div className="lp-hear-wave">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </figure>
  );
}
