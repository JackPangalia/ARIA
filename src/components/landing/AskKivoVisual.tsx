"use client";

import Image from "next/image";
import { useEffect, useId, useRef } from "react";

const WAKE = "Hey Kivo.";

const QUESTIONS = [
  "What did we decide?",
  "Who's taking this?",
  "What's the timeline?",
  "Can you recap?",
  "What did Maya say?",
  "Where did we land?",
  "What's still open?",
  "Did we agree on Friday?",
] as const;

function askPhrases(): string[] {
  return QUESTIONS.flatMap((question) => [WAKE, question]);
}

export function AskKivoVisual() {
  const reactId = useId();
  const pathId = `lp-ask-path-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<SVGTextPathElement>(null);
  const svgTextRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    const el = textRef.current;
    const root = rootRef.current;
    const svgText = svgTextRef.current;
    if (!el || !root) return;

    const phrases = askPhrases();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      el.textContent = WAKE;
      svgText?.classList.add("lp-ask-wake");
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

    const setWake = (wake: boolean) => {
      svgText?.classList.toggle("lp-ask-wake", wake);
    };

    const typePhrase = async (phrase: string) => {
      const wake = phrase === WAKE;
      setWake(wake);
      el.setAttribute("startOffset", "50%");
      el.textContent = "";
      for (let i = 1; i <= phrase.length; i += 1) {
        if (cancelled) return;
        await waitUntilVisible();
        el.textContent = phrase.slice(0, i);
        const pause = wake ? 13 + Math.random() * 8 : 8 + Math.random() * 10;
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
        await wait(phrase === WAKE ? 740 : 920);
        await waitUntilVisible();
        if (cancelled) return;
        await erasePhrase();
        phraseIndex += 1;
        await wait(110);
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
    <figure className="lp-scene-visual lp-scene-photo lp-scene-ask">
      <Image
        src="/landing/kivo-adventure-waterfall-motion-v1.png"
        alt="Hikers moving through a misty ravine beneath a waterfall"
        fill
        sizes="(max-width: 820px) 100vw, 62vw"
      />
      <div className="lp-hear" ref={rootRef} aria-hidden="true">
        <div className="lp-hear-meta">
          <p className="lp-hear-kicker">Ask</p>
          <p className="lp-hear-stat">out loud</p>
        </div>
        <svg
          className="lp-hear-arc lp-ask-arc"
          viewBox="0 0 1200 360"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <path
              id={pathId}
              d="M 44 288 Q 600 32 1156 288"
            />
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
