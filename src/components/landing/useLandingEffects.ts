"use client";

import { useEffect } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import gsap from "gsap";

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
      document.querySelectorAll<HTMLAnchorElement>(
        ".lp-mobile-menu a, .lp-nav-mobile .lp-btn",
      ),
    );
    menuLinks.forEach((link) => link.addEventListener("click", closeMenu));

    return () => {
      window.removeEventListener("scroll", onScroll);
      toggle?.removeEventListener("click", onToggle);
      menuLinks.forEach((link) =>
        link.removeEventListener("click", closeMenu),
      );
      document.body.classList.remove("menu-locked");
    };
  }, []);

  useEffect(() => {
    if (
      window.matchMedia(
        "(max-width: 899px), (prefers-reduced-motion: reduce)",
      ).matches
    ) {
      return;
    }

    const sequence = document.querySelector<HTMLElement>(".lp-scene-sequence");
    const scene = sequence?.querySelector<HTMLElement>("[data-room-scene]");
    const moments = sequence
      ? Array.from(
          sequence.querySelectorAll<HTMLElement>("[data-room-moment]"),
        )
      : [];

    if (!sequence || !scene || moments.length < 2) return;

    gsap.registerPlugin(ScrollTrigger);

    const setActive = (activeIndex: number) => {
      moments.forEach((moment, index) => {
        const isActive = index === activeIndex;
        if (isActive) moment.dataset.active = "true";
        else delete moment.dataset.active;
        moment.toggleAttribute("aria-hidden", !isActive);
      });
    };

    setActive(0);
    const context = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sequence,
        start: "top top+=24",
        end: () => `+=${Math.max(window.innerHeight * 2.5, 1800)}`,
        pin: scene,
        pinSpacing: true,
        scrub: true,
        onUpdate: (self) => {
          const index = Math.min(
            moments.length - 1,
            Math.floor(self.progress * moments.length),
          );
          setActive(index);
        },
      });
    }, sequence);

    return () => {
      context.revert();
      moments.forEach((moment, index) => {
        moment.removeAttribute("aria-hidden");
        if (index === 0) moment.dataset.active = "true";
        else delete moment.dataset.active;
      });
    };
  }, []);
}
