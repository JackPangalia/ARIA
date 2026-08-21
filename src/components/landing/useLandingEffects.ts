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

    return () => {
      window.removeEventListener("scroll", onScroll);
      toggle?.removeEventListener("click", onToggle);
      menuLinks.forEach((link) =>
        link.removeEventListener("click", closeMenu),
      );
      revealObserver?.disconnect();
      document.body.classList.remove("menu-locked");
    };
  }, []);
}
