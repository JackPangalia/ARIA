import { BootLoader } from "@/components/sessions/Loaders";

/**
 * Covers the gap between navigating to the workspace and its client bundle
 * mounting. It hands off to the same orb the workspace shows while it loads
 * its own data, so the wait reads as one continuous beat.
 */
export default function AppLoading() {
  return <BootLoader />;
}
