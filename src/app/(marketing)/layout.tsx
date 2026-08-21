import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import { LandingShell } from "@/components/landing/LandingShell";
import "./landing.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kivo — The voice AI built for the room",
  description:
    "Kivo listens to everyone in the room, understands who said what, and answers out loud when you ask.",
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <LandingShell
      className={`${inter.variable} ${newsreader.variable} lp-shell`}
    >
      {children}
    </LandingShell>
  );
}
