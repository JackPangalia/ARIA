"use client";

import {
  MAX_MEETING_SPEAKERS,
  MIN_MEETING_SPEAKERS,
  meetingSpeakersLabel,
} from "@/lib/audio/meeting-speakers";

interface MeetingSizeControlProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function MeetingSizeControl({
  value,
  onChange,
  disabled = false,
}: MeetingSizeControlProps) {
  const pct =
    ((value - MIN_MEETING_SPEAKERS) /
      (MAX_MEETING_SPEAKERS - MIN_MEETING_SPEAKERS)) *
    100;

  return (
    <div className="w-full max-w-[19rem] border-y border-zinc-900 py-5">
      <div className="mb-6 text-center">
        <p className="text-[9px] font-medium tracking-[0.35em] text-zinc-600">
          SPEAKERS
        </p>
        <p className="mt-4 font-mono text-5xl font-light leading-none tracking-[-0.08em] text-zinc-100">
          {value}
        </p>
        <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">
          {meetingSpeakersLabel(value)}
        </p>
      </div>

      <div className="relative px-0.5">
        <div
          className="pointer-events-none absolute left-0.5 right-0.5 top-1/2 h-px -translate-y-1/2 bg-zinc-800"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-0.5 top-1/2 h-px -translate-y-1/2 bg-zinc-100 transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <input
          type="range"
          min={MIN_MEETING_SPEAKERS}
          max={MAX_MEETING_SPEAKERS}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="meeting-slider relative z-10 w-full"
          aria-label="Maximum people in the meeting"
          aria-valuetext={meetingSpeakersLabel(value)}
        />
      </div>

      <div className="mt-4 flex justify-between text-[9px] font-medium tracking-[0.18em] text-zinc-700">
        <span>1</span>
        <span>10</span>
      </div>

      <p className="mt-5 text-center text-[10px] leading-relaxed text-zinc-600">
        Select the max voices ARIA should separate, then continue.
      </p>
    </div>
  );
}
