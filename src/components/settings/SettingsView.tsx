"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EducationSettings } from "@/components/education/EducationSettings";
import { useAuth } from "@/components/firebase/AuthProvider";
import { SpeakerProfilesManager } from "@/components/firebase/SpeakerProfilesManager";
import { ConnectorsManager } from "@/components/firebase/ConnectorsManager";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CONNECTORS_ENABLED } from "@/lib/features";
import { deleteAccount } from "@/lib/account/client";
import {
  getAnswerModelPreference,
  getTranscriptionModePreference,
  getUsage,
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
import type { UsageSummary } from "@/lib/plan/types";
import { PLANS, TIERS, type Tier } from "@/lib/plan/tiers";
import { openBillingPortal, startCheckout } from "@/lib/billing/client";
import { PAID_TIERS, type PaidTier } from "@/lib/plan/tiers";
import {
  GrokSettingsButton,
  SettingsGroup,
  SettingsRow,
} from "@/components/settings/SettingsRow";
import { TrashIcon } from "@/components/sessions/icons";
import { VoiceSettingsPanel } from "@/components/settings/VoiceSettingsPanel";
import { OrbBodySettings } from "@/components/settings/OrbBodySettings";
import { WidgetStyleSettings } from "@/components/settings/WidgetStyleSettings";
import { useAriaStore } from "@/lib/store";
import {
  SETTINGS_TAB_META,
  type SettingsTab,
} from "@/components/settings/settings-nav";

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
    <div className="kivo-settings-delete-overlay fixed inset-0 z-[220] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0"
        onClick={props.onClose}
      />
      <div
        role="alertdialog"
        aria-labelledby="delete-account-title"
        className="grok-settings-delete-dialog relative z-10 w-full max-w-sm rounded-[12px] p-5"
      >
        <h3
          id="delete-account-title"
          className="grok-settings-delete-title text-sm font-medium"
        >
          Delete account?
        </h3>
        <p className="grok-settings-delete-desc mt-2 text-[13px] leading-relaxed">
          This permanently removes your account, conversations, speaker profiles, and
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

function formatHm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatMinutes(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function BetaBadge() {
  return (
    <span className="relative top-[-1px] ml-1.5 rounded-full border border-app-subtle/40 px-1 py-0.5 text-[7px] font-medium tracking-[0.2em] text-app-muted">
      BETA
    </span>
  );
}

function tierRank(tier: Tier): number {
  return TIERS.indexOf(tier);
}

const PAID_TIER_LIST: PaidTier[] = [...PAID_TIERS];

function UsageBillingPanel() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [busy, setBusy] = useState<PaidTier | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = useAriaStore((s) => s.status);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getUsage()
        .then((data) => {
          if (!cancelled) setUsage(data);
        })
        .catch(() => {
          // Non-critical.
        });
    };
    refresh();
    const interval = setInterval(refresh, 20_000);
    const onRefresh = () => refresh();
    window.addEventListener("kivo:usage-refresh", onRefresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("kivo:usage-refresh", onRefresh);
    };
  }, [status]);

  const currentTier = usage?.tier ?? "free";
  const currentRank = tierRank(currentTier);

  const redirectTo = (url: string) => {
    globalThis.location.assign(url);
  };

  const handleCheckout = async (tier: PaidTier) => {
    setBusy(tier);
    setError(null);
    try {
      redirectTo(await startCheckout(tier));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
      setBusy(null);
    }
  };

  const handlePortal = async () => {
    setBusy("portal");
    setError(null);
    try {
      redirectTo(await openBillingPortal());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal.");
      setBusy(null);
    }
  };

  const listeningRemainingPct = usage
    ? Math.max(0, 100 - usage.listening.pct)
    : null;
  const asksRemainingPct = usage ? Math.max(0, 100 - usage.asks.pct) : null;

  return (
    <div>
      <SettingsGroup label="Your plan">
        <SettingsRow
          last
          title={PLANS[currentTier].display.name}
          description={
            currentTier === "free"
              ? "$0/mo · Free plan"
              : `$${PLANS[currentTier].display.priceMonthlyUsd}/mo · ${PLANS[currentTier].display.tagline}`
          }
          action={
            currentTier === "free" ? (
              <GrokSettingsButton
                variant="primary"
                disabled={busy !== null}
                onClick={() => void handleCheckout("plus")}
              >
                {busy === "plus" ? "Redirecting…" : "Upgrade plan"}
              </GrokSettingsButton>
            ) : (
              <GrokSettingsButton
                disabled={busy !== null}
                onClick={() => void handlePortal()}
              >
                {busy === "portal" ? "Opening…" : "Manage billing"}
              </GrokSettingsButton>
            )
          }
        />
      </SettingsGroup>

      {error ? (
        <p className="grok-settings-delete-error mb-4 text-xs">{error}</p>
      ) : null}

      <SettingsGroup label="Usage this month">
        {!usage ? (
          <div className="space-y-0 px-4 py-4">
            <div className="kivo-skeleton mb-3 h-4 w-32 rounded-full" />
            <div className="kivo-skeleton h-2 w-full rounded-full" />
          </div>
        ) : (
          <>
            <SettingsRow
              title="Listening"
              description={`${formatHm(usage.listening.usedSeconds)} of ${formatHm(usage.listening.capSeconds)} used`}
              action={
                <div className="kivo-settings-meter">
                  <div className="kivo-settings-meter-track">
                    <div
                      className="kivo-settings-meter-fill"
                      data-danger={usage.listening.pct >= 90}
                      style={{
                        width: `${Math.min(100, Math.max(2, usage.listening.pct))}%`,
                      }}
                    />
                  </div>
                  <span className="kivo-settings-meter-label">
                    {Math.round(listeningRemainingPct ?? 0)}% left
                  </span>
                </div>
              }
            />
            <SettingsRow
              last
              title="Kivo asks"
              description={
                usage.asks.exhausted
                  ? "Monthly allowance used up"
                  : "Share of this month's ask allowance"
              }
              action={
                <div className="kivo-settings-meter">
                  <div className="kivo-settings-meter-track">
                    <div
                      className="kivo-settings-meter-fill"
                      data-danger={usage.asks.pct >= 90}
                      style={{
                        width: `${Math.min(100, Math.max(2, usage.asks.pct))}%`,
                      }}
                    />
                  </div>
                  <span className="kivo-settings-meter-label">
                    {Math.round(asksRemainingPct ?? 0)}% left
                  </span>
                </div>
              }
            />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup label="Available plans">
        {PAID_TIER_LIST.map((tier, index) => {
          const { display } = PLANS[tier];
          const isCurrent = tier === currentTier;
          const isDowngrade = tierRank(tier) < currentRank;
          const isLast = index === PAID_TIER_LIST.length - 1;
          return (
            <SettingsRow
              key={tier}
              last={isLast}
              title={
                <span className="inline-flex items-center gap-2">
                  {display.name}
                  {isCurrent ? (
                    <span className="grok-current-badge">Current</span>
                  ) : null}
                </span>
              }
              description={`$${display.priceMonthlyUsd}/mo · ${display.tagline}`}
              action={
                isCurrent ? undefined : (
                  <GrokSettingsButton
                    disabled={busy !== null}
                    onClick={() => void handleCheckout(tier)}
                  >
                    {busy === tier
                      ? "Redirecting…"
                      : isDowngrade
                        ? "Switch"
                        : `Choose ${display.name}`}
                  </GrokSettingsButton>
                )
              }
            />
          );
        })}
      </SettingsGroup>
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
      setSessions(await listSessions({ status: "trashed", limit: 100 }));
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

  if (loading) {
    return (
      <div className="kivo-settings-card">
        <div className="space-y-0 px-4 py-4" aria-busy="true" aria-label="Loading trash">
          <div className="kivo-skeleton mb-3 h-4 w-32 rounded-full" />
          <div className="kivo-skeleton h-2 w-full rounded-full" />
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="kivo-settings-empty">
        <span className="kivo-settings-empty-icon">
          <TrashIcon size={20} />
        </span>
        <p className="kivo-settings-empty-title">Trash is empty</p>
        <p className="kivo-settings-empty-desc">
          Trashed conversations show up here. Restore them or delete them forever.
        </p>
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <p className="grok-settings-delete-error mb-3 text-xs">{error}</p>
      ) : null}
      <SettingsGroup>
        {sessions.map((session, index) => {
          const confirming = confirmDeleteId === session.id;
          const trashedAt = session.trashedAt
            ? new Date(session.trashedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : null;
          return (
            <SettingsRow
              key={session.id}
              last={index === sessions.length - 1}
              title={session.title}
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
                      Delete
                    </GrokSettingsButton>
                  </div>
                )
              }
            />
          );
        })}
      </SettingsGroup>
    </div>
  );
}

function TranscriptionModeSettings() {
  return (
    <SettingsGroup label="Transcription engine">
      <SettingsRow
        last
        title={
          <span>
            Real-time Speaker Diarization
          </span>
        }
        description="Enhanced multi-speaker recognition and voice identification is active across all conversations."
        action={
          <span className="text-xs font-medium text-emerald-500">Active</span>
        }
      />
    </SettingsGroup>
  );
}

function AnswerModelSettings() {
  const [preference, setPreference] = useState<AnswerModelPreference | null>(null);
  const [busyModel, setBusyModel] = useState<AskModelId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const effectiveModel = useAriaStore((state) => state.effectiveModel);
  const modelFallback = useAriaStore((state) => state.modelFallback);

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
      setPreference(await updateAnswerModelPreference(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update model.");
    } finally {
      setBusyModel(null);
    }
  };

  const options = preference?.options ?? [];
  const current = preference?.current ?? null;

  return (
    <SettingsGroup label="Answer model">
      {effectiveModel ? (
        <p className="px-4 pt-3 text-xs text-app-muted">
          Last voice answer used {effectiveModel}.
          {modelFallback ? ` ${modelFallback}.` : ""}
        </p>
      ) : null}
      {error ? (
        <p className="grok-settings-delete-error px-4 pt-2 text-xs">{error}</p>
      ) : null}
      {options.map((option, index) => (
        <SettingsRow
          key={option.id}
          last={index === options.length - 1}
          title={option.label}
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
    </SettingsGroup>
  );
}

function AccountPanel(props: {
  user: ReturnType<typeof useAuth>["user"];
  signOutBusy: boolean;
  onSignOut: () => void;
  onDelete: () => void;
}) {
  const displayName =
    props.user?.displayName ?? props.user?.email?.split("@")[0] ?? "Account";
  const email = props.user?.email ?? "";
  const initial = (displayName[0] ?? "A").toUpperCase();

  return (
    <div>
      <SettingsGroup label="Profile">
        <div className="flex items-center gap-3.5 px-4 py-4">
          {props.user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.user.photoURL}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-base font-medium text-app"
              aria-hidden
            >
              {initial}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-app">{displayName}</p>
            {email ? (
              <p className="truncate text-[13px] text-app-muted">{email}</p>
            ) : null}
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          last
          title="Sign out"
          description="Sign out of Kivo on this device."
          action={
            <GrokSettingsButton disabled={props.signOutBusy} onClick={props.onSignOut}>
              {props.signOutBusy ? "…" : "Sign out"}
            </GrokSettingsButton>
          }
        />
      </SettingsGroup>

      <SettingsGroup label="Learning Kivo">
        <EducationSettings />
      </SettingsGroup>

      <SettingsGroup label="Danger zone">
        <SettingsRow
          last
          title="Delete account"
          description="Permanently removes your account, conversations, and speaker profiles."
          action={
            <GrokSettingsButton danger onClick={props.onDelete}>
              Delete
            </GrokSettingsButton>
          }
        />
      </SettingsGroup>
    </div>
  );
}

export function SettingsTabContent(props: {
  tab: SettingsTab;
  onSessionsChanged?: () => void;
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  signOutBusy: boolean;
  onSignOut: () => void;
  user: ReturnType<typeof useAuth>["user"];
}) {
  if (props.tab === "account") {
    return (
      <AccountPanel
        user={props.user}
        signOutBusy={props.signOutBusy}
        onSignOut={props.onSignOut}
        onDelete={() => props.setDeleteOpen(true)}
      />
    );
  }

  if (props.tab === "usage_billing") {
    return <UsageBillingPanel />;
  }

  if (props.tab === "appearance") {
    return (
      <div>
        <SettingsGroup label="Theme">
          <div className="px-3 py-3">
            <ThemeToggle variant="settings" />
          </div>
        </SettingsGroup>
        <OrbBodySettings />
        <WidgetStyleSettings />
      </div>
    );
  }

  if (props.tab === "model") {
    return (
      <div>
        <AnswerModelSettings />
        <VoiceSettingsPanel variant="settings" />
      </div>
    );
  }

  if (props.tab === "speakers") {
    return (
      <div>
        <TranscriptionModeSettings />
        <SettingsGroup label="Speaker profiles">
          <div className="px-4 py-3">
            <p className="mb-3 text-[13px] leading-relaxed text-app-muted">
              Speakers are named from the transcript after a session. Rename or
              remove them here.
            </p>
            <SpeakerProfilesManager embedded grok allowEnrollment={false} />
          </div>
        </SettingsGroup>
      </div>
    );
  }

  if (props.tab === "connectors") {
    if (!CONNECTORS_ENABLED) return null;
    return <ConnectorsManager />;
  }

  if (props.tab === "trash") {
    return (
      <TrashPanel open onSessionsChanged={props.onSessionsChanged} />
    );
  }

  return null;
}

export function SettingsView(props: {
  tab: SettingsTab;
  onSessionsChanged?: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const { user, signOutUser } = useAuth();
  const router = useRouter();
  const meta = SETTINGS_TAB_META[props.tab];

  const onSignOut = async () => {
    setSignOutBusy(true);
    try {
      await signOutUser();
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
      router.replace("/sign-in");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="kivo-settings-page kivo-fade-in relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <DeleteAccountDialog
        open={deleteOpen}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void onDeleteAccount()}
      />

      <div className="kivo-settings-page-inner">
        <header className="kivo-settings-page-header">
          <h1 className="kivo-settings-page-title">{meta.title}</h1>
          <p className="kivo-settings-page-desc">{meta.description}</p>
        </header>

        <SettingsTabContent
          tab={props.tab}
          onSessionsChanged={props.onSessionsChanged}
          deleteOpen={deleteOpen}
          setDeleteOpen={setDeleteOpen}
          signOutBusy={signOutBusy}
          onSignOut={() => void onSignOut()}
          user={user}
        />
      </div>
    </div>
  );
}
