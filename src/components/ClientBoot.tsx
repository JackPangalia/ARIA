"use client";

import { useEffect } from "react";
import { installClientErrorReporter } from "@/lib/errors/client-reporter";
import { track } from "@/lib/analytics/client";
import type { EventName } from "@/lib/analytics/events";

/** Installs the global client error reporter once per page load. */
export function ClientBoot() {
  useEffect(() => {
    installClientErrorReporter();
  }, []);
  return null;
}

/** Fires a single funnel event when the wrapping page mounts. */
export function TrackOnMount({ name }: { name: EventName }) {
  useEffect(() => {
    track(name);
  }, [name]);
  return null;
}
