"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { EDUCATION_TOPICS, type EducationTopic } from "@/lib/education/model";
import { placeEducationTip, visibleAnchorRect, type TipPlacement } from "@/lib/education/placement";

export function EducationTip(props: {
  topic: EducationTopic;
  anchor: HTMLElement;
  onDismiss: () => void;
  onHideAll: () => void;
  onPresented: () => void;
  onUnavailable: () => void;
  preview?: boolean;
}) {
  const { anchor: target, topic, onPresented, onUnavailable, onDismiss } = props;
  const card = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<TipPlacement | null>(null);
  const content = EDUCATION_TOPICS[props.topic];

  useLayoutEffect(() => {
    const previous = target.getAttribute("aria-describedby");
    target.setAttribute("aria-describedby", [previous, "kivo-education-description"].filter(Boolean).join(" "));
    return () => {
      if (previous) target.setAttribute("aria-describedby", previous);
      else target.removeAttribute("aria-describedby");
    };
  }, [target]);

  useLayoutEffect(() => {
    let frame = 0;
    let presented = false;
    const place = () => {
      const anchor = visibleAnchorRect(target);
      if (!anchor || !card.current) { onUnavailable(); return; }
      const view = window.visualViewport;
      const left = view?.offsetLeft ?? 0;
      const top = view?.offsetTop ?? 0;
      const width = view?.width ?? window.innerWidth;
      const height = view?.height ?? window.innerHeight;
      const css = getComputedStyle(document.documentElement);
      const safeTop = parseFloat(css.getPropertyValue("--education-safe-top")) || 0;
      const safeBottom = parseFloat(css.getPropertyValue("--education-safe-bottom")) || 0;
      const safeLeft = parseFloat(css.getPropertyValue("--education-safe-left")) || 0;
      const safeRight = parseFloat(css.getPropertyValue("--education-safe-right")) || 0;
      const next = placeEducationTip(anchor, 320, card.current.offsetHeight,
        { left: left + safeLeft, top: top + safeTop, width: width - safeLeft - safeRight, height: height - safeTop - safeBottom, right: left + width - safeRight, bottom: top + height - safeBottom }, topic === "speaker");
      if (!next) { onUnavailable(); return; }
      setPlacement((old) => old && Object.keys(next).every((key) => old[key as keyof TipPlacement] === next[key as keyof TipPlacement]) ? old : next);
      if (!presented) { presented = true; onPresented(); }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    place();
    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    if (card.current) observer.observe(card.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [target, topic, onPresented, onUnavailable]);

  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onDismiss(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return createPortal(
    <aside
      className="kivo-education-position"
      data-education="tip"
      aria-labelledby="kivo-education-title"
      style={{
        left: placement?.left ?? 16,
        top: placement?.top ?? 16,
        width: placement?.width ?? "min(320px, calc(100vw - 32px))",
        visibility: placement ? "visible" : "hidden",
        "--education-pointer": `${placement?.pointer ?? 32}px`,
      } as CSSProperties}
    >
      <div ref={card} className="kivo-popover kivo-popover-in kivo-education-tip" data-education="card">
        <span className="kivo-education-pointer" data-side={placement?.side ?? "top"} aria-hidden="true" />
        <div aria-live="polite" aria-atomic="true">
          <h2 id="kivo-education-title" className="kivo-education-title">{content.title}</h2>
          <p id="kivo-education-description" className="kivo-education-copy">{content.body}</p>
        </div>
        <div className="kivo-education-actions">
          <button type="button" className="kivo-education-quiet" onClick={props.onHideAll}>{props.preview ? "Exit preview" : "Hide tips"}</button>
          <button type="button" className="kivo-education-done" onClick={props.onDismiss}>Got it</button>
        </div>
      </div>
    </aside>, document.body,
  );
}
