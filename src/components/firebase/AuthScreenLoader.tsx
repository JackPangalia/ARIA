import { BootScreen } from "@/components/sessions/Loaders";

/**
 * Shown while Firebase resolves the session, and again during the redirect to
 * sign-in. Same cue as the workspace boot state so the two never look like
 * different screens loading in sequence.
 */
export function AuthScreenLoader() {
  return <BootScreen label="Signing you in" />;
}
