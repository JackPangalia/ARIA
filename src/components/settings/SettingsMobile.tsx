"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/firebase/AuthProvider";
import {
  SETTINGS_NAV_GROUPS,
  SETTINGS_TAB_META,
  type SettingsTab,
} from "@/components/settings/settings-nav";
import { SettingsTabContent } from "@/components/settings/SettingsView";
import { deleteAccount } from "@/lib/account/client";
import { useRouter } from "next/navigation";
import { GrokSettingsButton } from "@/components/settings/SettingsRow";

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
    <div className="kivo-settings-delete-overlay absolute inset-0 z-30 flex items-center justify-center p-6">
      <div
        role="alertdialog"
        aria-labelledby="delete-account-title-mobile"
        className="grok-settings-delete-dialog w-full max-w-sm rounded-[12px] p-5"
      >
        <h3
          id="delete-account-title-mobile"
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

export function SettingsMobile(props: {
  open: boolean;
  tab: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  onClose: () => void;
  onSessionsChanged?: () => void;
}) {
  const [mobileScreen, setMobileScreen] = useState<"menu" | SettingsTab>("menu");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { user, signOutUser } = useAuth();
  const router = useRouter();

  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "Account";
  const email = user?.email ?? "";
  const initial = (displayName[0] ?? "A").toUpperCase();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (props.open) setMobileScreen("menu");
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

  const openTab = (tab: SettingsTab) => {
    props.onSelectTab(tab);
    setMobileScreen(tab);
  };

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
        // Auth user may already be removed.
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

  const activeLabel =
    mobileScreen === "menu" ? "Settings" : SETTINGS_TAB_META[mobileScreen].title;

  return createPortal(
    <div className="kivo-settings-mobile-root fixed inset-0 z-[200] flex flex-col bg-app text-app lg:hidden">
      <DeleteAccountDialog
        open={deleteOpen}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void onDeleteAccount()}
      />

      <header className="grok-settings-stack-header grok-settings-stack-header--root">
        <button
          type="button"
          onClick={() => {
            if (mobileScreen === "menu") props.onClose();
            else setMobileScreen("menu");
          }}
          aria-label={mobileScreen === "menu" ? "Close settings" : "Back to settings"}
          className="grok-settings-stack-pill-btn"
        >
          {mobileScreen === "menu" ? <CloseIcon /> : <ChevronLeftIcon />}
        </button>
        <h2 className="grok-settings-stack-title grok-settings-stack-title--center">
          {activeLabel}
        </h2>
      </header>

      {mobileScreen === "menu" ? (
        <div className="grok-settings-mobile-body flex-1 overflow-y-auto">
          <button
            type="button"
            className="grok-settings-profile-card"
            onClick={() => openTab("account")}
          >
            {user?.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.photoURL}
                alt=""
                className="grok-settings-profile-avatar object-cover"
              />
            ) : (
              <span
                className="grok-settings-profile-avatar grok-settings-profile-avatar--fallback rounded-xl"
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

          {SETTINGS_NAV_GROUPS.map((group) => (
            <section key={group.label} className="grok-settings-menu-section">
              <p className="grok-settings-menu-section-label">{group.label}</p>
              <div className="grok-settings-menu-card">
                {group.tabs
                  .filter((id) => id !== "account")
                  .map((tabId, index, list) => {
                    const isLast = index === list.length - 1;
                    return (
                      <button
                        key={tabId}
                        type="button"
                        className={`grok-settings-menu-row${isLast ? "" : " grok-settings-menu-row--divided"}`}
                        onClick={() => openTab(tabId)}
                      >
                        <span className="grok-settings-menu-row-leading">
                          <span className="grok-settings-menu-row-label">
                            {SETTINGS_TAB_META[tabId].label}
                          </span>
                        </span>
                        <ChevronRightIcon className="grok-settings-menu-chevron shrink-0" />
                      </button>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="kivo-settings-page min-h-0 flex-1 overflow-y-auto">
          <div className="kivo-settings-page-inner kivo-settings-page-inner--mobile">
            <SettingsTabContent
              tab={mobileScreen}
              onSessionsChanged={props.onSessionsChanged}
              deleteOpen={deleteOpen}
              setDeleteOpen={setDeleteOpen}
              signOutBusy={signOutBusy}
              onSignOut={() => void onSignOut()}
              user={user}
            />
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
