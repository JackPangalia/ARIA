"use client";

/**
 * Lightweight Voice / Overview switch — sits in the session header row beside
 * the sidebar controls, aligned with the KIVO mark. No recording chrome.
 */
export function SessionViewTabs(props: {
  overviewMode: boolean;
  onChange: (overview: boolean) => void;
  overviewDisabled?: boolean;
}) {
  const tabClass = (active: boolean, disabled?: boolean) =>
    `rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
      disabled
        ? "cursor-not-allowed opacity-40"
        : active
          ? "bg-surface text-app"
          : "text-app-muted hover:bg-surface-hover hover:text-app-secondary"
    }`;

  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => props.onChange(false)}
        className={tabClass(!props.overviewMode)}
      >
        Voice
      </button>
      <button
        type="button"
        onClick={() => props.onChange(true)}
        disabled={props.overviewDisabled}
        className={tabClass(props.overviewMode, props.overviewDisabled)}
      >
        Overview
      </button>
    </div>
  );
}
