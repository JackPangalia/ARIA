"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/firebase/AuthProvider";
import { useTheme } from "@/components/theme/ThemeProvider";
import { getKivoDesktop, isKivoDesktop } from "@/lib/desktop/bridge";

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

function ProfileAvatar(props: { photoURL: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [props.photoURL]);

  const showPhoto = Boolean(props.photoURL) && !failed;

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--app-indigo)_74%,var(--app-surface))] text-sm font-medium text-white">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.photoURL ?? ""}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full rounded-xl object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        props.initial
      )}
    </span>
  );
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
      className="kivo-profile-footer relative shrink-0 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {accountMenu}

      <a
        href="/guide"
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          const desktop = getKivoDesktop();
          if (desktop) {
            event.preventDefault();
            desktop.openExternal(new URL("/guide", window.location.origin).href);
          }
        }}
        className={`kivo-education-help ${props.collapsed ? "is-collapsed" : ""}`}
        aria-label="How to use Kivo (opens in a new tab)"
        title={props.collapsed ? "How to use Kivo" : undefined}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.5a2 2 0 0 1 4 .25c0 1.4-2 1.5-2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="10" cy="13.5" r=".75" fill="currentColor" />
        </svg>
        {!props.collapsed ? <span>How to use Kivo</span> : null}
      </a>

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
        aria-label={isDesktop ? `Account: ${displayName}` : `Settings for ${displayName}`}
        className={`flex w-full flex-nowrap items-center overflow-hidden rounded-xl py-2 text-left transition-colors hover:bg-surface-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app ${
          props.collapsed ? "justify-center px-0" : "gap-3 px-2"
        }`}
      >
        <ProfileAvatar photoURL={user.photoURL ?? null} initial={initial} />
        <span className={`min-w-0 flex-1 ${props.collapsed ? "hidden" : "block"}`}>
          <span className="block truncate text-sm font-normal text-app">{displayName}</span>
          {email ? (
            <span className="block truncate text-xs font-normal text-app-muted">
              {email}
            </span>
          ) : null}
        </span>
        {!props.collapsed && !isDesktop ? <SettingsIcon className="shrink-0 text-app-muted" /> : null}
      </button>
    </div>
  );
}
