"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SessionActionsMenu(props: {
  busy?: boolean;
  canEnd: boolean;
  canArchive: boolean;
  onOpenSearch: () => void;
  onEnd: () => void;
  onArchive: () => void;
  /** Dropdown alignment when rendered inside the left sidebar. */
  placement?: "sidebar" | "header";
}) {
  const placement = props.placement ?? "header";
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

  const itemClass =
    "flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-normal text-app-secondary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div ref={rootRef} className="relative z-20">
      <button
        type="button"
        aria-label="Session menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg p-2 text-app-muted transition-colors hover:bg-surface-hover hover:text-app-secondary"
      >
        <MenuIcon />
      </button>

      {open ? (
        <div
          className={`absolute top-full z-50 mt-2 w-52 rounded-xl bg-menu py-1.5 shadow-menu ring-1 ring-menu ${
            placement === "sidebar" ? "left-0" : "right-0"
          }`}
        >
          <ThemeToggle />
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              props.onOpenSearch();
              setOpen(false);
            }}
          >
            Search
          </button>
          <div className="my-1.5 border-t border-app" />
          <button
            type="button"
            disabled={props.busy || !props.canEnd}
            className={itemClass}
            onClick={() => {
              props.onEnd();
              setOpen(false);
            }}
          >
            End session
          </button>
          <button
            type="button"
            disabled={props.busy || !props.canArchive}
            className={itemClass}
            onClick={() => {
              props.onArchive();
              setOpen(false);
            }}
          >
            Archive
          </button>
          <Link
            href="/settings"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
