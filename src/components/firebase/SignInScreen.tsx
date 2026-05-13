"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthScreenLoader } from "@/components/firebase/AuthScreenLoader";
import { SignInForm } from "@/components/firebase/SignInForm";
import { useAuth } from "@/components/firebase/AuthProvider";

export function SignInScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  if (loading) return <AuthScreenLoader />;
  if (user) return <AuthScreenLoader />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 pb-24">
      <p className="mb-14 select-none text-xs font-medium tracking-[0.55em] text-zinc-300">
        ARIA
      </p>
      <SignInForm />
    </div>
  );
}
