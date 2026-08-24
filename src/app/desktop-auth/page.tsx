"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AuthScreenLoader } from "@/components/firebase/AuthScreenLoader";
import { SignInForm } from "@/components/firebase/SignInForm";
import { useAuth } from "@/components/firebase/AuthProvider";
import { auth } from "@/lib/firebase/client";
import {
  buildDesktopAuthDeepLink,
  openDesktopAuthDeepLink,
} from "@/lib/desktop/bridge";

function DesktopAuthScreen() {
  const { user, loading } = useAuth();
  const [phase, setPhase] = useState<"idle" | "minting" | "handoff" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const mintedRef = useRef(false);

  const mintAndHandoff = useCallback(async () => {
    if (mintedRef.current) return;
    mintedRef.current = true;
    setPhase("minting");
    setError(null);

    try {
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Not signed in.");

      const res = await fetch("/api/desktop-auth/token", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const body = (await res.json().catch(() => null)) as
        | { token?: string; error?: string }
        | null;
      if (!res.ok || !body?.token) {
        throw new Error(body?.error ?? "Could not prepare desktop sign-in.");
      }

      const link = buildDesktopAuthDeepLink(body.token);
      setDeepLink(link);
      setPhase("handoff");
      openDesktopAuthDeepLink(link);
      window.setTimeout(() => setPhase("done"), 1200);
    } catch (err) {
      mintedRef.current = false;
      setError(err instanceof Error ? err.message : "Desktop sign-in failed.");
      setPhase("idle");
    }
  }, []);

  useEffect(() => {
    if (loading || !user || mintedRef.current) return;
    void mintAndHandoff();
  }, [user, loading, mintAndHandoff]);

  if (loading) return <AuthScreenLoader />;

  if (user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-app px-6 pb-24">
        <p className="mb-4 text-sm text-app-secondary">
          {phase === "minting"
            ? "Preparing desktop sign-in…"
            : phase === "handoff"
              ? "Opening Kivo…"
              : "Signed in."}
        </p>
        {error ? (
          <p className="mb-4 max-w-sm text-center text-sm text-danger">{error}</p>
        ) : null}
        {deepLink ? (
          <button
            type="button"
            onClick={() => openDesktopAuthDeepLink(deepLink)}
            className="rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-fg"
          >
            Open Kivo
          </button>
        ) : null}
        {error ? (
          <button
            type="button"
            onClick={() => void mintAndHandoff()}
            className="mt-3 text-xs text-app-muted underline"
          >
            Try again
          </button>
        ) : null}
        <p className="mt-6 max-w-sm text-center text-xs text-app-subtle">
          {phase === "done"
            ? "If Kivo did not open, click Open Kivo above. Make sure the Kivo menu-bar app is running, then try again."
            : "Your browser is handing off to the Kivo desktop app."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app px-6 pb-24">
      <p className="mb-14 flex select-none items-baseline gap-2 text-app-secondary">
        <span className="kivo-wordmark">Kivo</span>
        <span className="relative top-[-1px] rounded-full border border-app-subtle/40 px-1.5 py-0.5 text-[8px] font-medium tracking-[0.2em] text-app-subtle">
          DESKTOP
        </span>
      </p>
      <SignInForm />
      <p className="mt-8 max-w-xs text-center text-xs leading-relaxed text-app-subtle">
        After you sign in, your browser will hand off to the Kivo desktop app.
        Keep Kivo running in your menu bar before you sign in.
      </p>
    </div>
  );
}

export default function DesktopAuthPage() {
  return (
    <Suspense fallback={<AuthScreenLoader />}>
      <DesktopAuthScreen />
    </Suspense>
  );
}
