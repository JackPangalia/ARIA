"use client";

// Shared icon set for the session/project hub screens. Previously duplicated
// verbatim between SessionHub.tsx and ProjectHubView.tsx — kept here once so
// a tweak to one can't silently drift from the other.
//
// Size scale: 16px for compact row/menu affordances (chevrons, delete),
// 18px for the default row-leading icon, 20px reserved for a lone
// section-defining icon (e.g. inside an empty-state well).

type IconProps = { className?: string; size?: number };

export function SearchIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function FolderIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StopIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="7.25"
        y="7.25"
        width="9.5"
        height="9.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function SilenceIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 5 6.5 8.5H3.5v7H6.5L11 19V5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m15 9.5 6 6M21 9.5l-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SessionIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 10v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M17 5v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M21 11v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className, size = 16 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m9 18 6-6-6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UploadIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4M7 9l5-5 5 5M5 20h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TextIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 6h14M5 12h10M5 18h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function FileIcon({ className, size = 18 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3.5h7l3.5 3.5V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V7h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ className, size = 16 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
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

/** Shimmering list-row placeholders for a loading list — same row shape
 * (icon + text) as the real rows, so loading doesn't look like a different
 * layout snapping into place. */
export function HubRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-0.5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-xl px-3 py-3">
          <div className="kivo-skeleton h-[18px] w-[18px] shrink-0 rounded-full" />
          <div className="kivo-skeleton h-4 rounded-full" style={{ width: `${62 - i * 9}%` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Icon-well + title + description empty state — the shape already designed
 * for Settings' Trash panel (`.kivo-settings-empty`), reused here as the one
 * empty-state pattern across the hub instead of a bare paragraph.
 */
export function HubEmptyState(props: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="kivo-settings-empty">
      <div className="kivo-settings-empty-icon">{props.icon}</div>
      <p className="kivo-settings-empty-title">{props.title}</p>
      <p className="kivo-settings-empty-desc">{props.description}</p>
      {props.action ? <div className="mt-3">{props.action}</div> : null}
    </div>
  );
}
