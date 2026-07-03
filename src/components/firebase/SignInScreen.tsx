"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { AuthScreenLoader } from "@/components/firebase/AuthScreenLoader";
import { SignInForm } from "@/components/firebase/SignInForm";
import { useAuth } from "@/components/firebase/AuthProvider";
import { isPaidTier } from "@/lib/plan/tiers";

export function SignInScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading && user) {
      const plan = searchParams.get("plan");
      if (plan && isPaidTier(plan)) {
        router.replace(`/app?checkout=${plan}`);
      } else {
        router.replace("/app");
      }
    }
  }, [user, loading, router, searchParams]);

  if (loading) return <AuthScreenLoader />;
  if (user) return <AuthScreenLoader />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app px-6 pb-24">
      <p className="mb-14 flex select-none items-baseline gap-2 text-xs font-medium tracking-[0.55em] text-app-secondary">
        KIVO
        <span className="relative top-[-1px] rounded-full border border-app-subtle/40 px-1.5 py-0.5 text-[8px] font-medium tracking-[0.2em] text-app-subtle">
          BETA
        </span>
      </p>
      <SignInForm />
    </div>
  );
}
