"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/firebase/RequireAuth";
import { useAuth } from "@/components/firebase/AuthProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { OrbLayoutToggle } from "@/components/theme/OrbLayoutToggle";

function SettingsContent() {
  const { user, signOutUser } = useAuth();
  const router = useRouter();

  const onSignOut = async () => {
    await signOutUser();
    router.replace("/sign-in");
  };

  if (!user) return null;

  const label = user.displayName ?? user.email ?? "Account";

  return (
    <div className="flex min-h-screen flex-col bg-app px-8 pb-20 pt-24 text-app">
      <header className="mb-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.35em] text-app-subtle transition-colors hover:text-app-muted"
        >
          <span aria-hidden>←</span>
          ARIA
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[19rem] flex-1">
        <h1 className="mb-10 text-[10px] font-medium tracking-[0.55em] text-app-muted">
          SESSION
        </h1>

        <div className="space-y-8 border-t border-app pt-8">
          <ThemeToggle variant="settings" />

          <OrbLayoutToggle variant="settings" />

          <div>
            <p className="text-[9px] tracking-[0.22em] text-app-subtle">
              SIGNED IN AS
            </p>
            <p className="mt-2 text-sm font-normal text-app-secondary">{label}</p>
            {user.email ? (
              <p className="mt-1 text-[11px] text-app-subtle">{user.email}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex w-full items-center justify-center rounded-full border border-app-strong bg-surface px-6 py-3 text-sm font-medium tracking-[0.14em] text-app transition-opacity hover:bg-surface-hover"
          >
            SIGN OUT
          </button>
        </div>
      </main>
    </div>
  );
}

export function SettingsScreen() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}
