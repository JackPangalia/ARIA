"use client";

import Link from "next/link";
import { LandingOrb } from "@/components/landing/LandingOrb";
import { useLandingEffects } from "@/components/landing/useLandingEffects";
import { ConnectorIcon } from "@/components/settings/ConnectorIcon";
import { PLANS, TIERS } from "@/lib/plan/tiers";

const WAVE_HEIGHTS = [
  { height: 24, delay: 0 },
  { height: 42, delay: 120 },
  { height: 66, delay: 240 },
  { height: 30, delay: 80 },
  { height: 82, delay: 300 },
  { height: 52, delay: 160 },
  { height: 72, delay: 360 },
  { height: 38, delay: 40 },
  { height: 90, delay: 200 },
  { height: 46, delay: 280 },
  { height: 60, delay: 100 },
  { height: 28, delay: 340 },
  { height: 74, delay: 60 },
  { height: 50, delay: 220 },
  { height: 84, delay: 320 },
  { height: 34, delay: 140 },
];

const TESTIMONIALS = {
  s1: [
    {
      quote:
        "“I stopped taking notes three weeks ago. When someone asks ‘what did we decide,’ I just ask Kivo.”",
      name: "Nadia Osei",
      role: "Head of Product",
      avatar: "https://randomuser.me/api/portraits/women/1.jpg",
    },
    {
      quote:
        "“The diarization is the magic. It knows it’s me versus my co-founder, so the summary actually reads right.”",
      name: "Ravi Menon",
      role: "Founder",
      avatar: "https://randomuser.me/api/portraits/men/2.jpg",
    },
    {
      quote:
        "“Quiet until I need it. That restraint is rarer than the intelligence, honestly.”",
      name: "Aisha Noor",
      role: "Product Manager",
      avatar: "https://randomuser.me/api/portraits/women/9.jpg",
    },
  ],
  s2: [
    {
      quote:
        "“Saying ‘Hey Kivo, put that on the calendar’ mid-call and watching it just happen — that’s the moment everyone got it.”",
      name: "Sofia Klein",
      role: "Chief of Staff",
      avatar: "https://randomuser.me/api/portraits/women/3.jpg",
    },
    {
      quote:
        "“It settled an argument by quoting what we’d actually agreed on ten minutes earlier. Unbeatable.”",
      name: "Marcus Bell",
      role: "Engineering Lead",
      avatar: "https://randomuser.me/api/portraits/men/4.jpg",
    },
    {
      quote:
        "“The fact that there’s no bot in the call is the whole thing. It’s just there, listening.”",
      name: "Priya Raman",
      role: "Design Lead",
      avatar: "https://randomuser.me/api/portraits/women/5.jpg",
    },
  ],
  s3: [
    {
      quote:
        "“‘Hey Kivo, draft that follow-up’ — and it’s already in my drafts before the call ends.”",
      name: "Tom Alvarez",
      role: "Account Executive",
      avatar: "https://randomuser.me/api/portraits/men/6.jpg",
    },
    {
      quote:
        "“Onboarding a new teammate, I just shared the session. They were caught up in minutes.”",
      name: "Lena Fischer",
      role: "Operations",
      avatar: "https://randomuser.me/api/portraits/women/7.jpg",
    },
    {
      quote:
        "“It knows my voice from my co-founder’s. The summaries finally read like a real account of the meeting.”",
      name: "Dan Whitfield",
      role: "Co-founder",
      avatar: "https://randomuser.me/api/portraits/men/8.jpg",
    },
  ],
};

const FAQ_ITEMS = [
  {
    q: "How does Kivo know who’s speaking?",
    a: "You enroll a voice once — about eight seconds in a quiet room — and Kivo builds a voice print for that person. From then on it recognizes them automatically in any session and attaches their name to the transcript. No manual labeling, no setup before each meeting.",
  },
  {
    q: "Does it join my calls like a meeting bot?",
    a: "No. Kivo listens through your device — there’s no extra participant in the call and nothing for others to see. You hit start, and it quietly transcribes in the background until you stop it.",
  },
  {
    q: "What can I actually ask it to do?",
    a: "Say “Hey Kivo” and ask it to summarize, recall a past decision, weigh in on a disagreement, or take action — create a ClickUp task, draft a Gmail message, add a Google Calendar event, write a Notion page. Because it’s been listening, it already has the context.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Transcripts and recordings are encrypted in transit and at rest, voice profiles are only created when you explicitly enroll them, and Kivo only reads or writes to connected apps when you ask it to. You can delete any session, voice print, or connection at any time.",
  },
  {
    q: "Which apps does it connect to?",
    a: "Today: Notion, Gmail, Google Calendar, ClickUp, Google Docs and Google Sheets — with Slack, Linear, Salesforce and more on the way. Connecting or disconnecting any app takes a single click in settings.",
  },
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

function TestimonialCard({
  quote,
  name,
  role,
  avatar,
}: {
  quote: string;
  name: string;
  role: string;
  avatar: string;
}) {
  return (
    <div className="tcard">
      <p>{quote}</p>
      <div className="who2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="" />
        <div>
          <div className="nm">{name}</div>
          <div className="rl">{role}</div>
        </div>
      </div>
    </div>
  );
}

function TestimonialColumn({
  className,
  items,
}: {
  className: string;
  items: Array<{ quote: string; name: string; role: string; avatar: string }>;
}) {
  return (
    <div className={className}>
      {items.map((item) => (
        <TestimonialCard key={`a-${item.name}`} {...item} />
      ))}
      {items.map((item) => (
        <TestimonialCard key={`b-${item.name}`} {...item} />
      ))}
    </div>
  );
}

export function LandingPage() {
  useLandingEffects();
  const year = new Date().getFullYear();

  return (
    <>
      <header className="nav">
        <div className="wrap nav-inner">
          <a href="#top" className="wordmark">
            KIVO
          </a>
          <nav className="nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            <Link href="/sign-in" className="signin">
              Sign in
            </Link>
            <a href="#pricing" className="btn btn-primary">
              Start free
            </a>
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-label="Toggle menu"
            aria-expanded="false"
            aria-controls="mobile-menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <div className="mobile-menu" id="mobile-menu">
          <nav className="mobile-menu-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="mobile-menu-cta">
            <Link href="/sign-in" className="btn btn-ghost btn-lg">
              Sign in
            </Link>
            <a href="#pricing" className="btn btn-primary btn-lg">
              Start free
            </a>
          </div>
        </div>
      </header>

      <section className="hero" id="top" data-screen-label="Hero">
        <LandingOrb className="landing-orb-canvas" />
        <div className="hero-aura" />

        <div className="hero-content">
          <h1 className="display">
            <span className="grad">
              The AI that moves
              <br />
              you forward.
            </span>
          </h1>
          <p className="lead">
            Kivo listens to every conversation, learns every voice, and is
            ready the moment you say its name.
          </p>
          <div className="hero-actions">
            <Link href="/sign-in" className="btn btn-primary btn-lg">
              Start free
            </Link>
            <a href="#how" className="btn btn-ghost btn-lg">
              See how it works
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width="16"
                height="16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </div>

        <div className="hero-scroll">
          <span>Scroll</span>
          <span className="line" />
        </div>
      </section>

      <section className="how-helps" id="how" data-screen-label="How Kivo helps">
        <div className="wrap">
          <div className="section-head center reveal">
            <span className="eyebrow">Conversational intelligence</span>
            <h2 className="h2">The third mind in the room.</h2>
            <p className="lead">
              Kivo sits in, absorbs the nuance of your debate, and speaks out loud to offer objective breakthroughs the moment you say its name.
            </p>
          </div>

          <div className="helps-bento reveal">
            <div className="helps-card left-card">
              <h3 className="helps-title">
                It follows the whole conversation
              </h3>
              <p className="helps-sub">
                Every voice, every trade-off, every compromise — quietly absorbed in real time.
              </p>

              <div className="helps-timer">
                <div className="helps-timer-val">42:16</div>
                <div className="helps-rec">Recording</div>
              </div>

              <div className="helps-transcript">
                <div className="helps-turn-group">
                  <p className="helps-turn-label">Ravi</p>
                  <p className="helps-turn-text">
                    Let&apos;s simplify the dashboard so the key metrics are front and center.
                  </p>
                </div>
                <div className="helps-turn-group">
                  <p className="helps-turn-label">Sofia</p>
                  <p className="helps-turn-text">
                    Agreed — we removed the settings clutter and streamlined the layout.
                  </p>
                </div>
                <div className="helps-turn-group">
                  <p className="helps-turn-label">Marcus</p>
                  <p className="helps-turn-text">
                    But what about the database migration? That script is ready Tuesday.
                  </p>
                </div>
                <div className="helps-turn-group">
                  <p className="helps-turn-label">Sofia</p>
                  <p className="helps-turn-text">
                    If we ship the stripped-down dashboard, do we need the full schema rewrite?
                  </p>
                </div>
                <div className="helps-turn-group dim">
                  <p className="helps-turn-label">Ravi</p>
                  <p className="helps-turn-text">
                    We&apos;ve been debating this for forty minutes and we&apos;re still stuck.
                  </p>
                </div>
              </div>
            </div>

            <div className="helps-col-right">
              <div className="helps-card right-card-top">
                <h3 className="helps-title">
                  When you need help, say &ldquo;Hey Kivo&rdquo;
                </h3>

                <blockquote className="helps-quote">
                  &ldquo;Hey Kivo, weigh in. We&apos;re stuck. What do you think we should do?&rdquo;
                </blockquote>

                <div className="helps-orb-stage">
                  <div className="helps-orb-wrap">
                    <div className="helps-orb-aura" aria-hidden />
                    <LandingOrb className="helps-orb-canvas" compact />
                  </div>
                </div>
              </div>

              <div className="helps-card right-card-bottom">
                <h3 className="helps-title">
                  Speaks out loud like a human
                </h3>
                <p className="helps-sub">
                  Kivo synthesizes the debate and delivers a clear path forward.
                </p>

                <div className="helps-response-box">
                  <span className="helps-kivo-label">Kivo</span>
                  <p className="helps-kivo-line">
                    You agreed to simplify the dashboard twelve minutes ago. Ship the stripped version Tuesday — the migration is already scheduled.
                  </p>
                  <div className="helps-wave-mini" aria-hidden>
                    {WAVE_HEIGHTS.slice(0, 10).map((bar, i) => (
                      <i
                        key={i}
                        style={{
                          height: `${Math.round(bar.height * 0.45)}px`,
                          animationDelay: `${bar.delay}ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="features" data-screen-label="Features">
        <div className="wrap">
          <div className="section-head center reveal">
            <span className="eyebrow">Under the hood</span>
            <h2 className="h2">Quietly capable.</h2>
            <p className="lead">
              Everything Kivo does while it waits — and the instant you bring it
              in.
            </p>
          </div>

          <div className="bento">
            <div className="bento-tile b2 reveal">
              <div className="bento-art">
                <div className="wave">
                  {WAVE_HEIGHTS.map((bar, i) => (
                    <i
                      key={i}
                      style={{
                        height: `${bar.height}px`,
                        animationDelay: `${bar.delay}ms`,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="bento-foot">
                <span className="lbl">Real-time</span>
                <h3>Live transcription</h3>
                <p>
                  Every word, written down as it’s spoken — searchable the
                  instant you stop.
                </p>
              </div>
            </div>

            <div className="bento-tile b2 reveal d1">
              <div className="bento-art">
                <div className="rings">
                  <span className="ring r1" />
                  <span className="ring r2" />
                  <span className="ring r3" />
                  <span className="core" />
                  <span className="pip a">D</span>
                  <span className="pip b">M</span>
                </div>
              </div>
              <div className="bento-foot">
                <span className="lbl">Voice prints</span>
                <h3>Knows who’s speaking</h3>
                <p>
                  Enroll a voice in eight seconds — Kivo recognizes them in
                  every session after.
                </p>
              </div>
            </div>

            <div className="bento-tile b2 reveal d2">
              <div className="bento-art">
                <div className="orb-mini-css" />
              </div>
              <div className="bento-foot">
                <span className="lbl">On call</span>
                <h3>Always caught up</h3>
                <p>
                  Say its name and ask anything. No briefing — it already has
                  the context.
                </p>
              </div>
            </div>

            <div className="bento-tile b3 reveal">
              <div className="bento-art">
                <div className="logo-row">
                  <span className="logo-chip">
                    <ConnectorIcon slug="notion" size={26} />
                  </span>
                  <span className="logo-chip">
                    <ConnectorIcon slug="gmail" size={26} />
                  </span>
                  <span className="logo-chip">
                    <ConnectorIcon slug="googlecalendar" size={26} />
                  </span>
                  <span className="logo-chip">
                    <ConnectorIcon slug="clickup" size={26} />
                  </span>
                  <span className="logo-chip">
                    <ConnectorIcon slug="googledocs" size={26} />
                  </span>
                  <span className="logo-chip">
                    <ConnectorIcon slug="googlesheets" size={26} />
                  </span>
                  <span className="logo-chip">
                    <ConnectorIcon slug="outlook" size={26} />
                  </span>
                </div>
              </div>
              <div className="bento-foot">
                <span className="lbl">Connectors</span>
                <h3>Lives where you work</h3>
                <p>
                  Connect your apps and Kivo can pull context or take action —
                  create the task, draft the email, add the event.
                </p>
              </div>
            </div>

            <div className="bento-tile b3 reveal d1">
              <div className="bento-art">
                <div className="lockwrap">
                  <span className="halo" />
                  <span className="halo b" />
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
              </div>
              <div className="bento-foot">
                <span className="lbl">Yours alone</span>
                <h3>Private by default</h3>
                <p>
                  Encrypted end to end, consent-first voice prints, and
                  one-click control over every connection.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section tsection" data-screen-label="Testimonials">
        <div className="wrap">
          <div className="section-head center reveal">
            <span className="eyebrow">In their words</span>
            <h2 className="h2">
              Loved in the rooms
              <br />
              that move fast.
            </h2>
          </div>
        </div>
        <div className="tcols">
          <TestimonialColumn className="tcol s1" items={TESTIMONIALS.s1} />
          <TestimonialColumn className="tcol s2" items={TESTIMONIALS.s2} />
          <TestimonialColumn className="tcol s3" items={TESTIMONIALS.s3} />
        </div>
      </section>

      <section className="section" id="pricing" data-screen-label="Pricing">
        <div className="wrap">
          <div className="section-head center reveal">
            <span className="eyebrow">Pricing</span>
            <h2 className="h2">
              Start free. Grow when
              <br />
              the room does.
            </h2>
            <p className="lead">
              No card to begin. Bring Kivo into your next conversation in under
              a minute.
            </p>
          </div>
          <div className="price-grid price-grid-4">
            {TIERS.map((tier, index) => {
              const { display } = PLANS[tier];
              const cardClass = [
                "price-card",
                display.featured ? "featured" : "",
                "reveal",
                index > 0 ? `d${index}` : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div className={cardClass} key={tier}>
                  {display.featured ? (
                    <span className="badge">Most loved</span>
                  ) : null}
                  <span className="tier">{display.name}</span>
                  <div className="amt">
                    ${display.priceMonthlyUsd}
                    <span> / month</span>
                  </div>
                  <p className="desc">{display.tagline}</p>
                  <Link
                    href={
                      tier === "free"
                        ? "/sign-in"
                        : `/sign-in?plan=${tier}`
                    }
                    className={`btn ${display.featured ? "btn-primary" : "btn-ghost"}`}
                  >
                    {display.ctaLabel}
                  </Link>
                  <ul className="price-feats">
                    {display.featureBullets.map((bullet) => (
                      <li key={bullet}>
                        <CheckIcon />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section" id="faq" data-screen-label="FAQ">
        <div className="wrap">
          <div className="section-head center reveal">
            <span className="eyebrow">Questions</span>
            <h2 className="h2">Good to know.</h2>
          </div>
          <div className="faq reveal d1">
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} className="faq-item">
                <button type="button" className="faq-q">
                  {item.q}
                  <span className="pm" />
                </button>
                <div className="faq-a">
                  <div className="faq-a-inner">{item.a}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta" data-screen-label="Final CTA">
        <div className="cta-aura" />
        <div className="wrap cta-content">
          <div className="mini-orb reveal" />
          <h2 className="h2 reveal d1">
            Bring Kivo into your
            <br />
            next conversation.
          </h2>
          <p className="lead reveal d2">
            Always listening, never interrupting, ready the moment you need it.
            Start free — it takes under a minute.
          </p>
          <div
            className="hero-actions reveal d2"
            style={{ justifyContent: "center" }}
          >
            <Link href="/sign-in" className="btn btn-primary btn-lg">
              Start free
            </Link>
            <a href="mailto:hello@kivo.ai" className="btn btn-ghost btn-lg">
              Book a demo
            </a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#top" className="wordmark">
                KIVO
              </a>
              <p>
                The AI that sits in on your conversations, remembers everything,
                and moves you forward.
              </p>
            </div>
            <div className="footer-cols">
              <div className="footer-col">
                <h5>Product</h5>
                <a href="#how">How it works</a>
                <a href="#features">Features</a>
                <a href="#pricing">Pricing</a>
                <a href="#faq">FAQ</a>
              </div>
              <div className="footer-col">
                <h5>Company</h5>
                <a href="#">About</a>
                <a href="#">Careers</a>
                <a href="#">Blog</a>
                <a href="#">Contact</a>
              </div>
              <div className="footer-col">
                <h5>Legal</h5>
                <a href="#">Privacy</a>
                <a href="#">Security</a>
                <a href="#">Terms</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {year} Kivo. All rights reserved.</span>
            <span>Always listening. Never interrupting.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
