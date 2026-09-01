"use client";

import { GlowOrb } from "@/components/aria/GlowOrb";
import {
  ORB_BODIES,
  ORB_BODY_LABELS,
  useOrbBody,
  type OrbBody,
} from "@/lib/orb/orb-body";

function SkinThumb({ body }: { body: OrbBody }) {
  return (
    <span className="relative mx-auto block aspect-square w-16 overflow-hidden rounded-full">
      <GlowOrb mode="idle" body={body} still compact />
    </span>
  );
}

export function OrbBodySettings() {
  const [body, setBody] = useOrbBody();

  return (
    <section className="mb-7">
      <p className="kivo-settings-group-label">Orb</p>
      <div className="kivo-settings-card px-3 py-3">
        <p className="mb-3 px-1 text-[13px] leading-relaxed text-app-muted">
          Cream or dark. Listening, thinking, and speaking only change how it
          breathes.
        </p>
        <div className="grok-theme-grid grok-theme-grid--two">
          {ORB_BODIES.map((id) => {
            const selected = body === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setBody(id)}
                data-selected={selected}
                aria-pressed={selected}
                className="grok-preview-card"
              >
                <SkinThumb body={id} />
                <span className="grok-preview-card-label">
                  {ORB_BODY_LABELS[id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
