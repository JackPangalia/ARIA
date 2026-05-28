"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (props.busy) return;
      if (event.key === "Escape") {
        event.preventDefault();
        props.onCancel();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        props.onConfirm();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props]);

  if (!props.open || !mounted) return null;

  const confirmClass = props.danger
    ? "aria-confirm-btn aria-confirm-btn-danger"
    : "aria-confirm-btn aria-confirm-btn-primary";

  return createPortal(
    <div className="aria-confirm-overlay fixed inset-0 z-[300] isolate flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        className="absolute inset-0"
        onClick={() => {
          if (!props.busy) props.onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="aria-confirm-modal"
      >
        <h3 id="confirm-dialog-title" className="aria-confirm-title">
          {props.title}
        </h3>
        {props.description ? (
          <p className="aria-confirm-desc">{props.description}</p>
        ) : null}
        <div className="aria-confirm-actions">
          <button
            type="button"
            className="aria-confirm-btn aria-confirm-btn-secondary"
            disabled={props.busy}
            onClick={props.onCancel}
          >
            {props.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className={confirmClass}
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {props.busy ? "Working…" : (props.confirmLabel ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
