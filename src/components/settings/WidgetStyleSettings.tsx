"use client";

import { useSyncExternalStore } from "react";
import { isKivoDesktop } from "@/lib/desktop/bridge";
import { useWidgetStyle, type WidgetStyle } from "@/lib/desktop/widget-style";

// `window.kivoDesktop` is injected by the shell's preload before React runs
// and never changes afterwards — hence the no-op subscription. The server
// snapshot stays `false` so SSR and the first client render agree.
const subscribeNoop = () => () => {};

function OrbStyleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
  );
}

function MiniStyleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="12" r="1.75" fill="currentColor" />
    </svg>
  );
}

const STYLE_OPTIONS: {
  id: WidgetStyle;
  label: string;
  Icon: () => React.JSX.Element;
}[] = [
  { id: "orb", label: "Orb", Icon: OrbStyleIcon },
  { id: "mini", label: "Mini", Icon: MiniStyleIcon },
];

/**
 * Appearance-tab picker for the floating desktop widget's look. Only exists
 * inside the desktop shell — in a plain browser there's no widget to style.
 */
export function WidgetStyleSettings() {
  const desktop = useSyncExternalStore(
    subscribeNoop,
    () => isKivoDesktop(),
    () => false
  );
  const [style, setStyle] = useWidgetStyle();

  if (!desktop) return null;

  return (
    <section className="mb-7">
      <p className="kivo-settings-group-label">Desktop widget</p>
      <div className="kivo-settings-card px-3 py-3">
        <p className="mb-3 px-1 text-[13px] leading-relaxed text-app-muted">
          What floats on your screen while Kivo is listening and the app is in
          the background.
        </p>
        <div className="grok-theme-grid grok-theme-grid--two">
          {STYLE_OPTIONS.map((option) => {
            const selected = style === option.id;
            const Icon = option.Icon;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setStyle(option.id)}
                data-selected={selected}
                className="grok-preview-card"
              >
                <span className="grok-preview-iconwell">
                  <Icon />
                </span>
                <span className="grok-preview-card-label">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
