"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AuthScreenLoader } from "@/components/firebase/AuthScreenLoader";
import { useAuth } from "@/components/firebase/AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/sign-in");
  }, [user, loading, router]);

  if (loading) return <AuthScreenLoader />;
  if (!user) return <AuthScreenLoader />;

  return <>{children}</>;
}
