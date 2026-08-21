"use client";

/**
 * Session header switch — Overview to review the session, Resume/Start to
 * begin listening. Replaces the old Voice tab (the orb is the voice surface;
 * Resume is the action).
 */
export function SessionViewTabs(props: {
  overviewMode: boolean;
  onChange: (overview: boolean) => void;
  resume: boolean;
  onResume: () => void;
  resumeDisabled?: boolean;
  overviewDisabled?: boolean;
}) {
  const tabClass = (active: boolean, disabled?: boolean) =>
    `rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
      disabled
        ? "cursor-not-allowed opacity-40"
        : active
          ? "bg-surface text-app"
          : "text-app-muted hover:bg-surface-hover hover:text-app"
    }`;

  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => props.onChange(true)}
        disabled={props.overviewDisabled}
        className={tabClass(props.overviewMode, props.overviewDisabled)}
      >
        Overview
      </button>
      {props.overviewMode ? (
        <button
          type="button"
          onClick={props.onResume}
          disabled={props.resumeDisabled}
          className={tabClass(false, props.resumeDisabled)}
        >
          {props.resume ? "Resume" : "Start"}
        </button>
      ) : null}
    </div>
  );
}
