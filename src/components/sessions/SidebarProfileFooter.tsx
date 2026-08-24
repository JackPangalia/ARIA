"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/firebase/AuthProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { isKivoDesktop } from "@/lib/desktop/bridge";

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

function useIsDesktopSidebar() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return isKivoDesktop() || window.matchMedia("(min-width: 1024px)").matches;
  });

  useEffect(() => {
    if (isKivoDesktop()) {
      setIsDesktop(true);
      return;
    }
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export function SidebarProfileFooter(props: {
  onOpenSettings: () => void;
  collapsed?: boolean;
}) {
  const { user, signOutUser } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const isDesktop = useIsDesktopSidebar();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    bottom: number;
  } | null>(null);

  useEffect(() => {
    if (!isDesktop) setOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  if (!user) return null;

  const displayName = user.displayName ?? user.email?.split("@")[0] ?? "Account";
  const email = user.email ?? "";
  const initial = (displayName[0] ?? "A").toUpperCase();
  const isDark = resolvedTheme === "dark";

  const itemClass =
    "kivo-popover-row";

  const onSignOut = async () => {
    setOpen(false);
    await signOutUser();
    router.replace("/sign-in");
  };

  const accountMenu =
    open && isDesktop && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              left: menuPosition.left,
              bottom: menuPosition.bottom,
              transformOrigin: "12px calc(100% - 8px)",
            }}
            className="kivo-popover kivo-popover-in kivo-account-menu fixed z-[100] w-[16.75rem]"
          >
            <div className="kivo-account-identity">
              <p className="truncate text-sm font-medium tracking-[-0.02em] text-app">
                {displayName}
              </p>
              {email ? (
                <p className="mt-1 truncate text-xs text-app-muted">{email}</p>
              ) : null}
            </div>
            <div className="px-2 pb-2">
              <p className="px-1.5 pb-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-app-subtle">
                Appearance
              </p>
              <div
                className="kivo-theme-segment"
                role="group"
                aria-label="Appearance"
              >
                <span
                  className="kivo-theme-segment-thumb"
                  data-theme={isDark ? "dark" : "light"}
                  aria-hidden
                />
                <button
                  type="button"
                  aria-pressed={!isDark}
                  onClick={() => setTheme("light")}
                >
                  Light
                </button>
                <button
                  type="button"
                  aria-pressed={isDark}
                  onClick={() => setTheme("dark")}
                >
                  Dark
                </button>
              </div>
            </div>
            <div className="px-1 pb-1">
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
              <div className="mx-2 my-1 border-t border-app-subtle" />
              <button
                type="button"
                className={`${itemClass} is-quiet`}
                onClick={() => void onSignOut()}
              >
                <SignOutIcon className="shrink-0 text-app-muted" />
                Sign out
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className="relative shrink-0 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {accountMenu}

      <button
        type="button"
        onClick={() => {
          if (isDesktop) {
            if (open) {
              setOpen(false);
            } else {
              const rect = rootRef.current?.getBoundingClientRect();
              if (rect) {
                setMenuPosition(
                  props.collapsed
                    ? {
                        left: rect.right + 10,
                        bottom: Math.max(8, window.innerHeight - rect.bottom),
                      }
                    : {
                        left: rect.left + 8,
                        bottom: window.innerHeight - rect.top + 8,
                      },
                );
              }
              setOpen(true);
            }
            return;
          }
          props.onOpenSettings();
        }}
        aria-expanded={isDesktop ? open : undefined}
        className={`flex w-full items-center rounded-xl py-2 text-left transition-colors hover:bg-surface-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app ${
          props.collapsed ? "justify-center px-0" : "gap-3 px-2"
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--app-indigo)_74%,var(--app-surface))] text-sm font-medium text-white">
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
        <span className={`min-w-0 flex-1 ${props.collapsed ? "hidden" : "block"}`}>
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
