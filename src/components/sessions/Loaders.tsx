/**
 * Loading cues shared across the app.
 *
 * Two rules hold everywhere:
 * - Nothing appears for the first ~220ms (`kivo-loader-delayed`). A fetch that
 *   lands inside that window should look instant; flashing a spinner at it
 *   makes a fast app feel slow.
 * - A wait is drawn in the shape of what is arriving where that shape is known:
 *   a conversation shows its own header and transcript rows. A whole-page load
 *   has no shape yet, so it gets a plain spinner.
 */

/** The app-level cue: an ordinary spinner, centred in whatever fills the screen. */
export function BootLoader({ label = "Loading Kivo" }: { label?: string }) {
  return (
    <div
      className="kivo-loader-delayed flex min-h-0 flex-1 items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <span className="kivo-boot-spinner" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Full-screen variant for route and auth gates, which have no shell yet. */
export function BootScreen({ label }: { label?: string }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-app">
      <BootLoader label={label} />
    </div>
  );
}

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <span className={`kivo-spinner inline-block ${className}`} aria-hidden />;
}

/**
 * The shape of a conversation, drawn before its content lands: the title the
 * list already knew, then transcript-sized rows. Opening a conversation moves
 * to this immediately, so the click never lands on the old screen.
 */
export function SessionOpeningSkeleton({ title }: { title?: string | null }) {
  return (
    <div className="kivo-fade-in flex min-h-0 flex-1 flex-col" aria-live="polite">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-3">
          {title ? (
            <h2 className="font-serif text-[1.6rem] leading-tight tracking-[-0.03em] text-app-muted">
              {title}
            </h2>
          ) : (
            <div className="kivo-skeleton h-6 w-56 rounded-full" />
          )}
          <div className="kivo-progress-track kivo-loader-delayed w-40" />
        </div>

        <div className="kivo-skeleton-wave kivo-loader-delayed flex flex-col gap-5">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex flex-col gap-2">
              <div
                className="kivo-skeleton h-3 w-24 rounded-full"
                style={
                  { "--kivo-skeleton-index": row * 2 } as React.CSSProperties
                }
              />
              <div
                className="kivo-skeleton h-4 rounded-full"
                style={
                  {
                    "--kivo-skeleton-index": row * 2 + 1,
                    width: `${92 - row * 11}%`,
                  } as React.CSSProperties
                }
              />
              <div
                className="kivo-skeleton h-4 rounded-full"
                style={
                  {
                    "--kivo-skeleton-index": row * 2 + 2,
                    width: `${74 - row * 9}%`,
                  } as React.CSSProperties
                }
              />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Opening conversation</span>
    </div>
  );
}
