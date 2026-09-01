"use client";

import { useEffect, useRef, useState } from "react";
import { KivoLogo } from "@/components/brand/KivoLogo";
import { OrbParticles } from "@/components/aria/OrbParticles";
import { accentFor, energyFor, modeFor } from "@/components/aria/visual-state";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getKivoDesktop } from "@/lib/desktop/bridge";
import { useWidgetStyle } from "@/lib/desktop/widget-style";
import type { AriaStatus } from "@/lib/types";

// Tuned to read as the same orb on a canvas roughly 70% the in-app one's size.
const WIDGET_PARTICLE_COUNT = 8000;
const WIDGET_PARTICLE_SIZE = 0.075;
const WIDGET_COLOR_MIX_POWER = 0.8;
const WIDGET_CAMERA_Z = 8.2;

// Floating over arbitrary desktop wallpapers — always use the dark orb
// treatment (additive glow + dark core). Light-theme white cores read as a
// muddy disc on light desktops; the glow style holds up on both.
function coreGradient(): string {
  return "radial-gradient(circle, rgba(9,9,11,0.62) 0%, rgba(9,9,11,0.34) 56%, rgba(9,9,11,0) 74%)";
}

function bloomGradient(accent: string): string {
  return `radial-gradient(circle, ${accent}55 0%, ${accent}1f 42%, transparent 68%)`;
}

// A press that travels farther than this becomes a window drag; anything
// shorter is a click that reopens the dashboard.
const DRAG_THRESHOLD_PX = 5;

/**
 * The minimal widget style: a frosted pill with a live accent dot and the
 * wordmark. The dot carries all the state the orb would — color follows the
 * mode's accent, scale and glow follow the room's energy.
 */
function MiniWidget(props: {
  isLight: boolean;
  accent: string;
  energy: number;
  idle: boolean;
}) {
  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-center">
      <div
        className="flex items-center gap-2.5 rounded-full py-2.5 pl-4 pr-5 transition-transform duration-100 ease-out active:scale-[0.96]"
        style={{
          background: props.isLight
            ? "rgba(255,255,255,0.82)"
            : "rgba(12,12,14,0.58)",
          border: props.isLight
            ? "1px solid rgba(0,0,0,0.1)"
            : "1px solid rgba(255,255,255,0.11)",
          // Inset top highlight + long soft drop shadow: the glass cue that
          // keeps the pill from reading as a flat slab over the desktop.
          boxShadow: props.isLight
            ? "inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 28px rgba(0,0,0,0.18)"
            : "inset 0 1px 0 rgba(255,255,255,0.09), 0 10px 28px rgba(0,0,0,0.5)",
          backdropFilter: "blur(20px) saturate(1.5)",
          WebkitBackdropFilter: "blur(20px) saturate(1.5)",
        }}
      >
        <span
          aria-hidden
          className="h-[7px] w-[7px] shrink-0 rounded-full transition-all duration-150 ease-linear"
          style={{
            backgroundColor: props.accent,
            opacity: props.idle ? 0.45 : 1,
            transform: `scale(${1 + props.energy * 0.5})`,
            boxShadow: props.idle
              ? "none"
              : `0 0 ${5 + props.energy * 9}px ${props.accent}`,
          }}
        />
        {/* Same Newsreader mark as the landing / app wordmark. */}
        <span
          style={{
            color: props.isLight
              ? "rgba(24,24,27,0.72)"
              : "rgba(161,161,170,1)",
          }}
        >
          <KivoLogo
            variant="wordmark"
            className="select-none text-[1.05rem] leading-none"
          />
        </span>
      </div>
    </div>
  );
}

/**
 * The floating widget — mounted only inside the desktop shell's widget window
 * (see `desktop/src/main.ts`). It has no session store, no auth gate, and no
 * controls: it's a read-only mirror of the in-app orb's status + mic level,
 * relayed over `window.kivoDesktop.onOrbState`.
 *
 * Drag-vs-click: the whole window is one surface. A press past the drag
 * threshold is relayed to the shell, which moves the window; a quick click
 * reopens the dashboard. `-webkit-app-region: drag` can't do this — it
 * swallows the click, which is why the old build only dragged from the thin
 * ring around the orb.
 */
export default function WidgetPage() {
  const { resolvedTheme } = useTheme();
  const [style] = useWidgetStyle();
  const [status, setStatus] = useState<AriaStatus>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [playbackLevel, setPlaybackLevel] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  useEffect(() => {
    const desktop = getKivoDesktop();
    if (!desktop) return;
    return desktop.onOrbState((state) => {
      setStatus(state.status);
      setMicLevel(state.micLevel);
      setPlaybackLevel(state.playbackLevel ?? 0);
    });
  }, []);

  const mode = modeFor(status);
  const isLight = resolvedTheme === "light";
  // Orb accents stay on the dark palette — same reason as the particle blend.
  const accent = accentFor(mode, false);
  const energy = energyFor(mode, micLevel, playbackLevel);

  const openDashboard = () => getKivoDesktop()?.openDashboard();

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      dragging: false,
    };
    // Capture so the drag keeps reporting even though the window itself is
    // moving out from under the cursor.
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.dragging) {
      const distance = Math.hypot(
        event.screenX - drag.startX,
        event.screenY - drag.startY
      );
      if (distance < DRAG_THRESHOLD_PX) return;
      drag.dragging = true;
      setDragging(true);
      getKivoDesktop()?.startWidgetDrag(drag.startX, drag.startY);
    }
    getKivoDesktop()?.moveWidgetDrag(event.screenX, event.screenY);
  };

  const endPress = (
    event: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean
  ) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (drag.dragging) {
      setDragging(false);
      getKivoDesktop()?.endWidgetDrag();
    } else if (!cancelled) {
      openDashboard();
    }
  };

  return (
    <div
      className="kivo-widget fixed inset-0 select-none overflow-hidden"
      role="button"
      tabIndex={0}
      aria-label="Open Kivo dashboard"
      data-theme={isLight ? "light" : "dark"}
      style={{
        cursor: dragging ? "grabbing" : "pointer",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endPress(event, false)}
      onPointerCancel={(event) => endPress(event, true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDashboard();
        }
      }}
    >
      {style === "mini" ? (
        <MiniWidget
          isLight={isLight}
          accent={accent}
          energy={energy}
          idle={mode === "idle"}
        />
      ) : (
        <>
          <div
            className="pointer-events-none absolute inset-[7%] rounded-full"
            style={{ background: coreGradient() }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full transition-opacity duration-150 ease-linear"
            style={{
              background: bloomGradient(accent),
              opacity: mode === "idle" ? 0 : 0.45 + energy * 0.55,
            }}
          />
          <OrbParticles
            className="pointer-events-none absolute left-[-7.5%] top-[-7.5%] h-[115%] w-[115%]"
            color={accent}
            energy={energy}
            isLight={false}
            particleCount={WIDGET_PARTICLE_COUNT}
            particleSize={WIDGET_PARTICLE_SIZE}
            colorMixPower={WIDGET_COLOR_MIX_POWER}
            cameraZ={WIDGET_CAMERA_Z}
          />
        </>
      )}
    </div>
  );
}
