/**
 * Curated Kivo voice presets — a small, deliberate set (like Claude voice
 * mode's five) rather than the full Cartesia catalog. All are English
 * conversational voices verified against this account's Cartesia library.
 * The first entry is the default for users who haven't picked a voice;
 * deployments should point CARTESIA_VOICE_ID at the same voice.
 */
export interface KivoVoiceOption {
  /** Cartesia voice UUID. */
  id: string;
  label: string;
  description: string;
}

export const KIVO_VOICES: readonly KivoVoiceOption[] = [
  {
    id: "5e7d492a-5502-482e-b315-ebf587427806",
    label: "Alfie",
    description: "Calm, balanced British male — the default Kivo voice.",
  },
  {
    id: "9fb269e7-70fe-4cbe-aa3f-28bdb67e3e84",
    label: "Steve",
    description: "Deep, firm African American male baritone.",
  },
  {
    id: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
    label: "Skylar",
    description: "Warm, approachable American female — the original Kivo voice.",
  },
  {
    id: "e8e5fffb-252c-436d-b842-8879b84445b6",
    label: "Cathy",
    description: "Easygoing young female, casual and conversational.",
  },
  {
    id: "62ae83ad-4f6a-430b-af41-a9bede9286ca",
    label: "Gemma",
    description: "Confident, expressive British female.",
  },
  {
    id: "630ed21c-2c5c-41cf-9d82-10a7fd668370",
    label: "Corey",
    description: "Cheerful, inviting young male for casual conversation.",
  },
  {
    id: "65209f8e-6140-4a20-b819-3cc2e21da19b",
    label: "Nolan",
    description: "Warm, engaging male with a natural conversational tone.",
  },
  {
    id: "ef191366-f52f-447a-a398-ed8c0f2943a1",
    label: "Archie",
    description: "Relaxed, friendly British male.",
  },
  {
    id: "47c38ca4-5f35-497b-b1a3-415245fb35e1",
    label: "Daniel",
    description: "Stable, realistic American male — Cartesia's voice-agent pick.",
  },
  {
    id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    label: "Jacqueline",
    description: "Clear, pleasant American female — Cartesia's voice-agent pick.",
  },
  {
    id: "cbaf8084-f009-4838-a096-07ee2e6612b1",
    label: "Maya",
    description: "Expressive American female — more emotional range than the agent set.",
  },
] as const;

export function isKivoVoiceId(value: unknown): value is string {
  return (
    typeof value === "string" && KIVO_VOICES.some((voice) => voice.id === value)
  );
}
