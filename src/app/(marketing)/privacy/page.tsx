import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Kivo",
  description: "How Kivo collects, uses, and protects your data.",
};

// NOTE: Drafted for launch; have legal counsel review before scaling paid
// acquisition, especially the recording-consent language.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-20 text-[15px] leading-relaxed">
      <h1 className="mb-2 text-3xl font-bold">Privacy Policy</h1>
      <p className="mb-10 text-sm opacity-70">Effective: July 2, 2026</p>

      <Section title="What Kivo is">
        <p>
          Kivo (&quot;we&quot;, &quot;us&quot;) is a real-time AI assistant that listens to live,
          in-person conversations through your device&apos;s microphone, produces a
          speaker-attributed transcript, and answers questions when you address
          it. This policy explains what we collect, why, and the controls you
          have. Questions: <a className="underline" href="mailto:hello@kivo.ai">hello@kivo.ai</a>.
        </p>
      </Section>

      <Section title="Recording and consent — read this first">
        <p>
          When you start a Kivo session, <strong>everything picked up by your
          microphone is transcribed</strong>, including the voices of other
          people in the room. You are responsible for telling participants that
          the conversation is being transcribed and for obtaining any consent
          required where you are. Many jurisdictions (for example California and
          Washington in the US, and many countries) require the consent of{" "}
          <strong>all</strong> parties before a conversation may be recorded.
          Kivo shows a consent reminder before your first session and a
          persistent indicator while listening, but legal compliance in your
          jurisdiction is your responsibility.
        </p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Account data</strong> — name, email, and profile photo from
            your sign-in provider (Google or email/password via Firebase
            Authentication).
          </li>
          <li>
            <strong>Audio</strong> — microphone audio is streamed to our speech
            provider (Speechmatics) for live transcription.{" "}
            <strong>We do not store raw audio recordings.</strong> What we keep
            is the text transcript.
          </li>
          <li>
            <strong>Transcripts and session content</strong> — speaker-labeled
            transcripts, questions you ask Kivo, Kivo&apos;s answers, session
            summaries, and notes/pins you create.
          </li>
          <li>
            <strong>Voice profiles</strong> — if you enroll a speaker, we store
            the speaker-identifier strings our speech provider derives from
            their voice, under your account, so future sessions can label them
            by name. Enroll a voice only with that person&apos;s permission.
          </li>
          <li>
            <strong>Project files</strong> — documents you upload as project
            sources (text is extracted and stored).
          </li>
          <li>
            <strong>Usage and billing</strong> — listening minutes and ask usage
            for plan limits; payment details are handled by Stripe (we never see
            card numbers).
          </li>
          <li>
            <strong>First-party analytics</strong> — a random identifier and
            coarse product events (e.g. &quot;session started&quot;). We use no
            third-party ad trackers.
          </li>
          <li>
            <strong>Error reports</strong> — if the app crashes in your browser,
            an error message and stack trace may be sent to us to fix it.
          </li>
        </ul>
      </Section>

      <Section title="How your data is used">
        <p>
          To run the product: transcribe your sessions, generate answers and
          summaries, remember enrolled speakers, enforce plan limits, process
          payments, and fix bugs. We do not sell your data, and we do not use
          your conversations to train our own or third parties&apos; AI models.
        </p>
      </Section>

      <Section title="Service providers (subprocessors)">
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Google Cloud / Firebase</strong> — authentication, database, hosting of your data.</li>
          <li><strong>Google Gemini</strong> — generates Kivo&apos;s answers from your session context.</li>
          <li><strong>Speechmatics</strong> — real-time speech-to-text and speaker identification.</li>
          <li><strong>Cartesia</strong> — converts Kivo&apos;s answers to speech.</li>
          <li><strong>Stripe</strong> — subscription billing.</li>
          <li><strong>Composio</strong> — optional app connectors (only if you connect an app).</li>
          <li><strong>Vercel</strong> — application hosting and logs.</li>
        </ul>
      </Section>

      <Section title="Retention and deletion">
        <p>
          Session history is retained per your plan (30 days on Free, 1 year on
          Plus, unlimited on Pro and Max). Sessions past your plan&apos;s window are
          hidden immediately and permanently deleted by a scheduled job shortly
          after. You can delete any session yourself at any time, and deleting
          your account (Settings → Delete account) permanently removes your
          transcripts, voice profiles, projects, usage records, and analytics
          events, and cancels any active subscription.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Depending on where you live (including under GDPR and CCPA), you may
          have rights to access, export, correct, or delete your personal data.
          You can export transcripts and delete sessions or your whole account
          in-app; for anything else, email{" "}
          <a className="underline" href="mailto:hello@kivo.ai">hello@kivo.ai</a>{" "}
          and we&apos;ll respond within 30 days.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit (TLS) and at rest by our cloud providers.
          Access to your data is scoped to your account by database security
          rules; plan and usage records are writable only by our servers.
        </p>
      </Section>

      <Section title="Children">
        <p>Kivo is not directed at children and must not be used by anyone under 16.</p>
      </Section>

      <Section title="Changes">
        <p>
          We&apos;ll update this page and the effective date when the policy changes;
          material changes will be announced in the app.
        </p>
      </Section>

      <p className="mt-12 text-sm opacity-70">
        See also our <Link className="underline" href="/terms">Terms of Service</Link>.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
