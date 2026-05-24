export const MIN_MEETING_SPEAKERS = 1;
export const MAX_MEETING_SPEAKERS = 10;
export const DEFAULT_MEETING_SPEAKERS = 2;

const STORAGE_KEY = "aria-meeting-speakers";

export function clampMeetingSpeakers(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MEETING_SPEAKERS;
  return Math.min(
    MAX_MEETING_SPEAKERS,
    Math.max(MIN_MEETING_SPEAKERS, Math.round(value))
  );
}

export function readStoredMeetingSpeakers(): number {
  if (typeof window === "undefined") return DEFAULT_MEETING_SPEAKERS;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_MEETING_SPEAKERS;
  return clampMeetingSpeakers(parseInt(raw, 10));
}

export function storeMeetingSpeakers(value: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(clampMeetingSpeakers(value)));
}

export function meetingSpeakersLabel(count: number): string {
  const n = clampMeetingSpeakers(count);
  if (n === 1) return "Just you";
  if (n === 2) return "2 people";
  return `${n} people`;
}
