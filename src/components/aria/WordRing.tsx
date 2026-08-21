"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  accentFor,
  energyFor,
  type Mode,
} from "@/components/aria/visual-state";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useAriaStore } from "@/lib/store";
import {
  approach,
  glyphIgnition,
  letterRadialScale,
  trailOpacity,
} from "@/lib/voice/word-ring-motion";
import { RingTrack } from "@/lib/voice/word-ring-track";
import {
  fitRingText,
  makeFillerPool,
  normalizeRingSource,
  ringStep,
  type CharWidth,
  type RingVoice,
} from "@/lib/voice/word-ring-text";

const VIEW = 400;
const CX = 200;
const CY = 200;
const RADIUS = 152;
const PATH_LENGTH = 2 * Math.PI * RADIUS;
/**
 * A little arc left empty where the ring closes. Without it, a ring packed full
 * of speech runs the newest word straight into the oldest one with no seam, and
 * the sentence reads as a loop with no beginning.
 */
const SEAM_GAP = 34;
const PACK_LENGTH = PATH_LENGTH - SEAM_GAP;
/**
 * A hairline just outside the letters. It draws the arc the live speech has
 * claimed on the ring, and morphs into a short orbiting comet while Kivo works —
 * one element, because the two are the same idea: where the ring's attention is.
 * The path starts at nine o'clock and runs counter-clockwise, matching the
 * direction the letters are laid out in, so a dash offset of zero lines the arc
 * up under the first letter.
 */
const ARC_RADIUS = RADIUS + 24;
const ARC_LENGTH = 2 * Math.PI * ARC_RADIUS;
/** Live arc lengths are measured on the text circle; the hairline is wider. */
const ARC_SCALE = ARC_RADIUS / RADIUS;
const COMET_ARC = ARC_LENGTH * 0.13;
/** Comet travel, path units per millisecond — about one lap every three seconds. */
const COMET_SPEED = 0.4;
const ARC_PATH = [
  `M ${CX - ARC_RADIUS} ${CY}`,
  `A ${ARC_RADIUS} ${ARC_RADIUS} 0 1 0 ${CX + ARC_RADIUS} ${CY}`,
  `A ${ARC_RADIUS} ${ARC_RADIUS} 0 1 0 ${CX - ARC_RADIUS} ${CY}`,
].join(" ");

const SANS_SIZE = 16;
const SERIF_SIZE = 20;
const FILLER_POOL = makeFillerPool(280);
const FILLER_GLYPHS_COUNT = 26;

/**
 * Fixed glyph budget. Sized past a ring packed with the narrowest letters the
 * cipher can produce, so the pool is allocated once and never resized — nodes
 * beyond the current pack simply hold no text.
 */
const MAX_GLYPHS = 260;

/**
 * How far back from the newest letter the live trail dims, and to what. The
 * contrast is what lets the eye find the word being spoken right now on a ring
 * that is otherwise wall-to-wall text.
 */
const TRAIL_SPAN = 30;
const TRAIL_FLOOR = 0.52;

// Half-lives (ms) for the voice envelope. Fast attack so a syllable lands the
// instant it's heard, slower release so the ring settles rather than flickers,
// and a much slower average whose gap to the live level is the onset transient.
const ENERGY_ATTACK_MS = 16;
const ENERGY_RELEASE_MS = 90;
const ENERGY_AVERAGE_MS = 235;
/** Every per-mode motion value crossfades over this, so state changes never snap. */
const MODE_TWEEN_MS = 180;

type RingMotion = {
  /** Ring scale gained at full voice energy. */
  scaleAmp: number;
  /** Idle-breath amplitude on the ring scale, and how fast it breathes. */
  breathe: number;
  breatheRate: number;
  /** Ring rotation, degrees per millisecond. */
  spin: number;
  /** How far letters ride off the circle with the voice. */
  warp: number;
  /** Opacity of the cipher that closes the ring. */
  filler: number;
  /** Mix of the mode accent into the letter color, 0..1. */
  tint: number;
  /** Peak opacity of the accent halo behind the ring. */
  halo: number;
  /** Visibility of the orbiting work arc. */
  sweep: number;
  /** Cipher churn, in letters per second (0 = frozen). */
  scrambleHz: number;
};

const MOTION: Record<Mode, RingMotion> = {
  idle: {
    scaleAmp: 0,
    breathe: 0.006,
    breatheRate: 0.0007,
    spin: 0,
    warp: 0,
    filler: 0.4,
    tint: 0,
    halo: 0.1,
    sweep: 0,
    scrambleHz: 4.5,
  },
  listen: {
    scaleAmp: 0.048,
    breathe: 0.004,
    breatheRate: 0.0012,
    spin: 0,
    warp: 0.22,
    filler: 0.3,
    tint: 0.16,
    halo: 0.58,
    sweep: 0,
    scrambleHz: 0,
  },
  wake: {
    scaleAmp: 0.055,
    breathe: 0.004,
    breatheRate: 0.0016,
    spin: 0,
    warp: 0.28,
    filler: 0.32,
    tint: 0.2,
    halo: 0.72,
    sweep: 0,
    scrambleHz: 0,
  },
  followup: {
    scaleAmp: 0.038,
    breathe: 0.01,
    breatheRate: 0.0009,
    spin: 0.004,
    warp: 0.2,
    filler: 0.46,
    tint: 0.2,
    halo: 0.46,
    sweep: 0,
    scrambleHz: 7.7,
  },
  think: {
    scaleAmp: 0.022,
    breathe: 0.016,
    breatheRate: 0.0011,
    spin: 0.012,
    warp: 0.18,
    filler: 0.5,
    tint: 0.14,
    halo: 0.42,
    sweep: 0.55,
    scrambleHz: 14.3,
  },
  search: {
    scaleAmp: 0.024,
    breathe: 0.014,
    breatheRate: 0.0013,
    spin: 0.018,
    warp: 0.2,
    filler: 0.52,
    tint: 0.16,
    halo: 0.44,
    sweep: 0.9,
    scrambleHz: 20.8,
  },
  speak: {
    scaleAmp: 0.05,
    breathe: 0,
    breatheRate: 0.0012,
    spin: 0,
    warp: 0.24,
    filler: 0.2,
    tint: 0.22,
    halo: 0.82,
    sweep: 0,
    scrambleHz: 0,
  },
};

const MOTION_KEYS = Object.keys(MOTION.idle) as (keyof RingMotion)[];

// ---------------------------------------------------------------------------
// Text metrics
//
// Every glyph on the ring is measured once per (voice, font-load) and cached.
// Resolving the font family walks computed styles, so doing it per character —
// which is what a naive measure does — costs a style recalc per letter per
// re-pack. The cache is dropped wholesale when a webfont finishes loading.
// ---------------------------------------------------------------------------

const measureCanvas =
  typeof document === "undefined" ? null : document.createElement("canvas");
const measureCtx = measureCanvas?.getContext("2d") ?? null;

type RingMetrics = { font: string; spacing: number; widths: Map<string, number> };

const metricsCache = new Map<RingVoice, RingMetrics>();

function resolveFontFamily(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(variable)
      .trim() || fallback
  );
}

function buildMetrics(voice: RingVoice): RingMetrics {
  if (voice === "serif") {
    const family = resolveFontFamily("--font-newsreader", "Georgia");
    return {
      font: `400 ${SERIF_SIZE}px ${family}, Georgia, serif`,
      spacing: SERIF_SIZE * 0.05,
      widths: new Map(),
    };
  }
  const family = resolveFontFamily("--font-inter", "ui-sans-serif");
  return {
    font: `500 ${SANS_SIZE}px ${family}, ui-sans-serif, system-ui, sans-serif`,
    spacing: SANS_SIZE * 0.04,
    widths: new Map(),
  };
}

/** Spaces render as non-breaking so the ring can't collapse them — measure the same. */
function glyphChar(ch: string): string {
  return ch === " " ? "\u00A0" : ch;
}

/**
 * Per-character advance including letter spacing. Every glyph on a ring has a
 * neighbour (even the last one, across the seam), so the spacing belongs to
 * every character rather than to all-but-the-last.
 */
function charWidthFor(voice: RingVoice): CharWidth {
  let metrics = metricsCache.get(voice);
  if (!metrics) {
    metrics = buildMetrics(voice);
    metricsCache.set(voice, metrics);
  }
  const { font, spacing, widths } = metrics;
  const fallback = (voice === "serif" ? SERIF_SIZE : SANS_SIZE) * 0.55;
  return (ch: string) => {
    const cached = widths.get(ch);
    if (cached !== undefined) return cached;
    let width = fallback;
    if (measureCtx) {
      measureCtx.font = font;
      width = measureCtx.measureText(glyphChar(ch)).width;
    }
    width = Math.max(0.5, width + spacing);
    widths.set(ch, width);
    return width;
  };
}

function textStyle(voice: RingVoice): React.CSSProperties {
  const serif = voice === "serif";
  return {
    fill: "currentColor",
    fontFamily: serif
      ? "var(--font-newsreader), Georgia, serif"
      : "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
    fontSize: serif ? SERIF_SIZE : SANS_SIZE,
    fontWeight: serif ? 400 : 500,
    dominantBaseline: "middle",
    textAnchor: "middle",
    whiteSpace: "pre",
  };
}

function ringColor(mode: Mode, tint: number, isLight: boolean): string {
  if (tint <= 0) return "var(--app-fg)";
  const accent = accentFor(mode, isLight);
  const rest = Math.round((1 - tint) * 100);
  const mix = Math.round(tint * 100);
  return `color-mix(in srgb, var(--app-fg) ${rest}%, ${accent} ${mix}%)`;
}

// Painted from `currentColor` so the hue rides the same CSS transition as the
// letters and never jump-cuts on a state change. Kept tight and dim: spread
// wide over a near-black page, a low-alpha accent just reads as fog.
const HALO_CORE = `radial-gradient(circle at 50% 50%,
  color-mix(in srgb, currentColor 88%, transparent) 0%,
  color-mix(in srgb, currentColor 34%, transparent) 12%,
  color-mix(in srgb, currentColor 9%, transparent) 28%,
  transparent 48%)`;


/** Per-character reveal pause, in ms — the ring types at a speaking cadence. */
function pauseFor(char: string, voice: RingVoice, haste: number): number {
  if (char === "·") return 42 * haste;
  if (char === " " || char === "\u00A0") return 16 * haste;
  if (voice === "serif") return (13 + Math.random() * 8) * haste;
  return (7 + Math.random() * 9) * haste;
}

/** Catch up when speech has outrun the ticker, rather than falling behind forever. */
function hasteFor(behind: number): number {
  if (behind > 28) return 0.28;
  if (behind > 14) return 0.48;
  return 1;
}

/**
 * The listening ring.
 *
 * One requestAnimationFrame loop owns everything that moves: the typing
 * cadence, the cipher churn, the voice envelope, the per-mode crossfade, and
 * the placement of every glyph. React renders a fixed pool of `<text>` nodes
 * once and never re-renders them — a per-character `setState` meant a full
 * re-render plus a re-measure of the whole ring for every letter of speech,
 * which is what made it stutter under a fast talker.
 */
export function WordRing(props: {
  text: string;
  voice: RingVoice;
  mode: Mode;
}) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";

  const coreRef = useRef<HTMLDivElement>(null);
  const breatheRef = useRef<SVGGElement>(null);
  const spinRef = useRef<SVGGElement>(null);
  const arcRef = useRef<SVGPathElement>(null);
  const glyphsRef = useRef<SVGGElement>(null);

  // Everything the loop reads lives behind a ref. Restarting it would reset the
  // envelope and the mode crossfade mid-transition — exactly at the state
  // changes the crossfade exists to smooth over.
  const modeRef = useRef(props.mode);
  const voiceRef = useRef(props.voice);
  const isLightRef = useRef(isLight);
  useEffect(() => {
    modeRef.current = props.mode;
    voiceRef.current = props.voice;
    isLightRef.current = isLight;
  }, [props.mode, props.voice, isLight]);

  // Bumped when a webfont lands: every cached advance was measured against the
  // fallback face and has to be thrown away, or the ring packs visibly wrong.
  const [fontEpoch, setFontEpoch] = useState(0);

  const widthOf = useMemo(
    () => charWidthFor(props.voice),
    // fontEpoch busts the measurement cache; the measurer never reads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.voice, fontEpoch],
  );

  const source = useMemo(
    () => normalizeRingSource(props.text),
    [props.text],
  );
  const snapText = useMemo(
    () => fitRingText(source, PACK_LENGTH, widthOf),
    [source, widthOf],
  );

  const trackRef = useRef<RingTrack | null>(null);
  if (trackRef.current == null) {
    trackRef.current = new RingTrack(
      PACK_LENGTH,
      widthOf,
      FILLER_POOL,
      MAX_GLYPHS,
    );
  }

  const pendingRef = useRef("");
  const typeWaitRef = useRef(0);
  const nodesRef = useRef<SVGTextElement[]>([]);
  const paintedRef = useRef<{ transform: string; ch: string; opacity: number }[]>(
    [],
  );

  const reduceMotionRef = useRef(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduceMotionRef.current = query.matches;
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    let cancelled = false;
    const invalidate = () => {
      if (cancelled) return;
      metricsCache.clear();
      setFontEpoch((epoch) => epoch + 1);
    };
    void fonts.ready.then(invalidate);
    fonts.addEventListener("loadingdone", invalidate);
    return () => {
      cancelled = true;
      fonts.removeEventListener("loadingdone", invalidate);
    };
  }, []);

  // Snapshot the glyph nodes once; indexing a live HTMLCollection per glyph per
  // frame is the kind of cost that only shows up on a slow machine with a full
  // ring. The pool is fixed, so this never has to run again.
  useLayoutEffect(() => {
    const group = glyphsRef.current;
    if (!group) return;
    nodesRef.current = Array.from(group.children) as SVGTextElement[];
    paintedRef.current = nodesRef.current.map(() => ({
      transform: "",
      ch: "",
      opacity: -1,
    }));
  }, []);

  useEffect(() => {
    trackRef.current?.remeasure(widthOf);
  }, [widthOf]);

  // Advance the ring toward the newest transcript. Never rewinds: growing
  // speech types the new suffix, and a rewritten transcript snaps in place.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Kivo's own turns bring no new room speech, so the ring keeps the last
    // thing it heard rather than emptying out mid-answer. Only going idle —
    // the session ending — wipes it, which is also what stops the next session
    // from opening on the previous one's words.
    if (!source && props.mode !== "idle") return;
    const step = ringStep(track.liveText, source, snapText);

    if (step.kind === "done") {
      pendingRef.current = "";
      return;
    }
    if (step.kind === "snap") {
      pendingRef.current = "";
      track.snap(step.text);
      return;
    }
    if (reduceMotionRef.current) {
      pendingRef.current = "";
      track.snap(snapText);
      return;
    }
    pendingRef.current = step.text;
    typeWaitRef.current = 0;
  }, [source, snapText, props.mode]);

  useEffect(() => {
    const core = coreRef.current;
    const breathe = breatheRef.current;
    const spin = spinRef.current;
    const arc = arcRef.current;
    if (!core || !breathe || !spin || !arc) return;

    let frame = 0;
    let last = performance.now();
    let energy = 0;
    let average = 0;
    let breathPhase = 0;
    let rotation = 0;
    let arcOffset = 0;
    let scrambleDue = 0;
    let scale = 1;

    // Every per-mode value is tweened rather than switched, so a state change
    // reads as the ring changing its mind, not as a cut.
    const motion: RingMotion = { ...MOTION[modeRef.current] };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;

      const track = trackRef.current;
      if (!track) return;

      const mode = modeRef.current;
      const still = reduceMotionRef.current;
      const target = MOTION[mode];
      for (const key of MOTION_KEYS) {
        motion[key] = still
          ? target[key]
          : approach(motion[key], target[key], MODE_TWEEN_MS, dt);
      }

      const store = useAriaStore.getState();
      const level = still
        ? 0
        : energyFor(mode, store.micLevel, store.playbackLevel);

      energy = approach(
        energy,
        level,
        level > energy ? ENERGY_ATTACK_MS : ENERGY_RELEASE_MS,
        dt,
      );
      average = approach(average, energy, ENERGY_AVERAGE_MS, dt);
      const flash = Math.max(0, energy - average);

      // Typing: one character per accumulated pause, driven off the same clock
      // as everything else so a dropped frame can't desynchronise the cadence.
      const pending = pendingRef.current;
      if (pending) {
        if (still) {
          for (const ch of pending) track.append(ch, 0);
          pendingRef.current = "";
        } else {
          typeWaitRef.current -= dt;
          let cursor = 0;
          const chars = Array.from(pending);
          const haste = hasteFor(chars.length);
          while (cursor < chars.length && typeWaitRef.current <= 0) {
            const ch = chars[cursor]!;
            track.append(ch, now);
            typeWaitRef.current += pauseFor(ch, voiceRef.current, haste);
            cursor += 1;
          }
          if (cursor > 0) {
            pendingRef.current = chars.slice(cursor).join("");
          }
        }
      }

      if (!still && motion.scrambleHz > 0.05 && track.filler.length > 3) {
        scrambleDue -= dt;
        // Bounded per frame: a long stall shouldn't burst the whole cipher.
        let swaps = 0;
        while (scrambleDue <= 0 && swaps < 4) {
          scrambleDue += 1000 / motion.scrambleHz;
          const at = Math.floor(Math.random() * track.filler.length);
          const glyph = Math.floor(Math.random() * FILLER_GLYPHS_COUNT);
          track.scramble(at, glyph);
          swaps += 1;
        }
      } else {
        scrambleDue = 0;
      }

      if (!still) breathPhase += dt * motion.breatheRate;
      const targetScale = still
        ? 1
        : 1 + energy * motion.scaleAmp + Math.sin(breathPhase) * motion.breathe;
      scale = still ? targetScale : approach(scale, targetScale, 55, dt);
      breathe.setAttribute(
        "transform",
        `translate(${CX} ${CY}) scale(${scale.toFixed(4)}) translate(${-CX} ${-CY})`,
      );

      // Modes that work (think, search) turn the ring; every other mode eases it
      // forward to the next whole turn. Left where it stopped, the ring keeps a
      // random orientation for the rest of the session and the newest speech can
      // end up upside down at the top.
      if (!still && MOTION[mode].spin > 0) {
        rotation += motion.spin * dt;
      } else {
        const home = Math.ceil(rotation / 360) * 360;
        rotation = approach(rotation, home, 320, dt);
        if (Math.abs(home - rotation) < 0.05) rotation = 0;
      }
      spin.setAttribute(
        "transform",
        `rotate(${rotation.toFixed(3)} ${CX} ${CY})`,
      );

      // The hairline crossfades between the two things it can mean: the arc
      // speech has claimed, and a comet orbiting while Kivo works. The dash
      // pattern is exactly one lap long, so the offset wraps seamlessly — but
      // it has to be integrated, never eased toward a wrapping target, or the
      // comet slides the long way round once per lap.
      if (!still && motion.sweep > 0.02) {
        arcOffset -= dt * COMET_SPEED * motion.sweep;
        if (arcOffset <= -ARC_LENGTH) arcOffset += ARC_LENGTH;
      } else if (arcOffset !== 0) {
        // Coast forward to the seam so the speech arc starts where speech does.
        arcOffset = approach(arcOffset, -ARC_LENGTH, 200, dt);
        if (arcOffset <= -ARC_LENGTH + 0.5) arcOffset = 0;
      }
      const speechArc = Math.min(ARC_LENGTH, track.liveArc * ARC_SCALE);
      const drawn = speechArc + (COMET_ARC - speechArc) * motion.sweep;
      arc.setAttribute(
        "stroke-dasharray",
        `${drawn.toFixed(1)} ${(ARC_LENGTH - drawn).toFixed(1)}`,
      );
      arc.setAttribute("stroke-dashoffset", arcOffset.toFixed(1));
      arc.setAttribute(
        "stroke-opacity",
        (drawn < 1 ? 0 : 0.16 + energy * 0.16 + flash * 0.34).toFixed(3),
      );

      // Light backgrounds need much less of the accent before it goes muddy.
      const dim = isLightRef.current ? 0.45 : 1;
      const glow = motion.halo * (0.09 + energy * 0.26 + flash * 0.5) * dim;
      core.style.opacity = Math.min(1, glow).toFixed(3);
      core.style.transform = `scale(${(0.62 + energy * 0.2 + flash * 0.18).toFixed(4)})`;

      paint(track, now, energy, flash, motion, still);
    };

    const paint = (
      track: RingTrack,
      now: number,
      level: number,
      flash: number,
      current: RingMotion,
      still: boolean,
    ) => {
      const nodes = nodesRef.current;
      const painted = paintedRef.current;
      const live = track.live;
      const filler = track.filler;
      const total = Math.min(live.length + filler.length, nodes.length);
      const head = live.length - 1;
      let arc = 0;

      for (let i = 0; i < total; i += 1) {
        const isLive = i < live.length;
        const glyph = isLive ? live[i]! : filler[i - live.length]!;
        const center = arc + glyph.width / 2;
        arc += glyph.width;

        const theta = Math.PI + center / RADIUS;
        const age = glyph.revealedAt > 0 ? now - glyph.revealedAt : Infinity;
        const ignition = still ? 0 : glyphIgnition(age);
        const warp = still
          ? 1
          : letterRadialScale(theta, glyph.seed, now, level, flash, current.warp);
        const radius = RADIUS * (warp + ignition * 0.045);
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const x = CX + radius * cos;
        const y = CY - radius * sin;
        const rot = (Math.atan2(-cos, -sin) * 180) / Math.PI;

        const opacity = isLive
          ? trailOpacity(head - i, TRAIL_SPAN, TRAIL_FLOOR)
          : current.filler;

        const node = nodes[i]!;
        const state = painted[i]!;
        const transform = `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(2)})`;
        if (state.transform !== transform) {
          node.setAttribute("transform", transform);
          state.transform = transform;
        }
        const ch = glyphChar(glyph.ch);
        if (state.ch !== ch) {
          node.textContent = ch;
          state.ch = ch;
        }
        const rounded = Math.round(opacity * 100) / 100;
        if (state.opacity !== rounded) {
          node.setAttribute("fill-opacity", String(rounded));
          state.opacity = rounded;
        }
      }

      for (let i = total; i < nodes.length; i += 1) {
        const state = painted[i]!;
        if (state.ch !== "") {
          nodes[i]!.textContent = "";
          state.ch = "";
        }
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        ref={coreRef}
        aria-hidden="true"
        className="absolute inset-0 rounded-full will-change-[opacity,transform]"
        style={{
          color: accentFor(props.mode, isLight),
          background: HALO_CORE,
          opacity: 0,
          transition: "color 520ms ease",
        }}
      />
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        aria-hidden="true"
        style={{
          color: ringColor(props.mode, MOTION[props.mode].tint, isLight),
          transition: "color 480ms ease",
        }}
      >
        <g ref={breatheRef}>
          <g ref={spinRef}>
            <path
              ref={arcRef}
              d={ARC_PATH}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeOpacity={0}
            />
            <g ref={glyphsRef} style={textStyle(props.voice)}>
              {Array.from({ length: MAX_GLYPHS }, (_, i) => (
                <text key={i} x={0} y={0} />
              ))}
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
