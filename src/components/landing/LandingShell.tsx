"use client";

import { useEffect, type ReactNode } from "react";

export function LandingShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    document.body.classList.add("landing-active");
    document.documentElement.classList.add("landing-active", "dark");
    document.documentElement.style.colorScheme = "dark";
    return () => {
      document.body.classList.remove("landing-active");
      document.documentElement.classList.remove("landing-active", "dark");
      document.documentElement.style.colorScheme = "";
    };
  }, []);

  return <div className={className}>{children}</div>;
}
