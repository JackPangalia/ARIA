"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/firebase/AuthProvider";
import {
  deleteVoiceprint,
  loadVoiceprints,
  saveVoiceprint,
} from "@/lib/firebase/voiceprints";
import { useAriaStore } from "@/lib/store";
import type { Voiceprint } from "@/lib/types";

export function VoiceprintsManager() {
  const { user } = useAuth();
  const voiceprints = useAriaStore((s) => s.voiceprints);
  const setVoiceprints = useAriaStore((s) => s.setVoiceprints);
  const upsertVoiceprintLocal = useAriaStore((s) => s.upsertVoiceprintLocal);
  const removeVoiceprintLocal = useAriaStore((s) => s.removeVoiceprintLocal);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!user) return;
      try {
        const prints = await loadVoiceprints(user.uid);
        if (!cancelled) setVoiceprints(prints);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [user, setVoiceprints]);

  const onDelete = useCallback(
    async (name: string) => {
      if (!user) return;
      setBusy(name);
      setError(null);
      try {
        await deleteVoiceprint(user.uid, name);
        removeVoiceprintLocal(name);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed.");
      } finally {
        setBusy(null);
      }
    },
    [user, removeVoiceprintLocal]
  );

  const onRename = useCallback(
    async (oldName: string) => {
      if (!user) return;
      const trimmed = draft.trim();
      if (!trimmed || trimmed === oldName) {
        setEditingName(null);
        return;
      }
      if (voiceprints.some((v) => v.name === trimmed)) {
        setError(`A voiceprint named "${trimmed}" already exists.`);
        return;
      }
      const target = voiceprints.find((v) => v.name === oldName);
      if (!target) return;
      setBusy(oldName);
      setError(null);
      try {
        const renamed: Voiceprint = { ...target, name: trimmed };
        await saveVoiceprint(user.uid, renamed);
        await deleteVoiceprint(user.uid, oldName);
        removeVoiceprintLocal(oldName);
        upsertVoiceprintLocal(renamed);
        setEditingName(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rename failed.");
      } finally {
        setBusy(null);
      }
    },
    [user, draft, voiceprints, upsertVoiceprintLocal, removeVoiceprintLocal]
  );

  if (!user) return null;

  return (
    <section className="space-y-4 border-t border-zinc-900 pt-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[9px] tracking-[0.22em] text-zinc-600">
            VOICEPRINTS
          </p>
          <p className="mt-2 text-[11px] leading-snug text-zinc-500">
            Saved voices ARIA learned during introductions. These let ARIA
            keep recognizing a speaker across sessions, even if their
            distance, tone, or background noise changes.
          </p>
        </div>
      </header>

      {error ? (
        <p className="rounded-md border border-red-900/40 bg-red-950/40 px-3 py-2 text-[11px] text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-[11px] text-zinc-600">Loading…</p>
      ) : voiceprints.length === 0 ? (
        <p className="text-[11px] text-zinc-600">
          No voiceprints yet. Start a session and say something like
          &ldquo;Hey ARIA, I&apos;m Bob.&rdquo;
        </p>
      ) : (
        <ul className="space-y-2">
          {voiceprints.map((v) => {
            const isEditing = editingName === v.name;
            const isBusy = busy === v.name;
            return (
              <li
                key={v.name}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-900 bg-zinc-950/60 px-3 py-2"
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onRename(v.name);
                      if (e.key === "Escape") setEditingName(null);
                    }}
                    className="flex-1 rounded-sm border border-zinc-700 bg-black px-2 py-1 text-xs text-zinc-100 outline-none focus:border-zinc-500"
                  />
                ) : (
                  <div className="flex-1">
                    <p className="text-sm text-zinc-200">{v.name}</p>
                    <p className="text-[10px] tracking-[0.12em] text-zinc-600">
                      {v.sampleCount} sample{v.sampleCount === 1 ? "" : "s"}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void onRename(v.name)}
                        className="rounded-full border border-zinc-700 px-3 py-1 text-[10px] tracking-[0.18em] text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                      >
                        SAVE
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setEditingName(null)}
                        className="rounded-full px-3 py-1 text-[10px] tracking-[0.18em] text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
                      >
                        CANCEL
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingName(v.name);
                          setDraft(v.name);
                          setError(null);
                        }}
                        className="rounded-full border border-zinc-800 px-3 py-1 text-[10px] tracking-[0.18em] text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
                      >
                        RENAME
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void onDelete(v.name)}
                        className="rounded-full border border-red-900/60 px-3 py-1 text-[10px] tracking-[0.18em] text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                      >
                        DELETE
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
