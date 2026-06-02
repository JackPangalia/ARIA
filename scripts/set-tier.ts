// Admin CLI to set a user's subscription tier — the manual stand-in until Stripe.
//
//   npm run set-tier -- <uid> <free|plus|pro|max>
//
// Requires Firebase Admin env (FIREBASE_SERVICE_ACCOUNT_JSON, or
// FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY). Loads .env.local for local runs.

try {
  (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(
    ".env.local"
  );
} catch {
  // No .env.local — rely on the real environment.
}

import { isTier, TIERS } from "@/lib/plan/tiers";
import { getOrCreatePlan, setUserTier } from "@/lib/plan/repository";

async function main() {
  const [uid, tier] = process.argv.slice(2);

  if (!uid || !tier) {
    console.error("Usage: npm run set-tier -- <uid> <" + TIERS.join("|") + ">");
    process.exit(1);
  }
  if (!isTier(tier)) {
    console.error(`Invalid tier "${tier}". Must be one of: ${TIERS.join(", ")}`);
    process.exit(1);
  }

  await setUserTier(uid, tier);
  const plan = await getOrCreatePlan(uid);
  console.log(
    `✓ ${uid} → ${plan.tier} (billing anchor day ${plan.billingAnchorDay})`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to set tier:", err instanceof Error ? err.message : err);
  process.exit(1);
});
