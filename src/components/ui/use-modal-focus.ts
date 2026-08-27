"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Keep keyboard navigation inside a modal and return focus without stealing it
 * from another dialog opened by the same action. Re-query as controls change. */
export function useModalFocus(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  options: { initialFocus?: RefObject<HTMLElement | null>; onEscape?: () => void } = {},
) {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; });
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )).filter((node) => !node.closest("[inert]") && node.tabIndex >= 0 && node.getClientRects().length > 0);
    (optionsRef.current.initialFocus?.current ?? controls()[0] ?? panel).focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && optionsRef.current.onEscape) {
        event.preventDefault();
        optionsRef.current.onEscape();
      }
      if (event.key !== "Tab") return;
      const elements = controls();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous?.isConnected && (document.activeElement === document.body || panel.contains(document.activeElement))) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, panelRef]);
}
