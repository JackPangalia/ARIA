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
      <p className="kivo-wordmark mb-14 select-none text-xs text-app-secondary">
        Kivo
      </p>
      <SignInForm />
    </div>
  );
}
