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
        <h1 className="text-[10px] font-medium tracking-[0.55em] text-app-muted">
          ENTER
        </h1>
        <p className="mt-3 text-[11px] leading-relaxed text-app-subtle">
          Sign in to open the session.
        </p>
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={submitting}
        className="mb-8 inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-medium tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        GOOGLE
      </button>

      <div className="mb-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--app-border)]" />
        <span className="text-[9px] tracking-[0.28em] text-app-subtle">OR</span>
        <span className="h-px flex-1 bg-[var(--app-border)]" />
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="text-[9px] tracking-[0.2em] text-app-muted">
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
            className="mt-1.5 w-full border-0 border-b border-app bg-transparent py-2 text-sm text-app outline-none transition-colors focus:border-app-strong"
          />
        </label>

        <label className="block">
          <span className="text-[9px] tracking-[0.2em] text-app-muted">
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
            className="mt-1.5 w-full border-0 border-b border-app bg-transparent py-2 text-sm text-app outline-none transition-colors focus:border-app-strong"
          />
        </label>

        {error ? (
          <p className="text-[11px] leading-snug text-red-600 dark:text-red-400/90">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex w-full items-center justify-center rounded-full border border-app-strong bg-surface px-6 py-3 text-sm font-medium tracking-[0.14em] text-app transition-opacity hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
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
        className="mt-6 w-full text-center text-[10px] tracking-[0.12em] text-app-subtle transition-colors hover:text-app-muted"
      >
        {mode === "sign-in" ? "NEW ACCOUNT" : "HAVE ACCOUNT"}
      </button>
    </div>
  );
}
