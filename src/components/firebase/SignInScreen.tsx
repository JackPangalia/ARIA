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
    <main className="kivo-auth-shell grid min-h-dvh bg-app lg:grid-cols-[minmax(0,1.05fr)_minmax(30rem,0.75fr)]" id="main-content">
      <section className="relative hidden overflow-hidden border-r border-app-subtle px-12 py-10 lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12">
        <p className="kivo-wordmark relative z-10 select-none text-app">Kivo</p>
        <div className="relative z-10 max-w-[34rem] pb-8">
          <p className="kivo-kicker">In the room with you</p>
          <h1 className="mt-4 font-serif text-[clamp(3.5rem,5.8vw,6.5rem)] font-normal leading-[0.88] tracking-[-0.055em] text-app">
            Keep the conversation moving.
          </h1>
          <p className="mt-7 max-w-md text-base leading-relaxed text-app-muted">
            Kivo listens with the room, answers when you ask, and keeps the summary and transcript ready afterward.
          </p>
        </div>
        <p className="relative z-10 text-xs text-app-subtle">Built for conversations that happen face to face.</p>
      </section>

      <section className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 sm:px-10">
        <p className="kivo-wordmark mb-12 select-none text-app lg:hidden">Kivo</p>
        <div className="w-full max-w-[25rem] rounded-[1.75rem] bg-[color-mix(in_srgb,var(--app-menu)_75%,transparent)] p-6 shadow-[0_24px_70px_color-mix(in_srgb,var(--app-fg)_9%,transparent)] ring-1 ring-menu backdrop-blur-xl sm:p-8">
          <SignInForm />
        </div>
        <div className="mt-7 flex gap-5 text-xs text-app-subtle">
          <a href="/privacy" className="transition-colors hover:text-app">Privacy</a>
          <a href="/terms" className="transition-colors hover:text-app">Terms</a>
        </div>
      </section>
    </main>
  );
}
