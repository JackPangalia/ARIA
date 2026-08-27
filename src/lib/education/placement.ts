export type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type TipPlacement = { left: number; top: number; width: number; pointer: number; side: "top" | "bottom" };

/** Only use space wholly above/below the control; never cover the thing being taught. */
export function placeEducationTip(anchor: Rect, width: number, height: number, viewport: Rect, pointAtEnd = false): TipPlacement | null {
  const pad = 16;
  const gap = 12;
  const cardWidth = Math.min(width, viewport.width - pad * 2);
  const pointerX = pointAtEnd ? anchor.right - 6 : anchor.left + anchor.width / 2;
  const left = Math.max(viewport.left + pad, Math.min(pointerX - cardWidth / 2, viewport.right - pad - cardWidth));
  const bottomFits = anchor.bottom + gap + height <= viewport.bottom - pad;
  const topFits = anchor.top - gap - height >= viewport.top + pad;
  if (!bottomFits && !topFits) return null;
  return {
    left,
    top: bottomFits ? anchor.bottom + gap : anchor.top - gap - height,
    width: cardWidth,
    pointer: Math.max(22, Math.min(pointerX - left, cardWidth - 22)),
    side: bottomFits ? "top" : "bottom",
  };
}

/** Respect hidden responsive panes and every scrolling ancestor, not only the window. */
export function visibleAnchorRect(element: HTMLElement): DOMRect | null {
  if (!element.isConnected || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
  const rect = element.getBoundingClientRect();
  const view = window.visualViewport;
  let left = view?.offsetLeft ?? 0;
  let top = view?.offsetTop ?? 0;
  let right = left + (view?.width ?? window.innerWidth);
  let bottom = top + (view?.height ?? window.innerHeight);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const css = getComputedStyle(parent);
    if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) {
      const box = parent.getBoundingClientRect();
      left = Math.max(left, box.left); right = Math.min(right, box.right);
    }
    if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {
      const box = parent.getBoundingClientRect();
      top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom);
    }
  }
  if (!rect.width || !rect.height || rect.left < left || rect.right > right || rect.top < top || rect.bottom > bottom) return null;
  return rect;
}
