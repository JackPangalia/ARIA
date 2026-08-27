"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  chooseEducationTopic, educationIsQuiet, EDUCATION_TOPICS, QUIET_ACTIVITY, TIP_VISIT_LIMIT, TOPIC_IDS, topicIsRelevant,
  type EducationActivity as Activity, type EducationAnchor, type EducationTopic,
} from "@/lib/education/model";
import { visibleAnchorRect } from "@/lib/education/placement";
import { useEducationProgress } from "@/lib/education/use-education-progress";
import { createPortal } from "react-dom";
import { EducationTip } from "./EducationTip";

type EducationContextValue = {
  register: (kind: EducationAnchor, element: HTMLElement) => () => void;
  updateActivity: (activity: Activity) => void;
  retire: (topic: EducationTopic) => void;
  previewTips: () => void;
  restartTips: () => Promise<boolean>;
};
const EducationContext = createContext<EducationContextValue | null>(null);
export function useEducation() { return useContext(EducationContext); }

export function useEducationAnchor<T extends HTMLElement>(kind: EducationAnchor) {
  const register = useEducation()?.register;
  return useCallback((element: T | null) => {
    if (element && register) return register(kind, element);
  }, [kind, register]);
}

/** The workspace reports observable state; education never controls the audio engine. */
export function EducationActivity(props: Activity) {
  const education = useEducation();
  const { status, running, home, overview, blocked } = props;
  useEffect(() => {
    education?.updateActivity({ status, running, home, overview, blocked });
    if (running) education?.retire("together");
    if (status === "wake-detected" || status === "capturing-question") education?.retire("wake");
  }, [education, status, running, home, overview, blocked]);
  return null;
}

type ActiveTip = { topic: EducationTopic; anchor: HTMLElement };

function hasBlockingUI() {
  if (document.hidden) return true;
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && (focused.matches("input, textarea, select") || focused.isContentEditable)) return true;
  // Inspect semantics/surfaces only. Targets themselves are always registered refs.
  return Array.from(document.querySelectorAll<HTMLElement>(
    'dialog[open], [role="dialog"], [role="menu"], [aria-expanded="true"], .kivo-popover:not([data-education])',
  )).some((node) => node.checkVisibility({ checkVisibilityCSS: true }));
}

export function EducationProvider(props: { uid: string; children: ReactNode }) {
  const { state, retire, hide, restart: restartProgress } = useEducationProgress(props.uid);
  const anchors = useRef(new Map<EducationAnchor, Set<HTMLElement>>());
  const activity = useRef<Activity>(QUIET_ACTIVITY);
  const shown = useRef(new Set<EducationTopic>());
  const lastHiddenAt = useRef<number | null>(null);
  const activeRef = useRef<ActiveTip | null>(null);
  const evaluateRef = useRef<() => void>(() => {});
  const [active, setActive] = useState<ActiveTip | null>(null);
  const [preview, setPreview] = useState(false);
  const previewShown = useRef(new Set<EducationTopic>());
  const previewScreen = useRef("");
  const generation = useRef<number | null>(null);

  const clearTip = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = null;
    lastHiddenAt.current = Date.now();
    setActive(null);
  }, []);
  const register = useCallback((kind: EducationAnchor, element: HTMLElement) => {
    const set = anchors.current.get(kind) ?? new Set<HTMLElement>();
    set.add(element);
    anchors.current.set(kind, set);
    return () => { set.delete(element); };
  }, []);
  const updateActivity = useCallback((next: Activity) => {
    activity.current = next;
    evaluateRef.current();
  }, []);
  const startPreview = useCallback(() => {
    clearTip();
    previewShown.current.clear();
    previewScreen.current = "";
    setPreview(true);
  }, [clearTip]);
  const stopPreview = useCallback(() => { clearTip(); setPreview(false); }, [clearTip]);

  useEffect(() => {
    if (state && generation.current !== state.generation) {
      if (generation.current !== null) {
        clearTip();
        shown.current.clear();
        lastHiddenAt.current = null;
      }
      generation.current = state.generation;
    }
    const evaluate = () => {
      if (preview) {
        const { home, overview, running, status } = activity.current;
        const screen = `${home}:${overview}:${running}:${status}`;
        if (previewScreen.current !== screen) {
          previewShown.current.clear();
          previewScreen.current = screen;
        }
      }
      const current = activeRef.current;
      if ((!preview && !state?.enabled) || !educationIsQuiet(activity.current) || hasBlockingUI()) { clearTip(); return; }
      if (current) {
        if ((!preview && state?.retired.includes(current.topic)) || !topicIsRelevant(current.topic, activity.current) || !visibleAnchorRect(current.anchor)) clearTip();
        return;
      }
      if (!preview && (shown.current.size >= TIP_VISIT_LIMIT || state?.retired.length === TOPIC_IDS.length)) return;
      const visible = new Map<EducationAnchor, HTMLElement>();
      for (const [kind, elements] of anchors.current) {
        for (const element of elements) {
          if (visibleAnchorRect(element)) { visible.set(kind, element); break; }
        }
      }
      const topic = chooseEducationTopic({
        state, activity: activity.current, available: new Set(visible.keys()),
        shown: preview ? previewShown.current : shown.current, lastHiddenAt: lastHiddenAt.current, now: Date.now(), preview,
      });
      if (!topic) return;
      const tip = { topic, anchor: visible.get(EDUCATION_TOPICS[topic].anchor)! };
      activeRef.current = tip;
      setActive(tip);
    };
    evaluateRef.current = evaluate;
    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded", "open", "hidden"] });
    const interval = window.setInterval(evaluate, 500);
    window.addEventListener("scroll", evaluate, true);
    window.addEventListener("resize", evaluate);
    document.addEventListener("visibilitychange", evaluate);
    document.addEventListener("focusin", evaluate);
    evaluate();
    return () => {
      evaluateRef.current = () => {};
      observer.disconnect();
      clearInterval(interval);
      window.removeEventListener("scroll", evaluate, true);
      window.removeEventListener("resize", evaluate);
      document.removeEventListener("visibilitychange", evaluate);
      document.removeEventListener("focusin", evaluate);
    };
  }, [clearTip, state, preview]);

  const onPresented = useCallback(() => {
    if (activeRef.current) (preview ? previewShown.current : shown.current).add(activeRef.current.topic);
  }, [preview]);
  const dismiss = useCallback(() => {
    const target = activeRef.current?.anchor;
    const fromCard = document.activeElement?.closest('[data-education="tip"]');
    if (activeRef.current && !preview) retire(activeRef.current.topic);
    clearTip();
    if (fromCard && target?.isConnected) target.focus({ preventScroll: true });
  }, [clearTip, retire, preview]);
  const hideAll = useCallback(() => {
    if (preview) stopPreview();
    else { hide(); clearTip(); }
  }, [clearTip, hide, preview, stopPreview]);
  const restart = useCallback(async () => {
    const success = await restartProgress();
    if (success) { shown.current.clear(); lastHiddenAt.current = null; }
    return success;
  }, [restartProgress]);
  const context = useMemo(() => ({ register, updateActivity, retire, previewTips: startPreview, restartTips: restart }), [register, updateActivity, retire, startPreview, restart]);

  return (
    <EducationContext.Provider value={context}>
      {props.children}
      {active ? <EducationTip key={active.topic} topic={active.topic} anchor={active.anchor} preview={preview} onDismiss={dismiss} onHideAll={hideAll} onPresented={onPresented} onUnavailable={clearTip} /> : null}
      {preview ? createPortal(
        <div className="kivo-education-preview-bar" data-education="preview">
          <div><strong>Tip preview</strong><span>Open a conversation or transcript to see its tips. No waiting.</span></div>
          <button type="button" onClick={stopPreview} className="kivo-education-quiet">Exit preview</button>
        </div>, document.body,
      ) : null}
    </EducationContext.Provider>
  );
}
