"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const SESSIONS = [
  {
    overview: "Launch Friday",
    lines: [
      { who: "Maya", text: "We'll ship Friday." },
      { who: "James", text: "I'll take the follow-up." },
      { who: "Priya", text: "The doc is ready." },
    ],
  },
  {
    overview: "Q3 budget",
    lines: [
      { who: "Alex", text: "Budget is approved." },
      { who: "Sofia", text: "I'll send the numbers." },
      { who: "Cole", text: "Same time next week." },
    ],
  },
  {
    overview: "Hiring loop",
    lines: [
      { who: "Nina", text: "We're aligned on the role." },
      { who: "Omar", text: "I'll loop in design." },
      { who: "Leah", text: "Need the recap tonight." },
    ],
  },
] as const;

export function KeepTheRoomVisual() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;

    let cancelled = false;
    let timer = 0;
    let inView = false;

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

    const run = async () => {
      while (!cancelled) {
        await waitUntilVisible();
        setPhase("in");
        await wait(3200);
        if (cancelled) return;
        await waitUntilVisible();
        setPhase("out");
        await wait(560);
        if (cancelled) return;
        setIndex((current) => (current + 1) % SESSIONS.length);
        setPhase("in");
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

  const session = SESSIONS[index] ?? SESSIONS[0];

  return (
    <figure className="lp-scene-visual lp-scene-photo lp-scene-keep">
      <Image
        src="/landing/kivo-landscape-mountain-beach-motion-v1.png"
        alt="A turquoise mountain beach softened by painterly motion blur"
        fill
        sizes="(max-width: 820px) 100vw, 62vw"
      />
      <div className="lp-hear" ref={rootRef} aria-hidden="true">
        <div className="lp-hear-meta">
          <p className="lp-hear-kicker">Keep</p>
          <p className="lp-hear-stat">with you</p>
        </div>
        <div className={`lp-keep-record is-${phase}`} key={index}>
          <p className="lp-keep-overview">{session.overview}</p>
          <ul className="lp-keep-lines">
            {session.lines.map((line) => (
              <li key={line.who} className="lp-keep-line">
                <span className="lp-keep-who">{line.who}</span>
                <span className="lp-keep-said">{line.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-hear-wave lp-keep-wave">
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
