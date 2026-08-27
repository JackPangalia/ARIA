"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { educationRequest } from "./client";
import {
  applyEducationMutation, EducationStateSchema,
  type EducationMutation, type EducationState, type EducationTopic,
} from "./model";

/** A small serialized outbox keeps offline dismissals quiet and concurrent tabs additive. */
export function useEducationProgress(uid: string) {
  const [state, setState] = useState<EducationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remote = useRef<EducationState | null>(null);
  const pending = useRef<EducationMutation[]>([]);
  const discovered = useRef(new Set<EducationTopic>());
  const sending = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(false);

  const publish = useCallback(() => {
    if (!mounted.current) return;
    const base = remote.current;
    setState(base ? pending.current.reduce(applyEducationMutation, base) : null);
  }, []);

  const accept = useCallback((next: EducationState) => {
    if (!mounted.current || (remote.current && next.revision < remote.current.revision)) return;
    remote.current = next;
    pending.current = pending.current.filter((item) => item.action === "restart" || item.generation === next.generation);
    for (const topic of discovered.current) {
      if (!next.retired.includes(topic) && !pending.current.some((item) => item.action === "retire" && item.topic === topic)) {
        pending.current.push({ action: "retire", topic, generation: next.generation });
      }
    }
    discovered.current.clear();
    publish();
  }, [publish]);

  const flush = useCallback((): Promise<boolean> => {
    if (sending.current) return sending.current;
    const run = async () => {
      try {
        while (mounted.current && pending.current.length && remote.current) {
          const mutation = pending.current[0]!;
          const next = await educationRequest(uid, mutation);
          if (!mounted.current) return false;
          pending.current = pending.current.filter((item) => item !== mutation);
          accept(next);
        }
        if (mounted.current) setError(null);
        return true;
      } catch {
        if (mounted.current) setError("Couldn’t save your tips. We’ll retry when you reconnect.");
        return false;
      } finally {
        sending.current = null;
      }
    };
    // Defer so the reference is assigned even when the queue is empty.
    sending.current = Promise.resolve().then(run);
    return sending.current;
  }, [accept, uid]);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      void educationRequest(uid).then((next) => {
        accept(next);
        void flush();
      }).catch(() => {
        if (mounted.current) setError("Tips are unavailable right now. You can still read the guide.");
      });
    };
    refresh();
    const unsubscribe = onSnapshot(doc(db, "users", uid, "private", "education"), (snapshot) => {
      if (!snapshot.exists()) return;
      const parsed = EducationStateSchema.safeParse(snapshot.data());
      if (parsed.success) { accept(parsed.data); void flush(); }
    }, () => { /* The authenticated API refresh remains available. */ });
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      unsubscribe();
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [accept, flush, uid]);

  const retire = useCallback((topic: EducationTopic) => {
    const current = remote.current;
    if (!current) { discovered.current.add(topic); return; }
    if (current.retired.includes(topic) || pending.current.some((item) => item.action === "retire" && item.topic === topic)) return;
    pending.current.push({ action: "retire", topic, generation: current.generation });
    publish();
    void flush();
  }, [flush, publish]);

  const hide = useCallback(() => {
    if (!remote.current) return;
    pending.current.push({ action: "hide", generation: remote.current.generation });
    publish();
    void flush();
  }, [flush, publish]);

  const restart = useCallback(async () => {
    if (!(await flush())) return false;
    try {
      const next = await educationRequest(uid, { action: "restart" });
      if (!mounted.current) return false;
      discovered.current.clear();
      accept(next);
      setError(null);
      return true;
    } catch {
      if (mounted.current) setError("Couldn’t restart tips. Check your connection and try again.");
      return false;
    }
  }, [accept, flush, uid]);

  return { state, retire, hide, restart, error };
}
