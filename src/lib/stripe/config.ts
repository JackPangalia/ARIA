import { z } from "zod";
import type { PaidTier, Tier } from "@/lib/plan/tiers";

const BillingEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_PLUS: z.string().min(1),
  STRIPE_PRICE_PRO: z.string().min(1),
  STRIPE_PRICE_MAX: z.string().min(1),
  APP_URL: z.string().url(),
});

export type BillingEnv = z.infer<typeof BillingEnvSchema>;

let cached: BillingEnv | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_PLUS &&
      process.env.STRIPE_PRICE_PRO &&
      process.env.STRIPE_PRICE_MAX &&
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

export function priceIdForTier(tier: PaidTier, env: BillingEnv): string {
  switch (tier) {
    case "plus":
      return env.STRIPE_PRICE_PLUS;
    case "pro":
      return env.STRIPE_PRICE_PRO;
    case "max":
      return env.STRIPE_PRICE_MAX;
  }
}

export function tierFromPriceId(priceId: string, env: BillingEnv): Tier | null {
  if (priceId === env.STRIPE_PRICE_PLUS) return "plus";
  if (priceId === env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === env.STRIPE_PRICE_MAX) return "max";
  return null;
}
