"use client";

import { SessionWorkspace } from "@/components/sessions/SessionWorkspace";
import { RequireAuth } from "@/components/firebase/RequireAuth";

export default function Home() {
  return (
    <RequireAuth>
      <SessionWorkspace />
    </RequireAuth>
  );
}
