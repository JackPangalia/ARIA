export function AuthScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div
        className="h-px w-10 animate-pulse bg-zinc-700"
        aria-hidden
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}
