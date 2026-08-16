"use client";

import Link from "next/link";
import { ImageStreamHero } from "@/components/ui/image-stream-hero";
import { useLandingEffects } from "@/components/landing/useLandingEffects";
import { planFeatureBullets, PLANS, MARKETING_TIERS } from "@/lib/plan/tiers";

const HERO_IMAGES = [
  {
    src: "/landing/kivo-hero-whiteboard-workshop.png",
    alt: "Young team collaborating around a whiteboard in a loft studio",
  },
  {
    src: "/landing/kivo-hero-night-build.png",
    alt: "Young founders working late at a desk overlooking the city",
  },
  {
    src: "/landing/kivo-hero-bali-brainstorm.png",
    alt: "Young founders brainstorming at a tropical work villa",
  },
  {
    src: "/landing/kivo-hero-study-session.png",
    alt: "Young people working together around a busy study table",
  },
  {
    src: "/landing/kivo-hero-production-review.png",
    alt: "Young creative team reviewing a project in a production studio",
  },
  {
    src: "/landing/kivo-hero-pitch-practice.png",
    alt: "Young founder presenting an idea to a team in a meeting room",
  },
  {
    src: "/landing/kivo-hero-whiteboard-critique.png",
    alt: "Young product team reviewing wireframes on a whiteboard",
  },
  {
    src: "/landing/kivo-hero-city-boardroom.png",
    alt: "Young founders preparing for a meeting in a city boardroom",
  },
  {
    src: "/landing/kivo-hero-oceanfounders.png",
    alt: "Young founders working together overlooking the ocean at sunset",
  },
  {
    src: "/landing/kivo-hero-cinematic-meeting.png",
    alt: "Small team in a thoughtful in-person meeting",
  },
  {
    src: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80",
    alt: "Team together",
  },
  {
    src: "https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=900&q=80",
    alt: "Open workspace",
  },
] as const;

const STORY = [
  {
    step: "1",
    title: "Start listening",
    body: "Start a Kivo session before your meeting or conversation. Kivo listens through your microphone and creates a live, speaker-attributed transcript.",
  },
  {
    step: "2",
    title: "Ask Kivo",
    body: "Say “Hey Kivo” whenever you need something. Ask a question, clarify something that was discussed, summarize a point, or get help without leaving the conversation.",
  },
  {
    step: "3",
    title: "Keep the context",
    body: "When the meeting ends, Kivo gives you the transcript, decisions, action items, and a clear summary of what happened.",
  },
] as const;

const CAPABILITIES = [
  {
    title: "Knows who’s speaking",
    body: "Kivo separates speakers so it can understand who said what.",
  },
  {
    title: "Understands the conversation",
    body: "Ask about something discussed five minutes ago without explaining the context again.",
  },
  {
    title: "Speaks when invited",
    body: "Kivo doesn’t constantly interrupt. It listens and responds when someone asks for it.",
  },
  {
    title: "Remembers the meeting",
    body: "Every session becomes searchable context you can return to later.",
  },
] as const;

const ROOM_MOMENTS = [
  {
    title: "Team meetings.",
    body: "Keep the conversation clear, even when every voice matters.",
  },
  {
    title: "Brainstorming.",
    body: "Stay with the ideas while Kivo holds onto the context.",
  },
  {
    title: "Planning.",
    body: "Bring decisions, tradeoffs, and next steps into focus.",
  },
  {
    title: "Everyday conversations.",
    body: "A shared memory for the conversations that move work forward.",
  },
] as const;

const FAQ_ITEMS = [
  {
    q: "Is Kivo a meeting recorder?",
    a: "Kivo can transcribe and summarize meetings, but that isn’t the main idea. Kivo is a voice AI you can interact with during the conversation itself.",
  },
  {
    q: "Does Kivo join Zoom or Google Meet calls?",
    a: "Kivo is designed primarily for conversations happening around you. It listens through your device instead of joining as a meeting bot.",
  },
  {
    q: "How does Kivo know who’s speaking?",
    a: "Kivo uses speaker recognition to distinguish between people in the conversation and keep track of who said what.",
  },
  {
    q: "What can I ask Kivo?",
    a: "You can ask questions about the conversation, request summaries, clarify something that was said, brainstorm ideas, retrieve earlier points, or ask general questions.",
  },
  {
    q: "Does Kivo listen all the time?",
    a: "Kivo only listens while you have an active session running.",
  },
  {
    q: "Is my data private?",
    a: "Your conversations are handled according to Kivo’s privacy policy. You remain in control of your sessions and stored conversation history.",
  },
];

export function LandingPage() {
  useLandingEffects();
  const year = new Date().getFullYear();

  return (
    <>
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <a href="#top" className="lp-wordmark">
            Kivo
          </a>

          <div className="lp-nav-mobile">
            <Link href="/sign-in" className="lp-btn lp-btn-primary">
              Start free
            </Link>
            <button
              type="button"
              className="lp-nav-toggle"
              aria-label="Toggle menu"
              aria-expanded="false"
              aria-controls="mobile-menu"
            >
              <span />
              <span />
              <span />
            </button>
          </div>

          <div className="lp-nav-cta">
            <nav className="lp-nav-links" aria-label="Primary">
              <a href="#pricing" className="lp-link">
                Pricing
              </a>
              <a href="#faq" className="lp-link">
                FAQ
              </a>
            </nav>
            <Link href="/sign-in" className="lp-link">
              Sign in
            </Link>
            <Link href="/sign-in" className="lp-btn lp-btn-primary">
              Start free
            </Link>
          </div>
        </div>

        <div className="lp-wrap lp-mobile-menu" id="mobile-menu">
          <nav aria-label="Mobile">
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <Link href="/sign-in">Sign in</Link>
          </nav>
          <div className="lp-mobile-menu-cta">
            <Link href="/sign-in" className="lp-btn lp-btn-primary">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero" id="top">
          <ImageStreamHero images={HERO_IMAGES} className="lp-hero-stream">
            <div className="lp-hero-stream-scrim" aria-hidden />
            <div className="lp-hero-stream-inner">
              <h1 className="lp-display">
                The voice AI
                <br />
                built for meetings.
              </h1>
              <div className="lp-hero-stream-foot">
                <p className="lp-lead">
                  Kivo listens to the conversation, understands who’s speaking,
                  and answers out loud when you ask it to.
                </p>
                <div className="lp-hero-actions">
                  <Link href="/sign-in" className="lp-btn lp-btn-primary">
                    Start free
                  </Link>
                </div>
                <p className="lp-note">No credit card required.</p>
              </div>
            </div>
          </ImageStreamHero>
        </section>

        <section className="lp-section" aria-labelledby="pitch-heading">
          <div className="lp-wrap lp-split">
            <h2 className="lp-display lp-split-title" id="pitch-heading">
              Kivo understands the room.
            </h2>
            <div className="lp-split-copy">
              <p>ChatGPT understands you. Most voice AI is built for one person talking to an AI.</p>
              <p>
                Kivo is built for everyone at the table. It follows the
                conversation, keeps track of who said what, and stays quiet
                until someone asks for it.
              </p>
            </div>
          </div>

          <div className="lp-wrap lp-stage">
            <figure className="lp-stage-main">
              <img
                src="/landing/kivo-tidal-water.png"
                alt="Tide moving over dark coastal stone"
                width={1600}
                height={1066}
              />
            </figure>
            <figure className="lp-stage-side">
              <img
                src="/landing/kivo-alpine-dawn.png"
                alt="Mountain ridge above clouds at dawn"
                width={1200}
                height={1600}
              />
            </figure>
          </div>
        </section>

        <section className="lp-section" id="how" aria-labelledby="story-heading">
          <div className="lp-wrap lp-split">
            <h2 className="lp-display lp-split-title" id="story-heading">
              Start. Ask. Keep.
            </h2>
            <ol className="lp-story">
              {STORY.map((item) => (
                <li key={item.step} className="lp-story-item">
                  <span className="lp-story-step" aria-hidden>
                    {item.step.padStart(2, "0")}
                  </span>
                  <div className="lp-story-copy">
                    <h3 className="lp-story-title">{item.title}.</h3>
                    <p className="lp-story-body">{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className="lp-section lp-section-scene lp-scene-sequence"
          aria-labelledby="scene-heading"
        >
          <div className="lp-wrap">
            <figure className="lp-scene" data-room-scene>
              <img
                src="/landing/kivo-whole-room.png"
                alt="People talking across a table"
                width={1800}
                height={1200}
              />
              <div className="lp-scene-scrim" aria-hidden />
              <figcaption className="lp-scene-copy">
                <h2 className="lp-scene-title" id="scene-heading">
                  The whole room.
                </h2>
                {ROOM_MOMENTS.map((moment, index) => (
                  <div
                    className="lp-room-moment"
                    data-room-moment
                    data-active={index === 0 ? "true" : undefined}
                    key={moment.title}
                  >
                    <h3>{moment.title}</h3>
                    <p>{moment.body}</p>
                  </div>
                ))}
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          className="lp-section"
          id="capabilities"
          aria-labelledby="capabilities-heading"
        >
          <div className="lp-wrap">
            <h2 className="lp-display lp-caps-title" id="capabilities-heading">
              One AI. The whole conversation.
            </h2>
            <ul className="lp-caps">
              {CAPABILITIES.map((item) => (
                <li key={item.title} className="lp-cap">
                  <h3 className="lp-cap-title">{item.title}.</h3>
                  <p className="lp-cap-body">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className="lp-section"
          id="pricing"
          aria-labelledby="pricing-heading"
        >
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 className="lp-display" id="pricing-heading">
                Two plans.
              </h2>
              <p className="lp-lead">Start free. Upgrade when you need more time.</p>
            </div>
            <ul className="lp-plans">
              {MARKETING_TIERS.map((tier) => {
                const { display } = PLANS[tier];
                return (
                  <li
                    key={tier}
                    className={`lp-plan${display.featured ? " featured" : ""}`}
                  >
                    <div className="lp-plan-top">
                      <span className="lp-plan-name">{display.name}</span>
                      <span className="lp-plan-price">
                        {display.priceMonthlyUsd === 0
                          ? "$0"
                          : `$${display.priceMonthlyUsd}`}
                        <span className="lp-plan-period">/mo</span>
                      </span>
                      <p className="lp-plan-desc">{display.tagline}</p>
                    </div>
                    <ul className="lp-plan-feats">
                      {planFeatureBullets(tier).map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                    <Link
                      href={
                        tier === "free" ? "/sign-in" : `/sign-in?plan=${tier}`
                      }
                      className={
                        display.featured
                          ? "lp-btn lp-btn-primary lp-plan-btn"
                          : "lp-btn lp-btn-ghost lp-plan-btn"
                      }
                    >
                      {display.ctaLabel}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="lp-section" id="faq" aria-labelledby="faq-heading">
          <div className="lp-wrap lp-split">
            <h2 className="lp-display lp-split-title" id="faq-heading">
              Questions.
            </h2>
            <div className="lp-faq">
              {FAQ_ITEMS.map((item) => (
                <details key={item.q} className="lp-faq-item" name="faq">
                  <summary className="lp-faq-q">
                    {item.q}
                    <span className="pm" aria-hidden />
                  </summary>
                  <div className="lp-faq-a">
                    <div className="lp-faq-a-inner">
                      {item.q === "Is my data private?" ? (
                        <>
                          Your conversations are handled according to Kivo’s{" "}
                          <Link href="/privacy" className="lp-inline-link">
                            privacy policy
                          </Link>
                          . You remain in control of your sessions and stored
                          conversation history.
                        </>
                      ) : (
                        item.a
                      )}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-cta">
          <h2 className="lp-display" id="close-heading">
            Bring AI into the conversation.
          </h2>
          <div className="lp-hero-actions">
            <Link href="/sign-in" className="lp-btn lp-btn-primary">
              Start free
            </Link>
          </div>
          <p className="lp-note">No credit card required.</p>
        </div>

        <a href="#top" className="lp-footer-mark" aria-label="Kivo, back to top">
          Kivo
        </a>

        <div className="lp-wrap lp-footer-meta">
          <div className="lp-footer-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:hello@kivo.ai">Contact</a>
          </div>
          <p className="lp-footer-copy">
            © {year} Centonis AI Inc. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}
