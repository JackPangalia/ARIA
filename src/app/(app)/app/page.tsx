"use client";

import { Suspense } from "react";
import { SessionWorkspace } from "@/components/sessions/SessionWorkspace";
import { RequireAuth } from "@/components/firebase/RequireAuth";
import { BillingCheckoutHandler } from "@/components/billing/BillingCheckoutHandler";

export default function AppPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <BillingCheckoutHandler />
      </Suspense>
      <SessionWorkspace />
    </RequireAuth>
  );
}
