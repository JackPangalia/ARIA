import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm opacity-70">
        That page doesn&apos;t exist. It may have been moved or deleted.
      </p>
      <Link
        href="/"
        className="rounded-full bg-accent px-6 py-2.5 text-sm text-accent-fg transition-opacity hover:opacity-90"
      >
        Back to Kivo
      </Link>
    </main>
  );
}
