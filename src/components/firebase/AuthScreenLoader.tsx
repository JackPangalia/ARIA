export function AuthScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center appearance-shell">
      <div
        className="h-px w-10 animate-pulse bg-[var(--app-border-strong)]"
        aria-hidden
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}
