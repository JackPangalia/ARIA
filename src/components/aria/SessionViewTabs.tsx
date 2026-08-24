"use client";

/** Header action for continuing a completed session. */
export function SessionViewTabs(props: {
  resume: boolean;
  onResume: () => void;
  resumeDisabled?: boolean;
}) {
  return (
    <div className="kivo-session-actions">
      <button
        type="button"
        onClick={props.onResume}
        disabled={props.resumeDisabled}
        className="kivo-session-resume-action"
      >
        <span>{props.resume ? "Resume" : "Start"}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path
            d="M3.5 8h9M9 4.5 12.5 8 9 11.5"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
