import type { Metadata } from "next";
import { LandingShell } from "@/components/landing/LandingShell";
import "./landing.css";

export const metadata: Metadata = {
  title: "Kivo — The voice AI built for meetings",
  description:
    "Kivo listens to the conversation, understands who’s speaking, and answers out loud when you ask it to.",
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LandingShell>{children}</LandingShell>;
}
