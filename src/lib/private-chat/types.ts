import { z } from "zod";

export type PrivateChatRole = "user" | "assistant";

/**
 * One message in the owner's private text chat with Kivo. These live in their
 * own subcollection and are never turned into session `turns`, so nothing
 * typed here can reach a spoken answer, the rolling summary, or search.
 */
export interface PrivateChatMessage {
  id: string;
  role: PrivateChatRole;
  text: string;
  sequence: number;
  createdAt: string;
  /** The owner stopped the answer before it finished. */
  interrupted?: boolean;
}

export const PrivateChatBodySchema = z.object({
  question: z.string().trim().min(1).max(12000),
});

/** How much of the chat's own history rides along with each question. */
export const PRIVATE_CHAT_HISTORY_LIMIT = 40;
