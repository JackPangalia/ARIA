"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isPaidTier } from "@/lib/plan/tiers";
import { startCheckout } from "@/lib/billing/client";

/**
 * After sign-in, if the URL contains ?checkout=plus|pro|max, redirect to Stripe Checkout once.
 */
export function BillingCheckoutHandler() {
  const searchParams = useSearchParams();
  const checkoutTier = searchParams.get("checkout");
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (tier: string) => {
    if (!isPaidTier(tier)) return;
    try {
      const url = await startCheckout(tier);
      globalThis.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    }
  }, []);

  useEffect(() => {
    if (started.current || !checkoutTier || !isPaidTier(checkoutTier)) return;
    started.current = true;
    void run(checkoutTier);
  }, [checkoutTier, run]);

  if (!error) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] max-w-sm -translate-x-1/2 rounded-lg border border-danger/30 bg-surface px-4 py-3 text-sm text-danger shadow-lg">
      {error}
    </div>
  );
}
