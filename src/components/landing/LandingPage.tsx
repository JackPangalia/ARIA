"use client";

import Image from "next/image";
import Link from "next/link";
import { AskKivoVisual } from "@/components/landing/AskKivoVisual";
import { FAQ_ITEMS } from "@/components/landing/faq-content";
import { HearTheRoomVisual } from "@/components/landing/HearTheRoomVisual";
import { KeepTheRoomVisual } from "@/components/landing/KeepTheRoomVisual";
import { useLandingEffects } from "@/components/landing/useLandingEffects";
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

const TRUST_ITEMS = [
  {
    title: "Raw audio isn’t stored.",
    body: "Your microphone audio is streamed for live transcription. Kivo keeps the text, not an audio recording.",
    image: "/landing/nature-privacy-water-v1.png",
    alt: "Pale blue water flowing over smooth cream-colored stone",
    className: "lp-trust-item lp-trust-item-wide",
  },
  {
    title: "Your conversations don’t train AI models.",
    body: "Kivo does not sell your data or use your conversations to train its own or third-party models.",
    image: "/landing/kivo-lifestyle-bouldering-motion-v2.png",
    alt: "Two friends bouldering beneath a dark rock face in a green forest",
    className: "lp-trust-item lp-trust-item-tall",
  },
  {
    title: "Delete it when you choose.",
    body: "Remove a session whenever you want, or delete your account and its associated conversation history.",
    image: "/landing/kivo-lifestyle-golf-pair-motion-v2.png",
    alt: "Two friends playing golf together across a softly blurred green",
    className: "lp-trust-item lp-trust-item-portrait",
  },
] as const;

function SiteHeader() {
  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-inner">
        <a href="#top" className="lp-wordmark" aria-label="Kivo, back to top">Kivo</a>
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
        <Link href="/sign-in" className="lp-btn lp-btn-primary">Start free</Link>
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
        <p className="lp-section-index">01 / The room</p>
        <h2 id="manifesto-heading" className="lp-manifesto-copy" data-lp-reveal>
          <span>Six people are talking. Everything that matters is said out loud, once.</span>{" "}
          <span>Kivo hears all of it.</span>
        </h2>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="lp-story" id="how" aria-labelledby="how-heading">
      <div className="lp-wrap lp-story-intro" data-lp-reveal>
        <p className="lp-section-index">02 / How it works</p>
        <h2 className="lp-editorial-title" id="how-heading">Present for the conversation.<br />Quiet until you need it.</h2>
      </div>
      <div className="lp-wrap lp-scenes">
        <article className="lp-scene" data-lp-reveal>
          <div className="lp-scene-copy">
            <span className="lp-scene-number">01</span>
            <p className="lp-scene-label">Listen</p>
            <h3>Kivo hears the whole room.</h3>
            <p>Start a session and Kivo follows the live conversation, separating speakers as they talk.</p>
          </div>
          <HearTheRoomVisual />
        </article>

        <article className="lp-scene lp-scene-reverse" data-lp-reveal>
          <div className="lp-scene-copy">
            <span className="lp-scene-number">02</span>
            <p className="lp-scene-label">Ask</p>
            <h3>Say, “Hey Kivo.”</h3>
            <p>Ask about what is being discussed. Kivo already has the context, so you do not have to explain it again.</p>
          </div>
          <AskKivoVisual />
        </article>

        <article className="lp-scene" data-lp-reveal>
          <div className="lp-scene-copy">
            <span className="lp-scene-number">03</span>
            <p className="lp-scene-label">Keep</p>
            <h3>Leave with the conversation intact.</h3>
            <p>Return to the transcript and overview after the session, with the speakers and important context still connected.</p>
          </div>
          <KeepTheRoomVisual />
        </article>
      </div>
    </section>
  );
}

function ProductShowcase() {
  return (
    <section className="lp-showcase" aria-labelledby="showcase-heading">
      <div className="lp-wrap">
        <div className="lp-showcase-panel" data-lp-reveal>
          <Image src="/landing/kivo-session-afterglow-motion-v1.png" alt="A warmly lit meeting room after a conversation, with figures leaving through the doorway" fill sizes="(max-width: 760px) 100vw, 1200px" className="lp-showcase-bg" />
          <div className="lp-showcase-copy">
            <p className="lp-section-index">03 / After the meeting</p>
            <h2 className="lp-editorial-title" id="showcase-heading">Every session stays with you.</h2>
            <p>The overview and transcript remain available after an in-person session ends, so the conversation does not disappear when everyone leaves the room.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="lp-trust" aria-labelledby="trust-heading">
      <div className="lp-wrap">
        <div className="lp-trust-head" data-lp-reveal>
          <p className="lp-section-index">04 / Your data</p>
          <div><h2 className="lp-editorial-title" id="trust-heading">Your conversations stay yours.</h2><p>Kivo is designed to be useful in the room without turning the room into an audio archive.</p></div>
        </div>
        <div className="lp-trust-grid">
          {TRUST_ITEMS.map((item) => (
            <article key={item.title} className={item.className} data-lp-reveal>
              <figure><Image src={item.image} alt={item.alt} fill sizes="(max-width: 760px) 100vw, 40vw" /></figure>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="lp-pricing" id="pricing" aria-labelledby="pricing-heading">
      <div className="lp-wrap">
        <div className="lp-pricing-head" data-lp-reveal>
          <p className="lp-section-index">05 / Pricing</p>
          <div><h2 className="lp-editorial-title" id="pricing-heading">Start with the next conversation.</h2><p>Try Kivo free. Upgrade when you need more listening time.</p></div>
        </div>
        <ul className="lp-plans">
          {MARKETING_TIERS.map((tier) => {
            const { display } = PLANS[tier];
            return (
              <li key={tier} className="lp-plan" data-lp-reveal>
                <div className="lp-plan-name-row"><span className="lp-plan-name">{display.name}</span>{display.featured ? <span className="lp-plan-tag">For regular use</span> : null}</div>
                <p className="lp-plan-price">{display.priceMonthlyUsd === 0 ? "$0" : `$${display.priceMonthlyUsd}`}<span> / month</span></p>
                <p className="lp-plan-desc">{display.tagline}</p>
                <ul className="lp-plan-feats">{planFeatureBullets(tier).map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                <Link href={tier === "free" ? "/sign-in" : `/sign-in?plan=${tier}`} className={display.featured ? "lp-btn lp-btn-primary lp-plan-btn" : "lp-btn lp-btn-outline lp-plan-btn"}>{display.ctaLabel}</Link>
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
          <a href="#top" className="lp-footer-wordmark">Kivo</a>
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
      <main><Hero /><Manifesto /><HowItWorks /><ProductShowcase /><TrustSection /><Pricing /><Faq /></main>
      <Closing />
    </>
  );
}
