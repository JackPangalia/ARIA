import { CONNECTORS_ENABLED } from "@/lib/features";

export type SettingsTab =
  | "account"
  | "usage_billing"
  | "appearance"
  | "model"
  | "speakers"
  | "connectors"
  | "trash";

export type SettingsNavItem = {
  id: SettingsTab;
  label: string;
};

export const SETTINGS_NAV_GROUPS: { label: string; tabs: SettingsTab[] }[] = [
  { label: "App", tabs: ["account", "appearance", "usage_billing"] },
  {
    label: "Kivo",
    tabs: CONNECTORS_ENABLED
      ? ["model", "speakers", "connectors", "trash"]
      : ["model", "speakers", "trash"],
  },
];

export const SETTINGS_TAB_META: Record<
  SettingsTab,
  { title: string; description: string; label: string }
> = {
  account: {
    label: "Account",
    title: "Account",
    description: "Your sign-in and account controls.",
  },
  usage_billing: {
    label: "Usage & billing",
    title: "Usage & billing",
    description: "Your plan, listening hours, and Kivo Q&A limits.",
  },
  appearance: {
    label: "Appearance",
    title: "Appearance",
    description: "Theme and the floating desktop widget.",
  },
  model: {
    label: "Model & voice",
    title: "Model & voice",
    description: "Which model answers, and the voice it speaks with.",
  },
  speakers: {
    label: "Speakers",
    title: "Speakers",
    description: "Speaker-aware transcription and enrolled voices.",
  },
  connectors: {
    label: "Connectors",
    title: "Connectors",
    description: "Apps Kivo can reach into when answering.",
  },
  trash: {
    label: "Trash",
    title: "Trash",
    description:
      "Trashed conversations are hidden from the sidebar. Restore them or delete them forever.",
  },
};

export const DEFAULT_SETTINGS_TAB: SettingsTab = "account";
