"use client";

import { useEffect } from "react";

export function useLandingEffects() {
  useEffect(() => {
    const nav = document.querySelector(".lp-nav");
    const onScroll = () => {
      if (!nav) return;
      if (window.scrollY > 12) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const toggle = document.querySelector<HTMLButtonElement>(".lp-nav-toggle");
    const closeMenu = () => {
      nav?.classList.remove("menu-open");
      document.body.classList.remove("menu-locked");
      toggle?.setAttribute("aria-expanded", "false");
    };
    const onToggle = () => {
      const isOpen = nav?.classList.toggle("menu-open") ?? false;
      document.body.classList.toggle("menu-locked", isOpen);
      toggle?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };
    toggle?.addEventListener("click", onToggle);
    const onMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !nav?.classList.contains("menu-open")) return;
      closeMenu();
      toggle?.focus();
    };
    document.addEventListener("keydown", onMenuKeyDown);
    const desktopNav = window.matchMedia("(min-width: 1020px)");
    const onNavBreakpoint = () => {
      if (desktopNav.matches) closeMenu();
    };
    desktopNav.addEventListener("change", onNavBreakpoint);

    const menuLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(".lp-mobile-menu a"),
    );
    menuLinks.forEach((link) => link.addEventListener("click", closeMenu));

    const revealTargets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-lp-reveal]"),
    );
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let revealObserver: IntersectionObserver | undefined;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealTargets.forEach((target) => target.classList.add("is-revealed"));
    } else {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-revealed");
            revealObserver?.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -12%", threshold: 0.12 },
      );
      revealTargets.forEach((target) => revealObserver?.observe(target));
    }

    const chapters = Array.from(
      document.querySelectorAll<HTMLElement>(".lp-how-chapter"),
    );
    const howLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(".lp-how-nav-link"),
    );
    const setHowActive = (id: string) => {
      howLinks.forEach((link) => {
        const active = link.hash === `#${id}`;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    };
    let spyObserver: IntersectionObserver | undefined;
    if (chapters.length > 0 && howLinks.length > 0 && "IntersectionObserver" in window) {
      const ratios = new Map<string, number>();
      spyObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            ratios.set(
              entry.target.id,
              entry.isIntersecting ? entry.intersectionRatio : 0,
            );
          });
          let bestId = "";
          let bestRatio = 0;
          chapters.forEach((chapter) => {
            const ratio = ratios.get(chapter.id) ?? 0;
            if (ratio > bestRatio) {
              bestRatio = ratio;
              bestId = chapter.id;
            }
          });
          if (bestId) setHowActive(bestId);
        },
        { rootMargin: "-28% 0px -52% 0px", threshold: [0, 0.12, 0.28, 0.5, 0.75] },
      );
      chapters.forEach((chapter) => spyObserver?.observe(chapter));
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      toggle?.removeEventListener("click", onToggle);
      document.removeEventListener("keydown", onMenuKeyDown);
      desktopNav.removeEventListener("change", onNavBreakpoint);
      menuLinks.forEach((link) =>
        link.removeEventListener("click", closeMenu),
      );
      revealObserver?.disconnect();
      spyObserver?.disconnect();
      document.body.classList.remove("menu-locked");
    };
  }, []);
}
