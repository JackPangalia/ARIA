"use client";

import { useEffect, type RefObject } from "react";

/** Keep a mobile overlay inside the visible area when the keyboard opens. */
export function useOverlayViewport(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const update = () => {
      ref.current?.style.setProperty("--overlay-height", `${viewport?.height ?? window.innerHeight}px`);
      ref.current?.style.setProperty("--overlay-top", `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open, ref]);
}
