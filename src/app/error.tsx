"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm opacity-70">
        Kivo hit an unexpected error. Try again — if it keeps happening, email{" "}
        <a className="underline" href="mailto:hello@kivo.ai">
          hello@kivo.ai
        </a>
        .
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-accent px-6 py-2.5 text-sm text-accent-fg transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
