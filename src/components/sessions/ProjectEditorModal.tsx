"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectDoc } from "@/lib/projects/types";
import { useModalFocus } from "@/components/ui/use-modal-focus";
import { useOverlayViewport } from "@/components/ui/use-overlay-viewport";

export type ProjectEditorState =
  | { mode: "create"; project?: undefined }
  | { mode: "edit"; project: ProjectDoc };

export function ProjectEditorModal(props: {
  state: ProjectEditorState | null;
  busy: boolean;
  suspended?: boolean;
  onSave: (input: { name: string; instructions: string }) => void;
  onArchive: (projectId: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(props.state?.project?.name ?? "");
  const [instructions, setInstructions] = useState(props.state?.project?.instructions ?? "");
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLFormElement>(null);
  const open = props.state !== null;
  useOverlayViewport(overlayRef, open);
  useModalFocus(panelRef, open && !props.suspended, {
    onEscape: () => { if (!props.busy) props.onClose(); },
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!props.state) return null;
  const editingProject = props.state.project;
  return createPortal(
    <div ref={overlayRef} className="kivo-project-editor-overlay">
      <form
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-editor-title"
        aria-describedby="project-editor-description"
        aria-busy={props.busy}
        inert={props.suspended || undefined}
        className="kivo-project-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && !props.busy) props.onSave({ name, instructions });
        }}
      >
        <header className="kivo-project-editor-header">
          <h2 id="project-editor-title">{editingProject ? "Edit project" : "New project"}</h2>
          <button type="button" className="kivo-project-editor-close" aria-label="Close project editor" onClick={props.onClose} disabled={props.busy}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="kivo-project-editor-body">
          <p id="project-editor-description">Give Kivo context to use in this project’s conversations.</p>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Project name" required />
          </label>
          <label>
            <span>Instructions <span className="text-app-subtle font-normal">· Optional</span></span>
            <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={12000} rows={5} placeholder="Add context, preferences, or anything Kivo should keep in mind." />
          </label>
          {editingProject && (
            <button type="button" className="kivo-project-editor-archive" onClick={() => props.onArchive(editingProject.id)} disabled={props.busy}>Archive project</button>
          )}
        </div>
        <footer className="kivo-project-editor-footer">
          <button type="button" onClick={props.onClose} disabled={props.busy}>Cancel</button>
          <button type="submit" className="is-primary" disabled={!name.trim() || props.busy}>{props.busy ? "Saving…" : "Save"}</button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
