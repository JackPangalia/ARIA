import { LandingPage } from "@/components/landing/LandingPage";
import { FAQ_JSON_LD } from "@/components/landing/faq-content";
import { TrackOnMount } from "@/components/ClientBoot";

const faqJson = JSON.stringify(FAQ_JSON_LD);

export default function HomePage() {
  return (
    <>
      <TrackOnMount name="landing_view" />
      <LandingPage />
      <script type="application/ld+json">{faqJson}</script>
    </>
  );
}
