"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/firebase/AuthProvider";
import { SpeakerProfilesManager } from "@/components/firebase/SpeakerProfilesManager";
import { ConnectorsManager } from "@/components/firebase/ConnectorsManager";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { OrbLayoutToggle } from "@/components/theme/OrbLayoutToggle";
import { ModelToggle } from "@/components/aria/ModelToggle";

type SettingsTab = "appearance" | "speakers" | "connectors" | "account";

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

function AppearanceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 3v18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function SpeakersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 19c.6-2.6 2.85-4.5 5.5-4.5s4.9 1.9 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M16 7a3 3 0 0 1 0 6M17.5 19c-.25-1.6-1.15-3-2.5-3.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ConnectorsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 7h6M9 7H6.5A2.5 2.5 0 0 0 4 9.5v0A2.5 2.5 0 0 0 6.5 12H9m6-5h2.5A2.5 2.5 0 0 1 20 9.5v0A2.5 2.5 0 0 1 17.5 12H15M9 12v3a3 3 0 0 0 3 3v0a3 3 0 0 0 3-3v-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 20c.8-3.2 3.5-5.5 7-5.5s6.2 2.3 7 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const TABS: {
  id: SettingsTab;
  label: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
}[] = [
  { id: "appearance", label: "Appearance", Icon: AppearanceIcon },
  { id: "speakers", label: "Speakers", Icon: SpeakersIcon },
  { id: "connectors", label: "Connectors", Icon: ConnectorsIcon },
  { id: "account", label: "Account", Icon: AccountIcon },
];

export function SettingsModal(props: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const { user } = useAuth();

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "Account";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 bg-overlay/80 backdrop-blur-[2px]"
        onClick={props.onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative z-10 flex h-[min(88vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-app bg-surface shadow-menu"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-app px-5 py-4">
          <h2 id="settings-title" className="text-lg font-normal text-app">
            Settings
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-app-muted transition-colors hover:bg-surface-hover hover:text-app"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <nav className="shrink-0 border-b border-app px-2 py-3 sm:border-b-0 sm:border-r sm:py-4">
            <ul className="flex gap-1 sm:flex-col">
              {TABS.map((item) => {
                const active = tab === item.id;
                const Icon = item.Icon;
                return (
                  <li key={item.id} className="flex-1 sm:flex-none">
                    <button
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-normal transition-colors ${
                        active
                          ? "bg-surface-hover text-app"
                          : "text-app-muted hover:bg-surface-hover hover:text-app-secondary"
                      }`}
                    >
                      <Icon
                        className={`shrink-0 ${active ? "text-app" : "text-app-muted"}`}
                      />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            {tab === "appearance" ? (
              <div className="space-y-8">
                <section>
                  <h3 className="mb-4 text-sm font-normal text-app-muted">Theme</h3>
                  <ThemeToggle variant="settings" />
                </section>
                <section className="border-t border-app pt-8">
                  <h3 className="mb-4 text-sm font-normal text-app-muted">Orb position</h3>
                  <OrbLayoutToggle variant="settings" />
                </section>
                <section className="border-t border-app pt-8">
                  <h3 className="mb-1 text-sm font-normal text-app-muted">Model</h3>
                  <p className="mb-4 text-xs leading-relaxed text-app-subtle">
                    Choose how ARIA thinks. You can switch anytime.
                  </p>
                  <ModelToggle />
                </section>
              </div>
            ) : null}

            {tab === "speakers" ? (
              <section>
                <h3 className="mb-1 text-sm font-normal text-app">Speaker profiles</h3>
                <p className="mb-6 text-sm font-normal leading-relaxed text-app-muted">
                  Teach ARIA who is speaking. Enroll one person at a time in a quiet room.
                </p>
                <SpeakerProfilesManager embedded />
              </section>
            ) : null}

            {tab === "connectors" ? <ConnectorsManager /> : null}

            {tab === "account" ? (
              <section className="space-y-6">
                <div className="flex items-center gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/80 to-violet-600/80 text-lg font-medium text-white">
                    {(displayName[0] ?? "A").toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-normal text-app">{displayName}</p>
                    {user?.email ? (
                      <p className="mt-0.5 text-sm text-app-muted">{user.email}</p>
                    ) : null}
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-app-muted">
                  Signed in with Firebase. Use the profile menu in the sidebar to sign out.
                </p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
