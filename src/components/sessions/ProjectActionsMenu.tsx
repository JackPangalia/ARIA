"use client";

import { useEffect, useRef, useState } from "react";
import { HeaderIconButton } from "@/components/sessions/WorkspaceHeader";

function MoreVerticalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="1.75" fill="currentColor" />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" />
      <circle cx="12" cy="19" r="1.75" fill="currentColor" />
    </svg>
  );
}

export function ProjectActionsMenu(props: {
  onEditProject: () => void;
  onArchiveProject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
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

  return (
    <div ref={menuRef} className="relative">
      <HeaderIconButton
        onClick={() => setOpen((current) => !current)}
        label="Project options"
        expanded={open}
      >
        <MoreVerticalIcon />
      </HeaderIconButton>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-app bg-menu p-1.5 shadow-menu">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              props.onEditProject();
            }}
            className="flex w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-app-secondary transition-colors hover:bg-surface-hover hover:text-app"
          >
            Edit project
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              props.onArchiveProject();
            }}
            className="flex w-full rounded-lg px-2.5 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger/10"
          >
            Archive project
          </button>
        </div>
      ) : null}
    </div>
  );
}
