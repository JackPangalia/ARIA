import { z } from "zod";

/**
 * First-party funnel analytics. The allowlist below is the entire schema — the
 * /api/events route rejects anything else, so a hostile client can't spray
 * arbitrary event names into the collection. Read with `npm run funnel`.
 */
export const EVENT_NAMES = [
  /** Marketing landing page viewed. */
  "landing_view",
  /** User signed in (deduped to first-ever by uid in the funnel script). */
  "sign_up",
  /** Listening session started. */
  "session_start",
  /** An ask round-trip completed with audio. */
  "ask_success",
  /** User clicked through to Stripe checkout. */
  "checkout_started",
  /** User clicked through to Top-Up pack checkout. */
  "topup_checkout_started",
  /** Top-Up hours purchased. */
  "topup_purchased",
  /** Paid plan activated (written server-side by the Stripe webhook). */
  "plan_activated",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export const AnalyticsEventSchema = z.object({
  name: z.enum(EVENT_NAMES),
  /** Random client id from localStorage; identifies pre-signup visitors. */
  anonId: z.string().min(1).max(64),
  /** Advisory only — sent by the client SDK, never used for authorization. */
  uid: z.string().min(1).max(128).nullish(),
  props: z.record(z.string(), z.union([z.string().max(200), z.number()])).optional(),
});

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
