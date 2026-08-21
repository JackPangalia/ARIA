"use client";

import type { SessionDoc } from "@/lib/sessions/types";

export function SessionHeader(props: {
  session: SessionDoc;
  onRename: (title: string) => void;
  onEnd: () => void;
  onArchive: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <input
          defaultValue={props.session.title}
          onBlur={(event) => props.onRename(event.target.value)}
          className="w-full bg-transparent text-base font-medium tracking-[-0.01em] text-app outline-none lg:text-lg"
          aria-label="Conversation title"
        />
        <p className="kivo-kicker mt-1.5">
          {props.session.status.toUpperCase()} · Updated{" "}
          {new Date(props.session.updatedAt).toLocaleString()}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={props.busy || props.session.status === "ended"}
          onClick={props.onEnd}
          className="rounded-full border border-app-strong px-3 py-1.5 text-[10px] tracking-[0.14em] text-app-secondary hover:border-app disabled:opacity-40"
        >
          END
        </button>
        <button
          type="button"
          disabled={props.busy || props.session.status === "archived"}
          onClick={props.onArchive}
          className="rounded-full border border-app px-3 py-1.5 text-[10px] tracking-[0.14em] text-app-subtle hover:border-app-strong hover:text-app-secondary disabled:opacity-40"
        >
          ARCHIVE
        </button>
      </div>
    </div>
  );
}
