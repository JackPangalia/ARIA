"use client";

import { useEffect } from "react";

export function useLandingEffects() {
  useEffect(() => {
    try {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;animation:revealIn 6s linear both;";
      document.body.appendChild(probe);
      setTimeout(() => {
        const op = parseFloat(getComputedStyle(probe).opacity) || 0;
        probe.remove();
        if (op <= 0.0008) document.documentElement.classList.add("no-anim");
      }, 200);
    } catch {
      /* ignore */
    }

    const nav = document.querySelector(".nav");
    const onScroll = () => {
      if (!nav) return;
      if (window.scrollY > 24) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const reveals = [...document.querySelectorAll(".reveal")];
    function checkReveals() {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      for (const el of reveals) {
        if (el.classList.contains("in")) continue;
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) el.classList.add("in");
      }
    }
    window.addEventListener("scroll", checkReveals, { passive: true });
    window.addEventListener("resize", checkReveals);
    checkReveals();
    const t1 = setTimeout(checkReveals, 200);
    const t2 = setTimeout(checkReveals, 800);

    const faqHandlers: Array<{ btn: Element; handler: () => void }> = [];
    document.querySelectorAll(".faq-q").forEach((q) => {
      const handler = () => {
        const item = q.closest(".faq-item");
        if (!item) return;
        const ans = item.querySelector<HTMLElement>(".faq-a");
        if (!ans) return;
        const open = item.classList.contains("open");
        document.querySelectorAll(".faq-item.open").forEach((o) => {
          if (o !== item) {
            o.classList.remove("open");
            const a = o.querySelector<HTMLElement>(".faq-a");
            if (a) a.style.maxHeight = "";
          }
        });
        if (open) {
          item.classList.remove("open");
          ans.style.maxHeight = "";
        } else {
          item.classList.add("open");
          ans.style.maxHeight = `${ans.scrollHeight}px`;
        }
      };
      q.addEventListener("click", handler);
      faqHandlers.push({ btn: q, handler });
    });

    // mobile menu toggle
    const toggle = document.querySelector<HTMLButtonElement>(".nav-toggle");
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
    // close the panel whenever a menu link is tapped
    const menuLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        ".mobile-menu a, .mobile-menu-cta a, .nav-mobile-cta"
      )
    );
    menuLinks.forEach((link) => link.addEventListener("click", closeMenu));

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", checkReveals);
      window.removeEventListener("resize", checkReveals);
      for (const { btn, handler } of faqHandlers) {
        btn.removeEventListener("click", handler);
      }
      toggle?.removeEventListener("click", onToggle);
      menuLinks.forEach((link) =>
        link.removeEventListener("click", closeMenu)
      );
      document.body.classList.remove("menu-locked");
    };
  }, []);
}
