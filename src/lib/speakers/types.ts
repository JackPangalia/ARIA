import { z } from "zod";
import { MAX_LEARN_SPEAKER_IDENTIFIERS } from "@/lib/speakers/identifier-cap";

export interface SpeakerProfileDoc {
  id: string;
  name: string;
  speakerIdentifiers: string[];
  /**
   * Leading `speakerIdentifiers` captured during explicit enrollment. Live
   * learning rotates the entries after them and never touches these.
   */
  anchorCount: number;
  sampleCount: number;
  createdAt: string;
  updatedAt: string;
}

export const SpeakerProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  speakerIdentifiers: z.array(z.string().min(1).max(4096)).min(1).max(50),
  sampleCount: z.number().int().min(1).max(100000).default(1),
});

export const PatchSpeakerProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  speakerIdentifiers: z.array(z.string().min(1).max(4096)).min(1).max(50).optional(),
  sampleCount: z.number().int().min(1).max(100000).optional(),
});

export const LearnSpeakerProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // Accepts a whole live cluster; the repository trims to the storage cap.
  speakerIdentifiers: z
    .array(z.string().min(1).max(4096))
    .min(1)
    .max(MAX_LEARN_SPEAKER_IDENTIFIERS),
});
