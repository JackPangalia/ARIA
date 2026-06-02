"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/firebase/RequireAuth";

function SettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app?settings=1");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-app text-app-muted">
      Opening settings…
    </div>
  );
}

export function SettingsScreen() {
  return (
    <RequireAuth>
      <SettingsRedirect />
    </RequireAuth>
  );
}
