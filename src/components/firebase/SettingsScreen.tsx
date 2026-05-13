"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/firebase/RequireAuth";
import { useAuth } from "@/components/firebase/AuthProvider";
import { VoiceprintsManager } from "@/components/firebase/VoiceprintsManager";

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
    <div className="flex min-h-screen flex-col bg-black px-8 pb-20 pt-24 text-zinc-100">
      <header className="mb-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.35em] text-zinc-600 transition-colors hover:text-zinc-400"
        >
          <span aria-hidden>←</span>
          ARIA
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[19rem] flex-1">
        <h1 className="mb-10 text-[10px] font-medium tracking-[0.55em] text-zinc-500">
          SESSION
        </h1>

        <div className="space-y-8 border-t border-zinc-900 pt-8">
          <div>
            <p className="text-[9px] tracking-[0.22em] text-zinc-600">
              SIGNED IN AS
            </p>
            <p className="mt-2 text-sm font-normal text-zinc-200">{label}</p>
            {user.email ? (
              <p className="mt-1 text-[11px] text-zinc-600">{user.email}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex w-full items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 px-6 py-3 text-sm font-medium tracking-[0.14em] text-zinc-100 transition-opacity hover:bg-zinc-800"
          >
            SIGN OUT
          </button>
        </div>

        <VoiceprintsManager />
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
