"use client";

import Link from "next/link";
import { useState } from "react";
import { AskKivoVisual } from "@/components/landing/AskKivoVisual";
import { FAQ_ITEMS } from "@/components/landing/faq-content";
import { HearTheRoomVisual } from "@/components/landing/HearTheRoomVisual";
import { KeepTheRoomVisual } from "@/components/landing/KeepTheRoomVisual";
import { useLandingEffects } from "@/components/landing/useLandingEffects";
import { KivoLogo } from "@/components/brand/KivoLogo";
import { ImageStreamHero } from "@/components/ui/image-stream-hero";
import { MARKETING_TIERS, PLANS, planFeatureBullets } from "@/lib/plan/tiers";

const HERO_IMAGES = [
  { src: "/landing/kivo-hero-whiteboard-workshop-motion-v2.png", alt: "A team collaborating around a whiteboard" },
  { src: "/landing/kivo-hero-night-build-motion-v2.png", alt: "Founders working together late at night" },
  { src: "/landing/kivo-hero-bali-brainstorm-motion-v2.png", alt: "A small team brainstorming around a table" },
  { src: "/landing/kivo-hero-study-session-motion-v2.png", alt: "A group working together around a shared table" },
  { src: "/landing/kivo-hero-production-review-motion-v2.png", alt: "A creative team reviewing a project" },
  { src: "/landing/kivo-hero-pitch-practice-motion-v2.png", alt: "A founder presenting an idea to a team" },
  { src: "/landing/kivo-hero-whiteboard-critique-motion-v2.png", alt: "A product team discussing work at a whiteboard" },
  { src: "/landing/kivo-hero-city-boardroom-motion-v2.png", alt: "A team preparing for a meeting" },
  { src: "/landing/kivo-hero-oceanfounders-motion-v2.png", alt: "Founders talking together overlooking the ocean" },
  { src: "/landing/kivo-hero-cinematic-meeting-motion-v2.png", alt: "A small team in a thoughtful in-person meeting" },
] as const;

function SiteHeader() {
  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-inner">
        <a href="#top" aria-label="Kivo, back to top"><KivoLogo className="lp-wordmark" /></a>
        <nav className="lp-nav-links" aria-label="Primary">
          <a href="#how" className="lp-link">How it works</a>
          <Link href="/guide" className="lp-link">Guide</Link>
          <a href="#pricing" className="lp-link">Pricing</a>
          <a href="#faq" className="lp-link">FAQ</a>
        </nav>
        <div className="lp-nav-cta">
          <Link href="/sign-in" className="lp-link">Sign in</Link>
          <Link href="/sign-in" className="lp-btn lp-btn-primary">Start free</Link>
        </div>
        <button type="button" className="lp-nav-toggle" aria-label="Toggle menu" aria-expanded="false" aria-controls="mobile-menu">
          <span /><span /><span />
        </button>
      </div>
      <div className="lp-wrap lp-mobile-menu" id="mobile-menu">
        <nav aria-label="Mobile">
          <a href="#how">How it works</a>
          <Link href="/guide">Guide</Link>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="lp-hero" id="top">
      <ImageStreamHero images={HERO_IMAGES} className="lp-hero-stream">
        <div className="lp-hero-stream-scrim" aria-hidden />
        <div className="lp-hero-stream-inner">
          <h1 className="lp-display">The voice AI built for the room.</h1>
          <div className="lp-hero-stream-foot">
            <p className="lp-lead">Kivo listens to everyone, understands who said what, and answers out loud when you ask.</p>
            <Link href="/sign-in" className="lp-btn lp-btn-primary">Start free</Link>
            <p className="lp-note">No credit card required.</p>
          </div>
        </div>
      </ImageStreamHero>
    </section>
  );
}

function Manifesto() {
  return (
    <section className="lp-manifesto" aria-labelledby="manifesto-heading">
      <div className="lp-wrap lp-manifesto-grid">
        <h2 id="manifesto-heading" className="lp-section-index">02 / The moment</h2>
        <p className="lp-manifesto-copy" data-lp-reveal>
          Two people see two different ways forward. Neither is convinced. Then someone asks,{" "}
          <span>“Hey Kivo, what do you think?”</span>{" "}
          Kivo finds the strength in both ideas, adds what neither had considered, and gives the room a direction.{" "}
          <span>The conversation moves again.</span>
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="lp-story" id="how" aria-labelledby="how-heading">
      <div className="lp-wrap lp-story-intro" data-lp-reveal>
        <p className="lp-section-index">03 / How it works</p>
        <h2 className="lp-editorial-title" id="how-heading">Present for the conversation.<br />Quiet until you need it.</h2>
      </div>
      <div className="lp-wrap lp-how">
        <nav className="lp-how-nav" aria-label="How it works">
          <a href="#how-listen" className="lp-how-nav-link is-active" aria-current="true">Listen</a>
          <a href="#how-ask" className="lp-how-nav-link">Ask</a>
          <a href="#how-keep" className="lp-how-nav-link">Keep</a>
        </nav>
        <div className="lp-how-chapters">
          <article className="lp-how-chapter" id="how-listen" data-lp-reveal>
            <div className="lp-how-copy">
              <p className="lp-how-label">Listen</p>
              <h3>Kivo hears the whole room.</h3>
              <p>Start a session and Kivo follows the live conversation, separating speakers as they talk.</p>
            </div>
            <HearTheRoomVisual />
          </article>
          <article className="lp-how-chapter" id="how-ask" data-lp-reveal>
            <div className="lp-how-copy">
              <p className="lp-how-label">Ask</p>
              <h3>Say, “Hey Kivo.”</h3>
              <p>Ask about what is being discussed. Kivo already has the context, so you do not have to explain it again.</p>
            </div>
            <AskKivoVisual />
          </article>
          <article className="lp-how-chapter" id="how-keep" data-lp-reveal>
            <div className="lp-how-copy">
              <p className="lp-how-label">Keep</p>
              <h3>Leave with the conversation intact.</h3>
              <p>Return to the transcript and overview after the session, with the speakers and important context still connected.</p>
            </div>
            <KeepTheRoomVisual />
          </article>
        </div>
      </div>
    </section>
  );
}

function TheDifference() {
  return (
    <section className="lp-difference" aria-labelledby="difference-heading">
      <div className="lp-wrap lp-difference-grid" data-lp-reveal>
        <p className="lp-section-index">04 / The difference</p>
        <div className="lp-difference-copy">
          <h2 className="lp-editorial-title" id="difference-heading">Built for the whole room.</h2>
          <p className="lp-difference-primary">
            ChatGPT and Gemini are built around a conversation between you and the assistant.
            {" "}<span>Kivo is built for a conversation between everyone in the room. During a session, it follows who’s speaking and keeps track of who said what. It stays quiet while you talk to each other, then answers out loud to the group when someone asks. You keep the conversation going. Kivo joins when you need it.</span>
          </p>
          <p className="lp-difference-secondary">And unlike a meeting recorder, Kivo isn’t just capturing the conversation; it’s part of it.</p>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");

  return (
    <section className="lp-pricing" id="pricing" aria-labelledby="pricing-heading">
      <div className="lp-wrap">
        <div className="lp-pricing-head" data-lp-reveal>
          <p className="lp-section-index">05 / Pricing</p>
          <div>
            <h2 className="lp-editorial-title" id="pricing-heading">Start with the next conversation.</h2>
            <p>Try Kivo free. Upgrade when you need more listening time.</p>
          </div>
        </div>

        <div className="flex justify-center items-center gap-3 my-8" data-lp-reveal>
          <span className={`text-sm ${billingInterval === "month" ? "font-semibold text-foreground" : "text-app-muted"}`}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={billingInterval === "year"}
            onClick={() => setBillingInterval((prev) => (prev === "month" ? "year" : "month"))}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              billingInterval === "year" ? "bg-amber-600" : "bg-neutral-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                billingInterval === "year" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-sm flex items-center gap-1.5 ${billingInterval === "year" ? "font-semibold text-foreground" : "text-app-muted"}`}>
            Annual
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
              Save 20%
            </span>
          </span>
        </div>

        <ul className="lp-plans">
          {MARKETING_TIERS.map((tier) => {
            const { display } = PLANS[tier];
            const isFree = tier === "free";
            const price = isFree
              ? "$0"
              : billingInterval === "year"
                ? "$12"
                : `$${display.priceMonthlyUsd}`;
            const subLabel = isFree
              ? " / month"
              : billingInterval === "year"
                ? " / month (billed $144/yr)"
                : " / month";

            return (
              <li key={tier} className="lp-plan" data-lp-reveal>
                <div className="lp-plan-name-row">
                  <span className="lp-plan-name">{display.name}</span>
                  {display.featured ? <span className="lp-plan-tag">Most Popular</span> : null}
                </div>
                <p className="lp-plan-price">
                  {price}
                  <span>{subLabel}</span>
                </p>
                <p className="lp-plan-desc">{display.tagline}</p>
                <ul className="lp-plan-feats">
                  {planFeatureBullets(tier).map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <Link
                  href={isFree ? "/sign-in" : `/sign-in?plan=pro&interval=${billingInterval}`}
                  className={display.featured ? "lp-btn lp-btn-primary lp-plan-btn" : "lp-btn lp-btn-outline lp-plan-btn"}
                >
                  {display.ctaLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="lp-faq-section" id="faq" aria-labelledby="faq-heading">
      <div className="lp-wrap lp-faq-layout">
        <div className="lp-faq-heading" data-lp-reveal><p className="lp-section-index">06 / Details</p><h2 className="lp-editorial-title" id="faq-heading">A few good questions.</h2></div>
        <div className="lp-faq">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="lp-faq-item" name="faq">
              <summary className="lp-faq-q">{item.q}<span className="pm" aria-hidden /></summary>
              <div className="lp-faq-a-inner">{item.q === "Is my data private?" ? <>Your conversations are handled according to Kivo’s <Link href="/privacy" className="lp-inline-link">privacy policy</Link>. You remain in control of your sessions and stored conversation history.</> : item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <section className="lp-closing" aria-labelledby="close-heading" data-lp-reveal>
          <div className="lp-closing-copy"><p className="lp-section-index">The next conversation</p><h2 className="lp-editorial-title" id="close-heading">Bring AI into the conversation.</h2><p>Kivo is ready when the room is.</p><Link href="/sign-in" className="lp-btn lp-btn-light">Start free</Link></div>
        </section>
        <div className="lp-footer-meta">
          <a href="#top" className="lp-footer-wordmark" aria-label="Kivo, back to top"><KivoLogo knockout /></a>
          <div className="lp-footer-links"><Link href="/guide">Guide</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="mailto:hello@kivo.ai">Contact</a></div>
          <p>© 2026 Centonis AI Inc.</p>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  useLandingEffects();
  return (
    <>
      <a href="#top" className="lp-skip">Skip to content</a>
      <SiteHeader />
      <main>
        <Hero />
        <div className="lp-section-edge"><Manifesto /></div>
        <div className="lp-section-edge lp-section-edge-dark"><HowItWorks /></div>
        <div className="lp-section-edge"><TheDifference /></div>
        <div className="lp-section-edge lp-section-edge-dark"><Pricing /></div>
        <Faq />
      </main>
      <div className="lp-section-edge"><Closing /></div>
    </>
  );
}
