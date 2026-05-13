"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/firebase/AuthProvider";

export function SignInForm() {
  const {
    error,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    clearError,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[19rem]">
      <div className="mb-10 text-center">
        <h1 className="text-[10px] font-medium tracking-[0.55em] text-zinc-500">
          ENTER
        </h1>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
          Sign in to open the session.
        </p>
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={submitting}
        className="mb-8 inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium tracking-[0.12em] text-black transition-opacity hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
      >
        GOOGLE
      </button>

      <div className="mb-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-zinc-900" />
        <span className="text-[9px] tracking-[0.28em] text-zinc-700">OR</span>
        <span className="h-px flex-1 bg-zinc-900" />
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-[9px] tracking-[0.2em] text-zinc-600">
            EMAIL
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              clearError();
              setEmail(event.target.value);
            }}
            required
            autoComplete="email"
            className="mt-1.5 w-full border-0 border-b border-zinc-800 bg-transparent py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-zinc-500"
          />
        </label>

        <label className="block">
          <span className="text-[9px] tracking-[0.2em] text-zinc-600">
            PASSWORD
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              clearError();
              setPassword(event.target.value);
            }}
            required
            minLength={6}
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            className="mt-1.5 w-full border-0 border-b border-zinc-800 bg-transparent py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-zinc-500"
          />
        </label>

        {error ? (
          <p className="text-[11px] leading-snug text-red-400/90">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex w-full items-center justify-center rounded-full border border-zinc-600 bg-zinc-900 px-6 py-3 text-sm font-medium tracking-[0.14em] text-zinc-100 transition-opacity hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting
            ? "…"
            : mode === "sign-in"
              ? "SIGN IN"
              : "CREATE"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          clearError();
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
        }}
        className="mt-6 w-full text-center text-[10px] tracking-[0.12em] text-zinc-600 transition-colors hover:text-zinc-400"
      >
        {mode === "sign-in" ? "NEW ACCOUNT" : "HAVE ACCOUNT"}
      </button>
    </div>
  );
}
