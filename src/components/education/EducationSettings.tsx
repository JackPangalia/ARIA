"use client";

import { useState } from "react";
import { useAuth } from "@/components/firebase/AuthProvider";
import { educationRequest } from "@/lib/education/client";
import { useEducation } from "./EducationProvider";

/** Small preference controls only; the actual guide is the public /guide article. */
export function EducationSettings() {
  const { user } = useAuth();
  const education = useEducation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="kivo-education-settings px-4 py-4">
      <p className="text-sm font-medium text-app">Helpful tips</p>
      <p className="mt-1 text-[13px] leading-relaxed text-app-muted">New users see tips automatically. You can replay them whenever you like.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="kivo-education-done" disabled={busy || !user} onClick={async () => {
          if (!user) return;
          setBusy(true);
          try {
            const saved = education ? await education.restartTips() : Boolean(await educationRequest(user.uid, { action: "restart" }));
            setMessage(saved ? "Tips reset. Close settings or return to a conversation to see them." : "Couldn’t save. Please try again.");
          } catch {
            setMessage("Couldn’t save. Check your connection and try again.");
          } finally { setBusy(false); }
        }}>{busy ? "Saving…" : "Show tips again"}</button>
        {education ? <button type="button" className="kivo-education-quiet" onClick={() => {
          education.previewTips();
          setMessage("Preview is on. Close settings to see tips immediately, without changing saved progress.");
        }}>Preview tips</button> : null}
      </div>
      {message ? <p role="status" className="mt-2 text-xs leading-relaxed text-app-muted">{message}</p> : null}
    </div>
  );
}
