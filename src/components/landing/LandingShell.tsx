"use client";

import { useEffect, type ReactNode } from "react";
import {
  applyLandingTheme,
  applyTheme,
  clearLandingTheme,
  readStoredTheme,
} from "@/lib/theme";

/**
 * Forces the marketing surface to light product chrome.
 * ThemeProvider may still toggle `.dark` for the rest of the app; landing.css
 * pins its own light tokens on `html.landing-active` so that does not matter.
 */
export function LandingShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    applyLandingTheme();
    return () => {
      clearLandingTheme();
      applyTheme(readStoredTheme());
    };
  }, []);

  return <div className={className}>{children}</div>;
}
