"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/firebase/AuthProvider";
import { SpeakerProfilesManager } from "@/components/firebase/SpeakerProfilesManager";
import { ConnectorsManager } from "@/components/firebase/ConnectorsManager";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CONNECTORS_ENABLED } from "@/lib/features";
import { deleteAccount } from "@/lib/account/client";
import {
  getAnswerModelPreference,
  getTranscriptionModePreference,
  updateAnswerModelPreference,
  updateTranscriptionModePreference,
  type AnswerModelPreference,
  type TranscriptionModePreference,
} from "@/lib/plan/client";
import type { AskModelId } from "@/lib/aria/models";
import {
  deleteSession,
  listSessions,
  patchSession,
} from "@/lib/sessions/client";
import type { SessionDoc, TranscriptionMode } from "@/lib/sessions/types";
import { BillingPanel } from "@/components/billing/BillingPanel";
import { UsageMeter } from "@/components/aria/UsageMeter";
import {
  GrokSettingsButton,
  GrokSettingsRow,
} from "@/components/settings/SettingsRow";

type SettingsTab =
  | "account"
  | "usage"
  | "billing"
  | "appearance"
  | "model"
  | "speakers"
  | "connectors"
  | "trash";

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

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 18l6-6-6-6"
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

function UsageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 19V13M11 19V9M18 19V5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BillingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
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

const ALL_TABS: {
  id: SettingsTab;
  label: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
}[] = [
  { id: "account", label: "Account", Icon: AccountIcon },
  { id: "usage", label: "Usage", Icon: UsageIcon },
  { id: "billing", label: "Billing", Icon: BillingIcon },
  { id: "appearance", label: "Appearance", Icon: AppearanceIcon },
  { id: "model", label: "Model", Icon: ModelIcon },
  { id: "speakers", label: "Speakers", Icon: SpeakersIcon },
  { id: "connectors", label: "Connectors", Icon: ConnectorsIcon },
  { id: "trash", label: "Trash", Icon: TrashIcon },
];

const TABS = CONNECTORS_ENABLED
  ? ALL_TABS
  : ALL_TABS.filter((tab) => tab.id !== "connectors");

const TAB_BY_ID = Object.fromEntries(TABS.map((tab) => [tab.id, tab])) as Record<
  SettingsTab,
  (typeof TABS)[number]
>;

const MOBILE_MENU_GROUPS: { label: string; tabs: SettingsTab[] }[] = [
  { label: "App", tabs: ["usage", "appearance", "billing"] },
  {
    label: "Kivo",
    tabs: CONNECTORS_ENABLED
      ? ["model", "speakers", "connectors", "trash"]
      : ["model", "speakers", "trash"],
  },
];

function openMobileTab(
  tab: SettingsTab,
  setTab: (tab: SettingsTab) => void,
  setMobileScreen: (screen: "menu" | SettingsTab) => void
) {
  setTab(tab);
  setMobileScreen(tab);
}

function DeleteAccountDialog(props: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!props.open) setConfirmText("");
  }, [props.open]);

  if (!props.open) return null;

  const canConfirm = confirmText === "DELETE";

  return (
    <div className="grok-settings-delete-overlay absolute inset-0 z-30 flex items-center justify-center rounded-[16px] p-6">
      <div
        role="alertdialog"
        aria-labelledby="delete-account-title"
        className="grok-settings-delete-dialog w-full max-w-sm rounded-[12px] p-5"
      >
        <h3
          id="delete-account-title"
          className="grok-settings-delete-title text-sm font-medium"
        >
          Delete account?
        </h3>
        <p className="grok-settings-delete-desc mt-2 text-[13px] leading-relaxed">
          This permanently removes your account, sessions, speaker profiles, and
          connected apps. Type DELETE to confirm.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          className="grok-settings-input mt-4"
          autoFocus
        />
        {props.error ? (
          <p className="grok-settings-delete-error mt-2 text-xs">{props.error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <GrokSettingsButton variant="ghost" onClick={props.onClose} disabled={props.busy}>
            Cancel
          </GrokSettingsButton>
          <GrokSettingsButton
            danger
            disabled={!canConfirm || props.busy}
            onClick={props.onConfirm}
          >
            {props.busy ? "Deleting…" : "Delete account"}
          </GrokSettingsButton>
        </div>
      </div>
    </div>
  );
}

function TrashPanel(props: {
  open: boolean;
  onSessionsChanged?: () => void;
}) {
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listSessions({ status: "trashed", limit: 100 });
      setSessions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trash.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (props.open) void refresh();
  }, [props.open, refresh]);

  const handleRestore = async (sessionId: string) => {
    setBusyId(sessionId);
    setError(null);
    try {
      await patchSession(sessionId, { status: "active" });
      setSessions((list) => list.filter((s) => s.id !== sessionId));
      props.onSessionsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handlePermanentDelete = async (sessionId: string) => {
    setBusyId(sessionId);
    setError(null);
    try {
      await deleteSession(sessionId);
      setSessions((list) => list.filter((s) => s.id !== sessionId));
      setConfirmDeleteId(null);
      props.onSessionsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <p className="grok-settings-section-title">Trash</p>
      <p className="grok-settings-section-desc">
        Trashed sessions are hidden from the sidebar. Restore them or delete
        them forever.
      </p>

      {error ? (
        <p className="grok-settings-delete-error mt-2 text-xs">{error}</p>
      ) : null}

      {loading ? (
        <p className="grok-settings-row-sub mt-4">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="grok-settings-row-sub mt-4">Trash is empty.</p>
      ) : (
        <div className="mt-2">
          {sessions.map((session) => {
            const confirming = confirmDeleteId === session.id;
            const trashedAt = session.trashedAt
              ? new Date(session.trashedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null;

            return (
              <GrokSettingsRow
                key={session.id}
                title={<span className="font-medium">{session.title}</span>}
                description={trashedAt ? `Trashed ${trashedAt}` : undefined}
                action={
                  confirming ? (
                    <div className="flex gap-2">
                      <GrokSettingsButton
                        variant="ghost"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={busyId === session.id}
                      >
                        Cancel
                      </GrokSettingsButton>
                      <GrokSettingsButton
                        danger
                        disabled={busyId === session.id}
                        onClick={() => void handlePermanentDelete(session.id)}
                      >
                        {busyId === session.id ? "Deleting…" : "Confirm"}
                      </GrokSettingsButton>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <GrokSettingsButton
                        disabled={busyId === session.id}
                        onClick={() => void handleRestore(session.id)}
                      >
                        Restore
                      </GrokSettingsButton>
                      <GrokSettingsButton
                        danger
                        disabled={busyId === session.id}
                        onClick={() => setConfirmDeleteId(session.id)}
                      >
                        Delete forever
                      </GrokSettingsButton>
                    </div>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function BetaBadge() {
  return (
    <span className="relative top-[-1px] ml-1.5 rounded-full border border-app-subtle/40 px-1 py-0.5 text-[7px] font-medium tracking-[0.2em] text-app-muted">
      BETA
    </span>
  );
}

function formatMinutes(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function TranscriptionModeSettings() {
  const [preference, setPreference] =
    useState<TranscriptionModePreference | null>(null);
  const [busyMode, setBusyMode] = useState<TranscriptionMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTranscriptionModePreference()
      .then((data) => {
        if (!cancelled) setPreference(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load transcription mode."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectMode = async (mode: TranscriptionMode) => {
    if (!preference || preference.effectiveTranscriptionMode === mode) return;
    setBusyMode(mode);
    setError(null);
    try {
      const next = await updateTranscriptionModePreference(mode);
      setPreference(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update transcription mode."
      );
    } finally {
      setBusyMode(null);
    }
  };

  const activeMode = preference?.effectiveTranscriptionMode ?? "basic";
  const speakerLocked = preference?.speakerModeLocked ?? true;
  const speakerExhausted = preference?.speakerModeExhausted ?? false;
  const speakerRemaining = preference?.speakerSecondsRemaining ?? null;
  const speakerCapped = preference != null && preference.speakerSecondsCap !== null;

  let speakerDescription = "Use enrolled speaker profiles and Speechmatics diarization.";
  if (speakerCapped) {
    speakerDescription = speakerExhausted
      ? "You've used this month's Speaker recognition minutes. Upgrade for unlimited access."
      : `${formatMinutes(speakerRemaining ?? 0)} left this month · uses enrolled speaker profiles.`;
  }

  return (
    <section className="mb-6">
      <p className="grok-settings-section-title">Transcription mode</p>
      <p className="grok-settings-section-desc">
        Choose the default for new sessions. Existing and active sessions keep
        the mode they started with.
      </p>

      {error ? (
        <p className="grok-settings-delete-error mt-2 text-xs">{error}</p>
      ) : null}

      <div className="mt-2">
        <GrokSettingsRow
          title={<span className="font-medium">Basic transcription</span>}
          description="Lower-cost live transcript and Kivo Q&A. No speaker labels."
          action={
            <GrokSettingsButton
              disabled={!preference || activeMode === "basic" || busyMode !== null}
              onClick={() => void selectMode("basic")}
            >
              {busyMode === "basic"
                ? "Saving…"
                : activeMode === "basic"
                  ? "Current"
                  : "Use Basic"}
            </GrokSettingsButton>
          }
        />
        <GrokSettingsRow
          title={
            <span className="font-medium">
              Speaker recognition
              <BetaBadge />
            </span>
          }
          description={speakerDescription}
          action={
            <GrokSettingsButton
              disabled={
                !preference ||
                speakerLocked ||
                activeMode === "speaker" ||
                busyMode !== null
              }
              onClick={() => void selectMode("speaker")}
            >
              {speakerLocked
                ? "Used up"
                : busyMode === "speaker"
                  ? "Saving…"
                  : activeMode === "speaker"
                    ? "Current"
                    : "Use Speaker"}
            </GrokSettingsButton>
          }
        />
      </div>
    </section>
  );
}

function AnswerModelSettings() {
  const [preference, setPreference] = useState<AnswerModelPreference | null>(null);
  const [busyModel, setBusyModel] = useState<AskModelId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAnswerModelPreference()
      .then((data) => {
        if (!cancelled) setPreference(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load model preference.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectModel = async (id: AskModelId) => {
    if (!preference || preference.current === id) return;
    setBusyModel(id);
    setError(null);
    try {
      const next = await updateAnswerModelPreference(id);
      setPreference(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update model.");
    } finally {
      setBusyModel(null);
    }
  };

  const options = preference?.options ?? [];
  const current = preference?.current ?? null;

  return (
    <section className="mb-6">
      <p className="grok-settings-section-title">Answer model</p>
      <p className="grok-settings-section-desc">
        Choose which model answers when you ask Kivo a question. Faster models
        respond quicker; slower models tend to answer with more nuance.
      </p>

      {error ? <p className="grok-settings-delete-error mt-2 text-xs">{error}</p> : null}

      <div className="mt-2">
        {options.map((option) => (
          <GrokSettingsRow
            key={option.id}
            title={<span className="font-medium">{option.label}</span>}
            description={option.description}
            action={
              <GrokSettingsButton
                disabled={!preference || current === option.id || busyModel !== null}
                onClick={() => void selectModel(option.id)}
              >
                {busyModel === option.id
                  ? "Saving…"
                  : current === option.id
                    ? "Current"
                    : "Use this"}
              </GrokSettingsButton>
            }
          />
        ))}
      </div>
    </section>
  );
}

function SettingsTabContent(props: {
  tab: SettingsTab;
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  signOutBusy: boolean;
  onSignOut: () => void;
  user: ReturnType<typeof useAuth>["user"];
  onSessionsChanged?: () => void;
}) {
  const displayName = props.user?.displayName ?? props.user?.email?.split("@")[0] ?? "Account";
  const email = props.user?.email ?? "";
  const initial = (displayName[0] ?? "A").toUpperCase();

  if (props.tab === "account") {
    return (
      <div>
        <GrokSettingsRow
          icon={
            props.user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.user.photoURL}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                }}
              >
                {initial}
              </span>
            )
          }
          title={<span className="font-medium">{displayName}</span>}
          description={email || undefined}
        />
        <GrokSettingsRow
          title="Sign out"
          action={
            <GrokSettingsButton disabled={props.signOutBusy} onClick={props.onSignOut}>
              {props.signOutBusy ? "…" : "Sign out"}
            </GrokSettingsButton>
          }
        />
        <GrokSettingsRow
          title="Delete account"
          action={
            <GrokSettingsButton danger onClick={() => props.setDeleteOpen(true)}>
              Delete
            </GrokSettingsButton>
          }
        />
      </div>
    );
  }

  if (props.tab === "usage") {
    return (
      <section>
        <p className="grok-settings-section-title">Usage this month</p>
        <p className="grok-settings-section-desc">
          Listening time and Kivo Q&A usage against your plan&apos;s monthly
          limits.
        </p>
        <div className="mt-3">
          <UsageMeter />
        </div>
      </section>
    );
  }

  if (props.tab === "appearance") {
    return (
      <section>
        <ThemeToggle variant="settings" />
      </section>
    );
  }

  if (props.tab === "billing") {
    return <BillingPanel />;
  }

  if (props.tab === "model") {
    return (
      <section>
        <AnswerModelSettings />
      </section>
    );
  }

  if (props.tab === "speakers") {
    return (
      <section>
        <TranscriptionModeSettings />
        <p className="grok-settings-section-title">Speaker profiles</p>
        <p className="grok-settings-section-desc">
          Teach Kivo who is speaking. Enroll one person at a time in a quiet room.
        </p>
        <SpeakerProfilesManager embedded grok />
      </section>
    );
  }

  if (props.tab === "connectors") {
    if (!CONNECTORS_ENABLED) return null;
    return <ConnectorsManager grok />;
  }

  if (props.tab === "trash") {
    return (
      <TrashPanel open onSessionsChanged={props.onSessionsChanged} />
    );
  }

  return null;
}

function SettingsModalPanel(props: {
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
  mobileScreen: "menu" | SettingsTab;
  setMobileScreen: (screen: "menu" | SettingsTab) => void;
  onClose: () => void;
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  deleteBusy: boolean;
  deleteError: string | null;
  onDeleteAccount: () => void;
  signOutBusy: boolean;
  onSignOut: () => void;
  user: ReturnType<typeof useAuth>["user"];
  onSessionsChanged?: () => void;
}) {
  const displayName = props.user?.displayName ?? props.user?.email?.split("@")[0] ?? "Account";
  const email = props.user?.email ?? "";
  const initial = (displayName[0] ?? "A").toUpperCase();
  const activeMobileTab = props.mobileScreen === "menu" ? null : props.mobileScreen;
  const activeMobileLabel = TABS.find((item) => item.id === activeMobileTab)?.label ?? "";

  const tabContentProps = {
    deleteOpen: props.deleteOpen,
    setDeleteOpen: props.setDeleteOpen,
    signOutBusy: props.signOutBusy,
    onSignOut: props.onSignOut,
    user: props.user,
    onSessionsChanged: props.onSessionsChanged,
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="grok-settings-modal grok-settings-modal--full relative z-10 flex min-h-0 flex-col overflow-hidden"
    >
      <DeleteAccountDialog
        open={props.deleteOpen}
        busy={props.deleteBusy}
        error={props.deleteError}
        onClose={() => props.setDeleteOpen(false)}
        onConfirm={props.onDeleteAccount}
      />

      {/* Mobile: stacked navigation (menu → detail) */}
      <div className="grok-settings-mobile flex min-h-0 flex-1 flex-col sm:hidden">
        {props.mobileScreen === "menu" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="grok-settings-stack-header grok-settings-stack-header--root">
              <button
                type="button"
                onClick={props.onClose}
                aria-label="Close settings"
                className="grok-settings-stack-pill-btn"
              >
                <CloseIcon />
              </button>
              <h2 id="settings-title" className="grok-settings-stack-title grok-settings-stack-title--center">
                Settings
              </h2>
            </header>
            <div className="grok-settings-mobile-body flex-1 overflow-y-auto">
              <button
                type="button"
                className="grok-settings-profile-card"
                onClick={() =>
                  openMobileTab("account", props.setTab, props.setMobileScreen)
                }
              >
                {props.user?.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={props.user.photoURL}
                    alt=""
                    className="grok-settings-profile-avatar object-cover"
                  />
                ) : (
                  <span
                    className="grok-settings-profile-avatar grok-settings-profile-avatar--fallback"
                    aria-hidden
                  >
                    {initial}
                  </span>
                )}
                <span className="grok-settings-profile-copy">
                  <span className="grok-settings-profile-name">{displayName}</span>
                  {email ? (
                    <span className="grok-settings-profile-email">{email}</span>
                  ) : null}
                </span>
                <ChevronRightIcon className="grok-settings-menu-chevron shrink-0" />
              </button>

              {MOBILE_MENU_GROUPS.map((group) => (
                <section key={group.label} className="grok-settings-menu-section">
                  <p className="grok-settings-menu-section-label">{group.label}</p>
                  <div className="grok-settings-menu-card">
                    {group.tabs.map((tabId, index) => {
                      const item = TAB_BY_ID[tabId];
                      const Icon = item.Icon;
                      const isLast = index === group.tabs.length - 1;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`grok-settings-menu-row${isLast ? "" : " grok-settings-menu-row--divided"}`}
                          onClick={() =>
                            openMobileTab(item.id, props.setTab, props.setMobileScreen)
                          }
                        >
                          <span className="grok-settings-menu-row-leading">
                            <Icon className="grok-settings-menu-icon shrink-0" />
                            <span className="grok-settings-menu-row-label">{item.label}</span>
                          </span>
                          <ChevronRightIcon className="grok-settings-menu-chevron shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="grok-settings-stack-header grok-settings-stack-header--detail">
              <button
                type="button"
                onClick={() => props.setMobileScreen("menu")}
                aria-label="Back to settings"
                className="grok-settings-stack-pill-btn"
              >
                <ChevronLeftIcon />
              </button>
              <h2 className="grok-settings-stack-title grok-settings-stack-title--center">
                {activeMobileLabel}
              </h2>
            </header>
            <div className="grok-settings-mobile-body grok-settings-content grok-settings-embedded min-h-0 flex-1 overflow-y-auto">
              {activeMobileTab ? (
                <SettingsTabContent tab={activeMobileTab} {...tabContentProps} />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Desktop: sidebar + content */}
      <div className="hidden min-h-0 flex-1 sm:flex sm:flex-row">
        <aside className="grok-settings-sidebar flex flex-col">
          <h2 className="grok-settings-title">Settings</h2>
          <nav className="flex flex-col gap-0.5">
            {TABS.map((item) => {
              const active = props.tab === item.id;
              const Icon = item.Icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={active}
                  onClick={() => props.setTab(item.id)}
                  className="grok-settings-nav-btn"
                >
                  <Icon className="shrink-0 opacity-90" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="grok-settings-main">
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Close"
            className="grok-settings-close"
          >
            <CloseIcon />
          </button>

          <div className="grok-settings-content grok-settings-embedded">
            <SettingsTabContent tab={props.tab} {...tabContentProps} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal(props: {
  open: boolean;
  onClose: () => void;
  onSessionsChanged?: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("account");
  const [mobileScreen, setMobileScreen] = useState<"menu" | SettingsTab>("menu");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { user, signOutUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (props.open) {
      setMobileScreen("menu");
    }
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mobileScreen !== "menu") {
        setMobileScreen("menu");
        return;
      }
      props.onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [props.open, props.onClose, mobileScreen]);

  const onSignOut = async () => {
    setSignOutBusy(true);
    try {
      await signOutUser();
      props.onClose();
      router.replace("/sign-in");
    } finally {
      setSignOutBusy(false);
    }
  };

  const onDeleteAccount = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      try {
        await signOutUser();
      } catch {
        // Auth user may already be removed server-side.
      }
      props.onClose();
      router.replace("/sign-in");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!props.open || !mounted) return null;

  return createPortal(
    <div className="grok-settings-overlay fixed inset-0 z-[200] isolate flex items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0"
        onClick={props.onClose}
      />
      <SettingsModalPanel
        tab={tab}
        setTab={setTab}
        mobileScreen={mobileScreen}
        setMobileScreen={setMobileScreen}
        onClose={props.onClose}
        deleteOpen={deleteOpen}
        setDeleteOpen={setDeleteOpen}
        deleteBusy={deleteBusy}
        deleteError={deleteError}
        onDeleteAccount={() => void onDeleteAccount()}
        signOutBusy={signOutBusy}
        onSignOut={() => void onSignOut()}
        user={user}
        onSessionsChanged={props.onSessionsChanged}
      />
    </div>,
    document.body
  );
}
