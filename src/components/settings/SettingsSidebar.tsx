"use client";

import { useAuth } from "@/components/firebase/AuthProvider";
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_NAV_GROUPS,
  SETTINGS_TAB_META,
  type SettingsTab,
} from "@/components/settings/settings-nav";

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

function AppearanceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UsageBillingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ModelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ConnectorsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

const TAB_ICONS: Record<
  SettingsTab,
  (props: { className?: string }) => React.JSX.Element
> = {
  account: AccountIcon,
  appearance: AppearanceIcon,
  usage_billing: UsageBillingIcon,
  model: ModelIcon,
  speakers: SpeakersIcon,
  connectors: ConnectorsIcon,
  trash: TrashIcon,
};

const navRowClass = (active: boolean) =>
  `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app ${
    active
      ? "bg-surface text-app"
      : "text-app-secondary hover:bg-surface-hover hover:text-app"
  }`;

export function SettingsSidebar(props: {
  tab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
}) {
  const { user } = useAuth();
  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "Account";
  const email = user?.email ?? "";
  const initial = (displayName[0] ?? "A").toUpperCase();

  return (
    <aside className="kivo-stagger flex h-full min-h-0 w-full flex-col bg-transparent pl-[env(safe-area-inset-left)]">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-8 pt-7">
        <button
          type="button"
          onClick={() => props.onSelectTab(DEFAULT_SETTINGS_TAB)}
          className={`mb-6 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app ${
            props.tab === "account"
              ? "bg-surface"
              : "hover:bg-surface-hover"
          }`}
        >
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-sm font-medium text-app"
              aria-hidden
            >
              {initial}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-app">
              {displayName}
            </span>
            {email ? (
              <span className="block truncate text-xs text-app-muted">{email}</span>
            ) : null}
          </span>
        </button>

        {SETTINGS_NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="kivo-kicker px-3 pb-2 pt-1">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.tabs.map((tabId) => {
                if (tabId === "account") return null;
                const Icon = TAB_ICONS[tabId];
                const active = props.tab === tabId;
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => props.onSelectTab(tabId)}
                    className={navRowClass(active)}
                  >
                    <Icon className="shrink-0 opacity-80" />
                    <span>{SETTINGS_TAB_META[tabId].label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
