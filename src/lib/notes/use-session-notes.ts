"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NotesConflictError,
  generateEnhancedNotes as generateEnhancedNotesApi,
  getSessionNotes,
  saveEnhancedNotes as saveEnhancedNotesApi,
  savePersonalNotes as savePersonalNotesApi,
} from "@/lib/notes/client";
import {
  EMPTY_ENHANCED_NOTES,
  EMPTY_PERSONAL_NOTES,
  type EnhancedNotesDoc,
  type PersonalNotesDoc,
} from "@/lib/notes/types";

export type NotesDocKind = "personal" | "enhanced";

export type NotesSaveState =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

interface DocState<T extends PersonalNotesDoc | EnhancedNotesDoc> {
  /** Last version acknowledged by the server. */
  doc: T;
  /** What the editor currently holds. */
  draft: string;
  /** Bumped whenever `draft` was replaced from outside the editor. */
  resetToken: number;
  saveState: NotesSaveState;
  saveError: string | null;
  /** Server copy that beat this draft; shown while `saveState === "conflict"`. */
  conflict: T | null;
}

export interface SessionNotesController {
  loaded: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  personal: DocState<PersonalNotesDoc>;
  enhanced: DocState<EnhancedNotesDoc>;
  setDraft: (kind: NotesDocKind, content: string) => void;
  /** Push a dirty draft now instead of waiting for the debounce. */
  flush: (kind?: NotesDocKind) => Promise<void>;
  retrySave: (kind: NotesDocKind) => void;
  /** After a conflict: take the server version, or re-save mine over it. */
  resolveConflict: (kind: NotesDocKind, choice: "theirs" | "mine") => void;
  generating: boolean;
  generateError: string | null;
  /**
   * Write enhanced notes. Resolves `"edited"` (and does nothing) when the
   * enhanced notes carry manual edits and `force` was not given.
   */
  generateEnhanced: (options?: { force?: boolean }) => Promise<"done" | "edited" | "failed">;
}

const AUTOSAVE_DELAY_MS = 900;
const DRAFT_STORAGE_PREFIX = "kivo-notes-draft";

interface StoredDraft {
  content: string;
  baseRevision: number;
}

function draftKey(sessionId: string, kind: NotesDocKind): string {
  return `${DRAFT_STORAGE_PREFIX}:${sessionId}:${kind}`;
}

function readStoredDraft(sessionId: string, kind: NotesDocKind): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(sessionId, kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    if (typeof parsed.content !== "string" || typeof parsed.baseRevision !== "number") {
      return null;
    }
    return { content: parsed.content, baseRevision: parsed.baseRevision };
  } catch {
    return null;
  }
}

function writeStoredDraft(sessionId: string, kind: NotesDocKind, draft: StoredDraft | null) {
  try {
    if (draft) {
      window.localStorage.setItem(draftKey(sessionId, kind), JSON.stringify(draft));
    } else {
      window.localStorage.removeItem(draftKey(sessionId, kind));
    }
  } catch {
    // Storage is a convenience; the server copy is the record.
  }
}

function initialDoc<T extends PersonalNotesDoc | EnhancedNotesDoc>(doc: T): DocState<T> {
  return {
    doc,
    draft: doc.content,
    resetToken: 0,
    saveState: "idle",
    saveError: null,
    conflict: null,
  };
}

/**
 * Owns both notes documents for the open session: loading, a debounced
 * compare-and-set autosave per document, local draft recovery, and enhanced
 * notes generation. The editor is a pure view over `draft`; everything that
 * could lose work (a save racing an edit, a reload mid-save, a stale tab)
 * is decided here.
 */
export function useSessionNotes(sessionId: string | null): SessionNotesController {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [personal, setPersonal] = useState<DocState<PersonalNotesDoc>>(() =>
    initialDoc(EMPTY_PERSONAL_NOTES)
  );
  const [enhanced, setEnhanced] = useState<DocState<EnhancedNotesDoc>>(() =>
    initialDoc(EMPTY_ENHANCED_NOTES)
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Refs mirror state for timers and unload handlers, which must read the
  // latest draft without re-subscribing.
  const personalRef = useRef(personal);
  const enhancedRef = useRef(enhanced);
  const sessionRef = useRef(sessionId);
  useEffect(() => {
    personalRef.current = personal;
  }, [personal]);
  useEffect(() => {
    enhancedRef.current = enhanced;
  }, [enhanced]);
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);
  const timers = useRef<Record<NotesDocKind, number | null>>({
    personal: null,
    enhanced: null,
  });
  const inFlight = useRef<Record<NotesDocKind, Promise<void> | null>>({
    personal: null,
    enhanced: null,
  });

  const stateFor = useCallback((kind: NotesDocKind) => {
    return kind === "personal" ? personalRef.current : enhancedRef.current;
  }, []);

  const update = useCallback(
    (
      kind: NotesDocKind,
      updater: (
        current: DocState<PersonalNotesDoc> | DocState<EnhancedNotesDoc>
      ) => Partial<DocState<PersonalNotesDoc>> | Partial<DocState<EnhancedNotesDoc>>
    ) => {
      if (kind === "personal") {
        setPersonal((current) => ({
          ...current,
          ...(updater(current) as Partial<DocState<PersonalNotesDoc>>),
        }));
      } else {
        setEnhanced((current) => ({
          ...current,
          ...(updater(current) as Partial<DocState<EnhancedNotesDoc>>),
        }));
      }
    },
    []
  );

  const clearTimer = useCallback((kind: NotesDocKind) => {
    const id = timers.current[kind];
    if (id != null) {
      window.clearTimeout(id);
      timers.current[kind] = null;
    }
  }, []);

  const saveNow = useCallback(
    async (kind: NotesDocKind, options: { keepalive?: boolean } = {}) => {
      const sid = sessionRef.current;
      if (!sid) return;
      const state = stateFor(kind);
      if (state.draft === state.doc.content && state.saveState !== "error") {
        if (state.saveState === "dirty") {
          update(kind, () => ({ saveState: "saved", saveError: null }));
          writeStoredDraft(sid, kind, null);
        }
        return;
      }
      if (inFlight.current[kind]) return;

      const content = state.draft;
      const baseRevision = state.doc.revision;
      update(kind, () => ({ saveState: "saving", saveError: null }));

      const run = (async () => {
        try {
          const saved =
            kind === "personal"
              ? await savePersonalNotesApi(sid, { content, baseRevision }, options)
              : await saveEnhancedNotesApi(sid, { content, baseRevision }, options);
          if (sessionRef.current !== sid) return;
          const latest = stateFor(kind);
          const stillDirty = latest.draft !== content;
          update(kind, () => ({
            doc: saved,
            saveState: stillDirty ? "dirty" : "saved",
            saveError: null,
            conflict: null,
          }));
          if (stillDirty) {
            writeStoredDraft(sid, kind, {
              content: latest.draft,
              baseRevision: saved.revision,
            });
          } else {
            writeStoredDraft(sid, kind, null);
          }
        } catch (err) {
          if (sessionRef.current !== sid) return;
          if (err instanceof NotesConflictError) {
            update(kind, () => ({
              saveState: "conflict",
              saveError: err.message,
              conflict: err.current as PersonalNotesDoc & EnhancedNotesDoc,
            }));
            return;
          }
          update(kind, () => ({
            saveState: "error",
            saveError: err instanceof Error ? err.message : "Couldn't save your notes.",
          }));
        } finally {
          inFlight.current[kind] = null;
        }
      })();
      inFlight.current[kind] = run;
      await run;

      // Edits that arrived during the request need their own save.
      const after = stateFor(kind);
      if (after.saveState === "dirty" && after.draft !== after.doc.content) {
        clearTimer(kind);
        timers.current[kind] = window.setTimeout(() => {
          timers.current[kind] = null;
          void saveNow(kind);
        }, AUTOSAVE_DELAY_MS);
      }
    },
    [clearTimer, stateFor, update]
  );

  const schedule = useCallback(
    (kind: NotesDocKind) => {
      clearTimer(kind);
      timers.current[kind] = window.setTimeout(() => {
        timers.current[kind] = null;
        void saveNow(kind);
      }, AUTOSAVE_DELAY_MS);
    },
    [clearTimer, saveNow]
  );

  const setDraft = useCallback(
    (kind: NotesDocKind, content: string) => {
      const sid = sessionRef.current;
      if (!sid) return;
      const state = stateFor(kind);
      if (content === state.draft) return;
      const dirty = content !== state.doc.content;
      update(kind, (current) => ({
        draft: content,
        saveState:
          current.saveState === "conflict" || current.saveState === "saving"
            ? current.saveState
            : dirty
              ? "dirty"
              : current.saveState === "dirty"
                ? "saved"
                : current.saveState,
      }));
      writeStoredDraft(
        sid,
        kind,
        dirty ? { content, baseRevision: state.doc.revision } : null
      );
      if (dirty && state.saveState !== "conflict") schedule(kind);
    },
    [schedule, stateFor, update]
  );

  const flush = useCallback(
    async (kind?: NotesDocKind) => {
      const kinds: NotesDocKind[] = kind ? [kind] : ["personal", "enhanced"];
      await Promise.all(
        kinds.map(async (item) => {
          clearTimer(item);
          const pending = inFlight.current[item];
          if (pending) await pending;
          const state = stateFor(item);
          if (state.saveState === "dirty" || state.saveState === "error") {
            await saveNow(item);
          }
        })
      );
    },
    [clearTimer, saveNow, stateFor]
  );

  const retrySave = useCallback(
    (kind: NotesDocKind) => {
      clearTimer(kind);
      void saveNow(kind);
    },
    [clearTimer, saveNow]
  );

  const resolveConflict = useCallback(
    (kind: NotesDocKind, choice: "theirs" | "mine") => {
      const sid = sessionRef.current;
      if (!sid) return;
      const state = stateFor(kind);
      const server = state.conflict;
      if (!server) return;
      if (choice === "theirs") {
        update(kind, (current) => ({
          doc: server,
          draft: server.content,
          resetToken: current.resetToken + 1,
          saveState: "saved",
          saveError: null,
          conflict: null,
        }));
        writeStoredDraft(sid, kind, null);
        return;
      }
      // Mine: adopt the server revision as the base and save the draft over it.
      update(kind, () => ({
        doc: server,
        saveState: "dirty",
        saveError: null,
        conflict: null,
      }));
      writeStoredDraft(sid, kind, {
        content: state.draft,
        baseRevision: server.revision,
      });
      window.setTimeout(() => void saveNow(kind), 0);
    },
    [saveNow, stateFor, update]
  );

  const load = useCallback(async (sid: string) => {
    setLoaded(false);
    setLoadError(null);
    try {
      const notes = await getSessionNotes(sid);
      if (sessionRef.current !== sid) return;

      const restore = <T extends PersonalNotesDoc | EnhancedNotesDoc>(
        kind: NotesDocKind,
        doc: T
      ): DocState<T> => {
        const stored = readStoredDraft(sid, kind);
        const base = initialDoc(doc);
        // A local draft is only trustworthy if it was written against the
        // revision the server still has; otherwise a newer save already won.
        if (
          stored &&
          stored.baseRevision === doc.revision &&
          stored.content !== doc.content
        ) {
          return { ...base, draft: stored.content, saveState: "dirty" };
        }
        writeStoredDraft(sid, kind, null);
        return base;
      };

      const nextPersonal = restore("personal", notes.personal);
      const nextEnhanced = restore("enhanced", notes.enhanced);
      setPersonal(nextPersonal);
      setEnhanced(nextEnhanced);
      setGenerating(notes.enhanced.status === "generating");
      setGenerateError(
        notes.enhanced.status === "error" ? notes.enhanced.error : null
      );
      setLoaded(true);
      if (nextPersonal.saveState === "dirty") schedule("personal");
      if (nextEnhanced.saveState === "dirty") schedule("enhanced");
    } catch (err) {
      if (sessionRef.current !== sid) return;
      setLoadError(err instanceof Error ? err.message : "Couldn't load your notes.");
      setLoaded(true);
    }
  }, [schedule]);

  // Session switch: flush what we can for the old session, then load the new one.
  useEffect(() => {
    clearTimer("personal");
    clearTimer("enhanced");
    inFlight.current = { personal: null, enhanced: null };
    sessionRef.current = sessionId;

    setPersonal(initialDoc(EMPTY_PERSONAL_NOTES));
    setEnhanced(initialDoc(EMPTY_ENHANCED_NOTES));
    setGenerating(false);
    setGenerateError(null);
    if (!sessionId) {
      setLoaded(false);
      setLoadError(null);
      return;
    }
    void load(sessionId);
    return () => {
      clearTimer("personal");
      clearTimer("enhanced");
    };
  }, [sessionId, load, clearTimer]);

  // Tab close / navigation: push any dirty draft with keepalive so it survives
  // the page going away. The local copy stays until the server acknowledges.
  useEffect(() => {
    const onPageHide = () => {
      const sid = sessionRef.current;
      if (!sid) return;
      for (const kind of ["personal", "enhanced"] as NotesDocKind[]) {
        const state = kind === "personal" ? personalRef.current : enhancedRef.current;
        if (state.saveState === "dirty" && !inFlight.current[kind]) {
          void saveNow(kind, { keepalive: true });
        }
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [saveNow]);

  const generateEnhanced = useCallback(
    async (options: { force?: boolean } = {}) => {
      const sid = sessionRef.current;
      if (!sid || generating) return "failed" as const;
      // The personal notes are an input; make sure the server has them.
      await flush("personal").catch(() => undefined);
      setGenerating(true);
      setGenerateError(null);
      update("enhanced", (current) => ({
        doc: { ...(current.doc as EnhancedNotesDoc), status: "generating", error: null },
      }));
      try {
        const doc = await generateEnhancedNotesApi(sid, options);
        if (sessionRef.current !== sid) return "failed" as const;
        setEnhanced((current) => ({
          ...current,
          doc,
          draft: doc.content,
          resetToken: current.resetToken + 1,
          saveState: "idle",
          saveError: null,
          conflict: null,
        }));
        writeStoredDraft(sid, "enhanced", null);
        setGenerateError(doc.status === "error" ? doc.error : null);
        return doc.status === "error" ? ("failed" as const) : ("done" as const);
      } catch (err) {
        if (sessionRef.current !== sid) return "failed" as const;
        if (err instanceof NotesConflictError) {
          const current = err.current as EnhancedNotesDoc;
          update("enhanced", () => ({ doc: current }));
          if (err.code === "edited") return "edited" as const;
          setGenerateError(err.message);
          return "failed" as const;
        }
        update("enhanced", (state) => ({
          doc: {
            ...(state.doc as EnhancedNotesDoc),
            status: (state.doc as EnhancedNotesDoc).content ? "ready" : "error",
          },
        }));
        setGenerateError(
          err instanceof Error ? err.message : "Kivo couldn't write the enhanced notes."
        );
        return "failed" as const;
      } finally {
        if (sessionRef.current === sid) setGenerating(false);
      }
    },
    [flush, generating, update]
  );

  const reload = useCallback(async () => {
    const sid = sessionRef.current;
    if (sid) await load(sid);
  }, [load]);

  return useMemo(
    () => ({
      loaded,
      loadError,
      reload,
      personal,
      enhanced,
      setDraft,
      flush,
      retrySave,
      resolveConflict,
      generating,
      generateError,
      generateEnhanced,
    }),
    [
      loaded,
      loadError,
      reload,
      personal,
      enhanced,
      setDraft,
      flush,
      retrySave,
      resolveConflict,
      generating,
      generateError,
      generateEnhanced,
    ]
  );
}
