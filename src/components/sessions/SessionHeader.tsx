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
          className="w-full bg-transparent text-base font-medium text-zinc-100 outline-none lg:text-lg"
          aria-label="Conversation title"
        />
        <p className="mt-0.5 text-xs text-zinc-500">
          {props.session.status.toUpperCase()} · Updated{" "}
          {new Date(props.session.updatedAt).toLocaleString()}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={props.busy || props.session.status === "ended"}
          onClick={props.onEnd}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-[10px] tracking-[0.14em] text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
        >
          END
        </button>
        <button
          type="button"
          disabled={props.busy || props.session.status === "archived"}
          onClick={props.onArchive}
          className="rounded-full border border-zinc-800 px-3 py-1.5 text-[10px] tracking-[0.14em] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-40"
        >
          ARCHIVE
        </button>
      </div>
    </div>
  );
}
