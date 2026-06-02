import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { LandingShell } from "@/components/landing/LandingShell";
import "./landing.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-hanken",
});

export const metadata: Metadata = {
  title: "Kivo — The AI that moves you forward",
  description:
    "Kivo listens to every conversation, learns every voice, and is ready the moment you say its name.",
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <LandingShell className={hanken.variable}>{children}</LandingShell>
  );
}
