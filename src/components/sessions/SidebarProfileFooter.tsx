"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/firebase/AuthProvider";
import { useTheme } from "@/components/theme/ThemeProvider";

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeModeIcon({ dark }: { dark: boolean }) {
  if (dark) {
    return (
      <svg className="h-4 w-4 shrink-0 text-app-muted" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-app-muted" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SidebarProfileFooter(props: { onOpenSettings: () => void }) {
  const { user, signOutUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const displayName = user.displayName ?? user.email?.split("@")[0] ?? "Account";
  const email = user.email ?? "";
  const initial = (displayName[0] ?? "A").toUpperCase();
  const isDark = theme === "dark";

  const itemClass =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-normal text-app-secondary transition-colors hover:bg-surface-hover hover:text-app";

  const onSignOut = async () => {
    setOpen(false);
    await signOutUser();
    router.replace("/sign-in");
  };

  return (
    <div ref={rootRef} className="relative shrink-0 border-t border-app-subtle px-2 py-2">
      {open ? (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl bg-menu py-1.5 shadow-menu ring-1 ring-menu">
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              props.onOpenSettings();
            }}
          >
            <SettingsIcon className="shrink-0 text-app-muted" />
            Settings
          </button>
          <button type="button" className={itemClass} onClick={toggleTheme}>
            <ThemeModeIcon dark={isDark} />
            {isDark ? "Light mode" : "Dark mode"}
          </button>
          <div className="my-1 border-t border-app" />
          <button type="button" className={itemClass} onClick={() => void onSignOut()}>
            <SignOutIcon className="shrink-0 text-app-muted" />
            Sign out
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-600/80 text-sm font-medium text-white">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initial
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-normal text-app">{displayName}</span>
          {email ? (
            <span className="block truncate text-xs font-normal text-app-muted">
              {email}
            </span>
          ) : null}
        </span>
      </button>
    </div>
  );
}
