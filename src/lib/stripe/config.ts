import { z } from "zod";
import type { PaidTier, Tier } from "@/lib/plan/tiers";
import { TOP_UP_PACKS } from "@/lib/plan/tiers";

const BillingEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_ANNUAL: z.string().optional(),
  STRIPE_PRICE_POWER: z.string().optional(),
  STRIPE_PRICE_POWER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_POWER_ANNUAL: z.string().optional(),
  STRIPE_PRICE_PLUS: z.string().optional(),
  STRIPE_PRICE_MAX: z.string().optional(),
  STRIPE_PRICE_TOPUP_5H: z.string().optional(),
  STRIPE_PRICE_TOPUP_12H: z.string().optional(),
  APP_URL: z.string().url(),
});

export type BillingEnv = z.infer<typeof BillingEnvSchema>;

let cached: BillingEnv | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      (process.env.STRIPE_PRICE_PRO ||
        process.env.STRIPE_PRICE_PRO_MONTHLY ||
        process.env.STRIPE_PRICE_PLUS) &&
      process.env.APP_URL
  );
}

export function getBillingEnv(): BillingEnv {
  if (cached) return cached;
  const parsed = BillingEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Stripe billing is not configured: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`
    );
  }
  cached = parsed.data;
  return cached;
}

export type { PaidTier } from "@/lib/plan/tiers";
export { isPaidTier } from "@/lib/plan/tiers";

export function priceIdForTier(
  tier: PaidTier,
  env: BillingEnv,
  interval: "month" | "year" = "month"
): string {
  if (interval === "year") {
    if (tier === "power" || tier === "max") {
      return (
        env.STRIPE_PRICE_POWER_ANNUAL ??
        env.STRIPE_PRICE_POWER_MONTHLY ??
        env.STRIPE_PRICE_POWER ??
        env.STRIPE_PRICE_MAX ??
        ""
      );
    }
    return (
      env.STRIPE_PRICE_PRO_ANNUAL ??
      env.STRIPE_PRICE_PRO_MONTHLY ??
      env.STRIPE_PRICE_PRO ??
      env.STRIPE_PRICE_PLUS ??
      ""
    );
  }

  switch (tier) {
    case "power":
    case "max":
      return (
        env.STRIPE_PRICE_POWER_MONTHLY ??
        env.STRIPE_PRICE_POWER ??
        env.STRIPE_PRICE_MAX ??
        ""
      );
    case "pro":
    case "plus":
    case "sigma":
    default:
      return (
        env.STRIPE_PRICE_PRO_MONTHLY ??
        env.STRIPE_PRICE_PRO ??
        env.STRIPE_PRICE_PLUS ??
        ""
      );
  }
}

export function tierFromPriceId(priceId: string, env: BillingEnv): Tier | null {
  if (
    priceId &&
    (priceId === env.STRIPE_PRICE_POWER ||
      priceId === env.STRIPE_PRICE_POWER_MONTHLY ||
      priceId === env.STRIPE_PRICE_POWER_ANNUAL ||
      priceId === env.STRIPE_PRICE_MAX)
  ) {
    return "power";
  }
  if (
    priceId &&
    (priceId === env.STRIPE_PRICE_PRO ||
      priceId === env.STRIPE_PRICE_PRO_MONTHLY ||
      priceId === env.STRIPE_PRICE_PRO_ANNUAL ||
      priceId === env.STRIPE_PRICE_PLUS)
  ) {
    return "pro";
  }
  return null;
}

export function topUpPackFromPriceId(
  priceId: string,
  env: BillingEnv
): "starter_5h" | "pro_12h" | null {
  if (priceId === env.STRIPE_PRICE_TOPUP_5H) return "starter_5h";
  if (priceId === env.STRIPE_PRICE_TOPUP_12H) return "pro_12h";
  return null;
}

export function priceIdForTopUp(
  packId: "starter_5h" | "pro_12h",
  env: BillingEnv
): string | null {
  if (packId === "starter_5h") return env.STRIPE_PRICE_TOPUP_5H ?? null;
  if (packId === "pro_12h") return env.STRIPE_PRICE_TOPUP_12H ?? null;
  return null;
}
