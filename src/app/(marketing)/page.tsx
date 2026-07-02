import { LandingPage } from "@/components/landing/LandingPage";
import { TrackOnMount } from "@/components/ClientBoot";

export default function HomePage() {
  return (
    <>
      <TrackOnMount name="landing_view" />
      <LandingPage />
    </>
  );
}
