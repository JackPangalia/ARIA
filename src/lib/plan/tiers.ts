/**
 * Canonical subscription-tier configuration.
 *
 * This file is the SINGLE SOURCE OF TRUTH for plan limits and pricing-page copy.
 * Both the server-side enforcement layer and the marketing pricing UI import from
 * here, so the numbers users see can never drift from the numbers we enforce.
 *
 * Pricing model:
 * - Free: 45 minutes / week (~3.0 hrs/mo rolling weekly reset) + 200k tokens / week.
 * - Kivo Pro (Public Featured): $14.99/mo ($144/yr) with 15 hours / month + 3M tokens / month.
 * - Kivo Power (In-App Only): $29.99/mo ($288/yr) with 45 hours / month + 8M tokens / month.
 * - Top-Up Packs: Starter ($5 for 5h) and Pro ($10 for 12h) pre-paid non-expiring hours.
 * - Canonical Real-Time Speaker Diarization across 100% of sessions.
 */

import { CONNECTORS_ENABLED } from "@/lib/features";

export type Tier = "free" | "pro" | "power" | "plus" | "max" | "sigma";

export const TIERS: readonly Tier[] = ["free", "pro", "power"] as const;

/** Plans shown on the public marketing pricing section. */
export const MARKETING_TIERS = ["free", "pro"] as const;

export const DEFAULT_TIER: Tier = "free";

const ALL_KNOWN_TIERS = ["free", "pro", "power", "plus", "max", "sigma"] as const;

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (ALL_KNOWN_TIERS as readonly string[]).includes(value);
}

export const PAID_TIERS = ["pro", "power", "plus", "max", "sigma"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];

export function isPaidTier(value: unknown): value is PaidTier {
  return typeof value === "string" && (PAID_TIERS as readonly string[]).includes(value);
}

export interface PlanLimits {
  /** Hard cap. Listening minutes per billing period (week for Free, month for Pro/Power). */
  listeningMinutesPerMonth: number;
  /** Soft backstop. Combined input+output ask tokens per billing period. */
  askTokensPerMonth: number;
  /** Period cadence: "week" for Free weekly refill, "month" for Pro/Power monthly anchor. */
  periodUnit: "week" | "month";
  /**
   * Max saved speaker profiles. `null` = unlimited. Same cap across all tiers
   * today — a system safety limit, not a monetization lever.
   */
  maxSpeakerProfiles: number | null;
  /**
   * Minutes of Speaker recognition (diarization) mode per billing period.
   * `null` = unlimited. Real-time diarization is standard for all users.
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
  priceAnnualUsd?: number;
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

export interface TopUpPack {
  id: "starter_5h" | "pro_12h";
  name: string;
  priceUsd: number;
  hoursAdded: number;
  secondsAdded: number;
  description: string;
}

export const TOP_UP_PACKS: Record<"starter_5h" | "pro_12h", TopUpPack> = {
  starter_5h: {
    id: "starter_5h",
    name: "Starter Top-Up",
    priceUsd: 5.0,
    hoursAdded: 5,
    secondsAdded: 5 * 3600,
    description: "5 additional hours of listening (never expires)",
  },
  pro_12h: {
    id: "pro_12h",
    name: "Pro Top-Up",
    priceUsd: 10.0,
    hoursAdded: 12,
    secondsAdded: 12 * 3600,
    description: "12 additional hours of listening (never expires)",
  },
};

export const TOP_UP_PACK_LIST: readonly TopUpPack[] = [
  TOP_UP_PACKS.starter_5h,
  TOP_UP_PACKS.pro_12h,
] as const;

const HOUR = 60;

/** System safety cap on saved speaker profiles, same for every tier. */
const MAX_SPEAKER_PROFILES = 25;

export const PLANS: Record<Tier, PlanConfig> = {
  free: {
    limits: {
      listeningMinutesPerMonth: 45, // 45 min / week
      askTokensPerMonth: 200_000,
      periodUnit: "week",
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: 1,
      historyRetentionDays: 30,
      priorityProcessing: false,
      earlyAccess: false,
    },
    display: {
      name: "Free",
      priceMonthlyUsd: 0,
      priceAnnualUsd: 0,
      tagline: "Try Kivo in your weekly meetings & conversations.",
      featured: false,
      ctaLabel: "Start free",
      featureBullets: [
        "45 minutes of listening per week",
        "Real-time transcription with speaker diarization",
        "200k weekly ask tokens (~35 live Q&A asks)",
        "1 app connector",
        "30-day session history",
        "Transcript export",
      ],
    },
  },
  pro: {
    limits: {
      listeningMinutesPerMonth: 15 * HOUR, // 15 hours / month
      askTokensPerMonth: 3_000_000,
      periodUnit: "month",
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: null,
      historyRetentionDays: null,
      priorityProcessing: false,
      earlyAccess: false,
    },
    display: {
      name: "Pro",
      priceMonthlyUsd: 14.99,
      priceAnnualUsd: 144,
      tagline: "For professionals who use Kivo in regular meetings.",
      featured: true,
      ctaLabel: "Get Pro",
      featureBullets: [
        "15 hours of listening per month",
        "Unlimited speaker recognition & voiceprints",
        "3M monthly ask tokens (~150–200 live Q&A asks)",
        "Unlimited app connectors",
        "Unlimited session history",
        "Everything in Free",
      ],
    },
  },
  power: {
    limits: {
      listeningMinutesPerMonth: 45 * HOUR, // 45 hours / month
      askTokensPerMonth: 8_000_000,
      periodUnit: "month",
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: null,
      historyRetentionDays: null,
      priorityProcessing: true,
      earlyAccess: true,
    },
    display: {
      name: "Power",
      priceMonthlyUsd: 29.99,
      priceAnnualUsd: 288,
      tagline: "For heavy meeting loads and power users.",
      featured: false,
      ctaLabel: "Choose Power",
      featureBullets: [
        "45 hours of listening per month",
        "Unlimited speaker recognition & voiceprints",
        "8M monthly ask tokens (~400+ live Q&A asks)",
        "Priority AI processing",
        "Early access to new features",
        "Everything in Pro",
      ],
    },
  },
  // Legacy tier aliases mapped to Pro/Power configurations
  plus: {
    limits: {
      listeningMinutesPerMonth: 15 * HOUR,
      askTokensPerMonth: 3_000_000,
      periodUnit: "month",
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: null,
      historyRetentionDays: null,
      priorityProcessing: false,
      earlyAccess: false,
    },
    display: {
      name: "Plus (Legacy)",
      priceMonthlyUsd: 14.99,
      priceAnnualUsd: 144,
      tagline: "For regular meetings and conversations.",
      featured: false,
      ctaLabel: "Get Pro",
      featureBullets: [
        "15 hours of listening per month",
        "Unlimited speaker recognition",
        "Unlimited session history",
      ],
    },
  },
  sigma: {
    limits: {
      listeningMinutesPerMonth: 15 * HOUR,
      askTokensPerMonth: 3_000_000,
      periodUnit: "month",
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: null,
      historyRetentionDays: null,
      priorityProcessing: false,
      earlyAccess: false,
    },
    display: {
      name: "Pro",
      priceMonthlyUsd: 14.99,
      priceAnnualUsd: 144,
      tagline: "For regular meetings and conversations.",
      featured: true,
      ctaLabel: "Get Pro",
      featureBullets: [
        "15 hours of listening per month",
        "Unlimited speaker recognition",
        "Unlimited session history",
      ],
    },
  },
  max: {
    limits: {
      listeningMinutesPerMonth: 45 * HOUR,
      askTokensPerMonth: 8_000_000,
      periodUnit: "month",
      maxSpeakerProfiles: MAX_SPEAKER_PROFILES,
      speakerMinutesPerMonth: null,
      maxConnectors: null,
      historyRetentionDays: null,
      priorityProcessing: true,
      earlyAccess: true,
    },
    display: {
      name: "Max (Legacy)",
      priceMonthlyUsd: 29.99,
      priceAnnualUsd: 288,
      tagline: "For heavy usage and early access.",
      featured: false,
      ctaLabel: "Choose Power",
      featureBullets: [
        "45 hours of listening per month",
        "Priority processing",
        "Early access to new features",
      ],
    },
  },
};

export function planLimits(tier: Tier): PlanLimits {
  return PLANS[tier]?.limits ?? PLANS.free.limits;
}

const CONNECTOR_BULLET_RE = /connector/i;

/** Pricing-card bullets — omits connector copy when connectors are disabled. */
export function planFeatureBullets(tier: Tier): string[] {
  const bullets = PLANS[tier]?.display.featureBullets ?? [];
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
