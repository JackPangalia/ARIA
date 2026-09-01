import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { KivoLogo } from "@/components/brand/KivoLogo";
import "./guide.css";

export const metadata: Metadata = {
  title: "How to use Kivo — A guide to your first conversation",
  description: "Learn how to start a conversation, ask Kivo out loud, name speakers, and revisit your summary. A practical guide, no account required.",
  alternates: { canonical: "/guide" },
  openGraph: {
    title: "Your first conversation with Kivo",
    description: "A little guidance for bringing Kivo into the room.",
    url: "/guide",
    type: "article",
  },
};

const chapters = [
  ["start", "Make room for Kivo"],
  ["ask", "Ask out loud"],
  ["follow-up", "Keep the conversation going"],
  ["speakers", "Put names to voices"],
  ["after", "Come back to it later"],
] as const;

function ChapterHeading({ number, children }: { number: string; children: React.ReactNode }) {
  return <div className="kg-chapter-heading"><span>{number}</span><h2>{children}</h2></div>;
}

function SpeakerExample() {
  return (
    <figure className="kg-speaker-example" aria-label="Example: use the arrow next to a speaker label to choose a name or add a new speaker.">
      <div className="kg-example-transcript"><span>Other speaker <span aria-hidden="true">⌃</span></span><p>What if we tried a different approach?</p></div>
      <div className="kg-speaker-menu">
        <p className="kg-speaker-title">Who was that?</p>
        <div className="kg-speaker-option is-selected"><span className="kg-avatar kg-avatar-maya">M</span><span>Maya</span><span className="kg-speaker-check" aria-hidden="true">✓</span></div>
        <div className="kg-speaker-option"><span className="kg-avatar kg-avatar-theo">T</span><span>Theo</span></div>
        <div className="kg-speaker-option is-muted"><span className="kg-avatar kg-avatar-empty" aria-hidden="true">+</span><span>New speaker</span></div>
      </div>
      <figcaption>An example of identifying a speaker in the transcript.</figcaption>
    </figure>
  );
}

export default function GuidePage() {
  return (
    <div className="kg-page" id="top">
      <a className="lp-skip" href="#guide-content">Skip to guide</a>
      <header className="lp-nav kg-nav">
        <div className="lp-wrap kg-nav-inner">
          <Link href="/" aria-label="Kivo home"><KivoLogo className="lp-wordmark" /></Link>
          <nav aria-label="Guide navigation">
            <Link href="/guide" className="lp-link" aria-current="page">Guide</Link>
            <Link href="/#pricing" className="lp-link">Pricing</Link>
          </nav>
          <Link href="/app" className="lp-btn lp-btn-outline">Open Kivo <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <main id="guide-content" className="lp-wrap kg-main">
        <header className="kg-hero">
          <div className="kg-hero-copy">
            <p className="lp-section-index">The Kivo guide / Getting started</p>
            <h1>Your first<br />conversation<br /><em>with Kivo.</em></h1>
            <p className="kg-deck">A place at the table. A question out loud.<br className="kg-desktop-break" /> Here’s how to bring Kivo into the conversation.</p>
            <a className="kg-read-link" href="#start">Let’s get started <span aria-hidden="true">↓</span></a>
          </div>
          <figure className="kg-hero-image">
            <div><Image src="/landing/kivo-hero-study-session-motion-v2.png" alt="Friends gathered around a table for a study session" fill priority sizes="(max-width: 760px) 100vw, 45vw" /></div>
            <figcaption>Made for the conversations that happen face to face.</figcaption>
          </figure>
        </header>

        <div className="kg-reading-layout">
          <aside className="kg-contents">
            <p className="lp-section-index">In this guide</p>
            <nav aria-label="Guide chapters">
              {chapters.map(([id, title], index) => <a href={`#${id}`} key={id}><span>0{index + 1}</span>{title}</a>)}
              <a href="#quick-reference"><span>↳</span>A few useful phrases</a>
            </nav>
            <p>No setup ritual. You can learn as you go.</p>
          </aside>

          <article className="kg-article" aria-label="How to use Kivo">
            <p className="kg-introduction">Kivo joins the conversation through your microphone. It follows what’s being said, answers when you ask, and keeps a transcript and summary for afterward. You can use it on your own, with a friend, or around a table with your team.</p>

            <section id="start" className="kg-chapter">
              <ChapterHeading number="01">Make room for Kivo.</ChapterHeading>
              <p>Open Kivo and choose <strong>Start conversation</strong>. Allow microphone access when asked, and keep your device where it can hear the people speaking.</p>
              <p>Before you begin, make sure everyone knows the conversation is being transcribed and agrees to it. Once the session starts, the <strong>Listening</strong> label and timer tell you Kivo is listening.</p>
              <aside className="kg-margin-note"><span aria-hidden="true">↳</span><p>Talk to each other as you normally would. You don’t have to address every sentence to Kivo.</p></aside>
            </section>

            <section id="ask" className="kg-chapter">
              <ChapterHeading number="02">Ask out loud.</ChapterHeading>
              <p>When you want Kivo’s help, say <strong>“Hey Kivo,”</strong> followed by your question. It can use the conversation so far as context, so you don’t have to start your explanation over.</p>
              <blockquote className="kg-spoken-example"><p>“Hey Kivo, what’s the strongest argument against that idea?”</p><footer>Try a question about what you’re discussing.</footer></blockquote>
              <p>The status changes as Kivo captures your question, thinks, and speaks its answer. If it needs to search the web, you’ll see that too.</p>
            </section>

            <section id="follow-up" className="kg-chapter">
              <ChapterHeading number="03">Keep the conversation going.</ChapterHeading>
              <p>After an answer, watch for <strong>Follow-up</strong>. While that label is showing, you can ask another question without saying Kivo’s name again. When the status returns to Listening, use “Hey Kivo” for your next question.</p>
              <p>When you’re finished with the exchange, say <strong>“Thank you, Kivo.”</strong> Kivo returns to listening to the room. This does <em>not</em> stop the session’s recording.</p>
              <dl className="kg-controls">
                <div><dt>Silence</dt><dd>Stops Kivo’s current response. The session keeps listening.</dd></div>
                <div><dt>Stop</dt><dd>Ends recording. Use this when the conversation is over.</dd></div>
              </dl>
            </section>

            <section id="speakers" className="kg-chapter">
              <ChapterHeading number="04">Put names to voices.</ChapterHeading>
              <p>In a conversation with speaker recognition enabled, you can identify people in the transcript after recording stops. Tap the small arrow beside a speaker label, choose their name, or select <strong>New speaker</strong>.</p>
              <SpeakerExample />
              <p>If a name is wrong, use the same arrow to correct it. Speaker attribution is available in speaker recognition mode; basic transcription doesn’t offer these controls. Identify someone’s voice only with their permission.</p>
            </section>

            <section id="after" className="kg-chapter">
              <ChapterHeading number="05">Come back to it later.</ChapterHeading>
              <p>Press <strong>Stop</strong> when you’re done. Kivo prepares an Overview with a summary and transcript. The summary gathers the key points, decisions, and action items when there’s enough conversation to summarize.</p>
              <p>Open the transcript to revisit what was said, or find the conversation again from your home screen. If you want to pick it back up, choose <strong>Resume</strong>.</p>
            </section>

            <section id="quick-reference" className="kg-chapter kg-reference">
              <p className="lp-section-index">Keep these handy</p>
              <h2>A few useful phrases.</h2>
              <dl>
                <div><dt>“Hey Kivo…”</dt><dd>Bring Kivo into the conversation and ask a question.</dd></div>
                <div><dt>“Thank you, Kivo.”</dt><dd>Finish the exchange and return to listening. Recording continues.</dd></div>
                <div><dt>“Stop.”</dt><dd>Silence Kivo while it’s responding. You can also say “thank you” or “shut up.” To end recording, press the Stop button.</dd></div>
              </dl>
            </section>

            <footer className="kg-article-end">
              <KivoLogo variant="mark" className="kg-end-mark" title="Kivo" /><p>You don’t need to memorize any of this. New users get small, optional tips as they use Kivo.</p>
            </footer>
          </article>
        </div>

        <section className="kg-closing" aria-labelledby="kg-closing-title">
          <p className="lp-section-index">Your turn</p>
          <h2 id="kg-closing-title">The best way to learn<br />is <em>out loud.</em></h2>
          <Link href="/app" className="lp-btn lp-btn-primary">Start a conversation <span aria-hidden="true">↗</span></Link>
        </section>
      </main>
      <footer className="lp-wrap kg-footer"><Link href="/" aria-label="Kivo home"><KivoLogo className="lp-wordmark" /></Link><p>In the room with you.</p><nav aria-label="Footer"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="#top">Back to top ↑</a></nav></footer>
    </div>
  );
}
