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
    <div className="w-full">
      <div className="mb-8 text-left">
        <p className="kivo-kicker">Welcome back</p>
        <h1 className="mt-2 font-serif text-[2.25rem] font-normal leading-tight tracking-[-0.04em] text-app">
          {mode === "sign-in" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-app-muted">
          {mode === "sign-in" ? "Open your conversations and pick up where you left off." : "Set up Kivo for your next in-person conversation."}
        </p>
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={submitting}
        className="mb-7 inline-flex w-full items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-semibold tracking-[-0.018em] text-accent-fg transition-[opacity,transform] hover:-translate-y-0.5 hover:opacity-90 active:translate-y-px active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continue with Google
      </button>

      <div className="mb-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--app-border)]" />
        <span className="kivo-kicker">or</span>
        <span className="h-px flex-1 bg-[var(--app-border)]" />
      </div>

      <form className="space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className="kivo-kicker">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              clearError();
              setEmail(event.target.value);
            }}
            required
            autoComplete="email"
            className="mt-2 w-full rounded-xl border border-app bg-input px-3.5 py-2.5 text-sm text-app outline-none transition-[border-color,box-shadow] focus:border-[color-mix(in_srgb,var(--app-indigo)_65%,var(--app-border-strong))] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--app-indigo)_12%,transparent)]"
          />
        </label>

        <label className="block">
          <span className="kivo-kicker">Password</span>
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
            className="mt-2 w-full rounded-xl border border-app bg-input px-3.5 py-2.5 text-sm text-app outline-none transition-[border-color,box-shadow] focus:border-[color-mix(in_srgb,var(--app-indigo)_65%,var(--app-border-strong))] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--app-indigo)_12%,transparent)]"
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
          className="mt-1 inline-flex w-full items-center justify-center rounded-xl border border-app-strong bg-surface px-6 py-3 text-sm font-semibold tracking-[-0.018em] text-app transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-surface-hover active:translate-y-px active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting
            ? "…"
            : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          clearError();
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
        }}
        className="mt-6 w-full text-center text-sm text-app-subtle transition-colors hover:text-app-muted"
      >
        {mode === "sign-in" ? "New account" : "Have an account?"}
      </button>
    </div>
  );
}
