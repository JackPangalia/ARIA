"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SettingsSidebar } from "@/components/settings/SettingsSidebar";
import { SettingsView } from "@/components/settings/SettingsView";
import type { SettingsTab } from "@/components/settings/settings-nav";

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Desktop settings surface — a floating modal over the (still-visible, dimmed)
 * app, matching the reference: a fixed-size card, sidebar + content, serif
 * page titles. Mobile keeps the full-screen drill-down in `SettingsMobile`,
 * which self-gates to `lg:hidden`; this is the `lg:flex` complement.
 */
export function SettingsModal(props: {
  open: boolean;
  tab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  onClose: () => void;
  onSessionsChanged?: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!props.open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] hidden items-center justify-center p-6 lg:flex">
      <button
        type="button"
        aria-label="Close settings"
        className="kivo-overlay-in absolute inset-0 bg-overlay backdrop-blur-sm"
        onClick={props.onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="kivo-settings-modal-in relative flex h-[min(720px,88vh)] w-full max-w-[64rem] overflow-hidden rounded-[1.75rem] border border-app-subtle bg-menu shadow-menu ring-1 ring-menu"
      >
        <div className="kivo-settings-sidebar-shell h-full w-60 shrink-0 overflow-y-auto">
          <SettingsSidebar tab={props.tab} onSelectTab={props.onSelectTab} />
        </div>

        <div className="relative min-h-0 min-w-0 flex-1">
          <button
            type="button"
            aria-label="Close settings"
            onClick={props.onClose}
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-app-muted transition-colors hover:bg-surface-hover hover:text-app"
          >
            <CloseIcon />
          </button>
          <SettingsView tab={props.tab} onSessionsChanged={props.onSessionsChanged} />
        </div>
      </div>
    </div>,
    document.body
  );
}
