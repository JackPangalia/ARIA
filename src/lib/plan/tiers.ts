/**
 * Canonical subscription-tier configuration.
 *
 * This file is the SINGLE SOURCE OF TRUTH for plan limits and pricing-page copy.
 * Both the server-side enforcement layer and the marketing pricing UI import from
 * here, so the numbers users see can never drift from the numbers we enforce.
 *
 * Pricing model (see /Users/.../memory/pricing-tiers-plan.md): metered primarily on
 * listening hours (Speechmatics ≈ $0.56/hr is the dominant COGS), with a generous
 * soft token backstop on "asks". Listening is a hard cap; asks are a soft backstop.
 */

import { CONNECTORS_ENABLED } from "@/lib/features";

export type Tier = "free" | "plus" | "pro" | "max";

export const TIERS: readonly Tier[] = ["free", "plus", "pro", "max"] as const;

/** Plans shown on the marketing pricing section. */
export const MARKETING_TIERS = ["free", "plus"] as const;

export const DEFAULT_TIER: Tier = "free";

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

export const PAID_TIERS = ["plus", "pro", "max"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === "string" && (PAID_TIERS as readonly string[]).includes(value);
}

export interface PlanLimits {
  /** Hard cap. Listening minutes per billing period. */
  listeningMinutesPerMonth: number;
  /** Soft backstop. Combined input+output ask tokens per billing period. */
  askTokensPerMonth: number;
  /**
   * Max saved speaker profiles. `null` = unlimited. Same cap across all tiers
   * today — a system safety limit, not a monetization lever.
   */
  maxSpeakerProfiles: number | null;
  /**
   * Minutes of Speaker recognition (diarization) mode per billing period.
   * `null` = unlimited. Separate from `listeningMinutesPerMonth`, which caps
   * total listening regardless of mode.
   */
  speakerMinutesPerMonth: number | null;
  /** Max connected app integrations. `null` = unlimited (all). */
  maxConnectors: number | null;
  /** Session-history retention window in days. `null` = unlimited. */
  historyRetentionDays: number | null;
  priorityProcessing: boolean;
  earlyAccess: boolean;
}

export interface PlanDisplay {
  /** Display name shown on the pricing page. */
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  /** Highlighted ("Most loved") column on the pricing page. */
  featured: boolean;
  ctaLabel: string;
  /** Human-readable feature bullets for the pricing card. */
  featureBullets: string[];
}

export interface PlanConfig {
  limits: PlanLimits;
  display: PlanDisplay;
}

const HOUR = 60;

/** System safety cap on saved speaker profiles, same for every tier. */
const MAX_SPEAKER_PROFILES = 25;

export const PLANS: Record<Tier, PlanConfig> = {
  free: {
    limits: {
      listeningMinutesPerMonth: 3 * HOUR,
      askTokensPerMonth: 750_000,
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: 2 * HOUR,
      maxConnectors: 1,
      historyRetentionDays: 30,
      priorityProcessing: false,
      earlyAccess: false,
    },
    display: {
      name: "Free",
      priceMonthlyUsd: 0,
      tagline: "Try Kivo in real conversations.",
      featured: false,
      ctaLabel: "Start free",
      featureBullets: [
        "3 hours of listening per month",
        "Real-time transcription",
        "2 hours/month of speaker recognition beta",
        "Live Kivo Q&A",
        "1 app connector",
        "30-day session history",
        "Transcript export",
      ],
    },
  },
  plus: {
    limits: {
      listeningMinutesPerMonth: 10 * HOUR,
      askTokensPerMonth: 1_500_000,
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: 3,
      historyRetentionDays: 365,
      priorityProcessing: false,
      earlyAccess: false,
    },
    display: {
      name: "Plus",
      priceMonthlyUsd: 15,
      tagline: "For regular meetings and conversations.",
      featured: true,
      ctaLabel: "Get Plus",
      featureBullets: [
        "10 hours of listening per month",
        "Unlimited speaker recognition",
        "3 app connectors",
        "1-year session history",
        "Everything in Free",
      ],
    },
  },
  pro: {
    limits: {
      listeningMinutesPerMonth: 30 * HOUR,
      askTokensPerMonth: 4_500_000,
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: null,
      historyRetentionDays: null,
      priorityProcessing: true,
      earlyAccess: false,
    },
    display: {
      name: "Pro",
      priceMonthlyUsd: 25,
      tagline: "For people who use Kivo every day.",
      featured: false,
      ctaLabel: "Choose Pro",
      featureBullets: [
        "30 hours of listening per month",
        "All app connectors",
        "Unlimited session history",
        "Priority processing",
        "Everything in Plus",
      ],
    },
  },
  max: {
    limits: {
      listeningMinutesPerMonth: 60 * HOUR,
      askTokensPerMonth: 9_000_000,
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: null,
      historyRetentionDays: null,
      priorityProcessing: true,
      earlyAccess: true,
    },
    display: {
      name: "Max",
      priceMonthlyUsd: 50,
      tagline: "For heavy usage and early access.",
      featured: false,
      ctaLabel: "Choose Max",
      featureBullets: [
        "60 hours of listening per month",
        "Priority processing",
        "Early access to new features",
        "Everything in Pro",
      ],
    },
  },
};

export function planLimits(tier: Tier): PlanLimits {
  return PLANS[tier].limits;
}

const CONNECTOR_BULLET_RE = /connector/i;

/** Pricing-card bullets — omits connector copy when connectors are disabled. */
export function planFeatureBullets(tier: Tier): string[] {
  const bullets = PLANS[tier].display.featureBullets;
  if (CONNECTORS_ENABLED) return bullets;
  return bullets.filter((b) => !CONNECTOR_BULLET_RE.test(b));
}

/** How often the client pings the server while actively listening. */
export const HEARTBEAT_INTERVAL_MS = 45_000;

/**
 * Maximum listening seconds a single heartbeat may accrue. Caps the damage from
 * clock gaps (tab sleep, network stalls) and concurrent tabs replaying heartbeats —
 * a heartbeat can never bill more than ~2 intervals of wall-clock time.
 */
export const HEARTBEAT_MAX_DELTA_SECONDS = 90;
