import { z } from "zod";
import type { AriaStatus } from "@/lib/types";

export const TOPIC_IDS = ["together", "wake", "followup", "speaker", "overview"] as const;
export type EducationTopic = (typeof TOPIC_IDS)[number];
export type EducationAnchor = "start" | "voice" | "speaker" | "overview";

export const EDUCATION_TOPICS: Record<EducationTopic, {
  title: string;
  body: string;
  anchor: EducationAnchor;
  detail?: string;
}> = {
  together: {
    title: "Better together.",
    body: "Bring a friend or colleague into the conversation. Keep Kivo within earshot, and make sure everyone knows it’s transcribing.",
    anchor: "start",
  },
  wake: {
    title: "Ask out loud.",
    body: "Say “Hey Kivo,” then ask your question. Kivo uses the conversation so far for context.",
    anchor: "voice",
  },
  followup: {
    title: "Keep talking, or wrap up.",
    body: "While Kivo shows Follow-up, ask another question without repeating its name. Say “Thank you, Kivo” when you’re done. Recording continues until you press Stop.",
    detail: "Silence stops Kivo’s current response. Stop ends recording. While Kivo is responding, you can also say “stop,” “thank you,” or “shut up” to silence it.",
    anchor: "voice",
  },
  speaker: {
    title: "Who’s speaking?",
    body: "Tap the arrow beside a speaker to choose a name or add someone new.",
    detail: "Speaker attribution is available in the transcript when speaker recognition is enabled.",
    anchor: "speaker",
  },
  overview: {
    title: "Come back to the conversation.",
    body: "Your summary and transcript live here. Revisit the key points or check who said what.",
    anchor: "overview",
  },
};

export const EducationStateSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  retired: z.array(z.enum(TOPIC_IDS)).max(TOPIC_IDS.length),
  generation: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
});
export type EducationState = z.infer<typeof EducationStateSchema>;

export const EducationMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retire"), topic: z.enum(TOPIC_IDS), generation: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("hide"), generation: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal("restart") }).strict(),
]);
export type EducationMutation = z.infer<typeof EducationMutationSchema>;

// Fixed to this feature's introduction, not deployment time. No environment
// setup is needed, and subsequent deploys do not re-enroll established accounts.
export const EDUCATION_LAUNCH_AT = "2026-08-27T03:33:07Z";

export function initialEducationState(createdAt: string): EducationState {
  const created = Date.parse(createdAt);
  const release = Date.parse(EDUCATION_LAUNCH_AT);
  return {
    version: 1,
    enabled: Number.isFinite(created) && Number.isFinite(release) && created >= release,
    retired: [],
    generation: 0,
    revision: 0,
  };
}

/** Apply inside a transaction: retirement merges, and stale pre-replay writes do nothing. */
export function applyEducationMutation(state: EducationState, mutation: EducationMutation): EducationState {
  if (mutation.action === "restart") {
    return { ...state, enabled: true, retired: [], generation: state.generation + 1, revision: state.revision + 1 };
  }
  if (mutation.generation !== state.generation) return state;
  if (mutation.action === "hide") {
    return state.enabled ? { ...state, enabled: false, revision: state.revision + 1 } : state;
  }
  if (state.retired.includes(mutation.topic)) return state;
  return { ...state, retired: [...state.retired, mutation.topic], revision: state.revision + 1 };
}

export type EducationActivity = {
  status: AriaStatus;
  running: boolean;
  home: boolean;
  overview: boolean;
  blocked: boolean;
};

export const QUIET_ACTIVITY: EducationActivity = {
  status: "idle", running: false, home: false, overview: false, blocked: true,
};
export const TIP_INTERVAL_MS = 20_000;
export const TIP_VISIT_LIMIT = 3;

export function educationIsQuiet(activity: EducationActivity): boolean {
  return !activity.blocked && ["idle", "listening", "follow-up-listening"].includes(activity.status);
}

export function topicIsRelevant(topic: EducationTopic, activity: EducationActivity): boolean {
  switch (topic) {
    case "together": return activity.home && !activity.running;
    case "wake": return activity.running && activity.status === "listening";
    case "followup": return activity.running && activity.status === "follow-up-listening";
    case "speaker":
    case "overview": return activity.overview && !activity.running;
  }
}

export function chooseEducationTopic(input: {
  state: EducationState | null;
  activity: EducationActivity;
  available: ReadonlySet<EducationAnchor>;
  shown: ReadonlySet<EducationTopic>;
  lastHiddenAt: number | null;
  now: number;
  preview?: boolean;
}): EducationTopic | null {
  const { state, activity, available, shown, lastHiddenAt, now, preview = false } = input;
  if (!educationIsQuiet(activity)) return null;
  if (!preview && (!state?.enabled || shown.size >= TIP_VISIT_LIMIT)) return null;
  if (!preview && lastHiddenAt !== null && now - lastHiddenAt < TIP_INTERVAL_MS) return null;
  // Attribution is actionable; the general Overview explanation can wait.
  const priority: EducationTopic[] = ["speaker", "together", "wake", "followup", "overview"];
  return priority.find((topic) =>
    (preview || !state?.retired.includes(topic)) && !shown.has(topic) &&
    available.has(EDUCATION_TOPICS[topic].anchor) && topicIsRelevant(topic, activity),
  ) ?? null;
}
