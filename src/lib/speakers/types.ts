import { z } from "zod";

export interface SpeakerProfileDoc {
  id: string;
  name: string;
  speakerIdentifiers: string[];
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
