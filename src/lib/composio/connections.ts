import { getComposio } from "./client";

export type SupportedToolkit =
  | "notion"
  | "gmail"
  | "googledocs"
  | "googlesheets"
  | "googledrive"
  | "slack"
  | "clickup"
  | "outlook"
  | "googlecalendar";

export const SUPPORTED_TOOLKITS: { slug: SupportedToolkit; label: string }[] = [
  { slug: "notion", label: "Notion" },
  { slug: "gmail", label: "Gmail" },
  { slug: "googledocs", label: "Google Docs" },
  { slug: "googlesheets", label: "Google Sheets" },
  { slug: "googledrive", label: "Google Drive" },
  { slug: "googlecalendar", label: "Google Calendar" },
  { slug: "slack", label: "Slack" },
  { slug: "clickup", label: "ClickUp" },
  { slug: "outlook", label: "Outlook" },
];

export interface ConnectionSummary {
  id: string;
  toolkit: SupportedToolkit | string;
  status: string;
  isDisabled: boolean;
  createdAt: string;
}

// Cache resolved auth configs per toolkit for the process lifetime —
// auth configs are admin-created in the Composio dashboard and stable.
const authConfigCache = new Map<string, string>();

async function resolveAuthConfigId(toolkit: string): Promise<string> {
  const cached = authConfigCache.get(toolkit);
  if (cached) return cached;
  const composio = getComposio();
  const res = await composio.authConfigs.list({ toolkit });
  const item =
    res.items?.find((entry) => entry.status === "ENABLED") ?? res.items?.[0];
  if (!item) {
    throw new Error(
      `No Composio auth config exists for "${toolkit}". Create one in the Composio dashboard first.`
    );
  }
  authConfigCache.set(toolkit, item.id);
  return item.id;
}

export async function listConnectionsForUser(
  uid: string
): Promise<ConnectionSummary[]> {
  const composio = getComposio();
  const res = await composio.connectedAccounts.list({ userIds: [uid] });
  return (res.items ?? []).map((item) => ({
    id: item.id,
    toolkit: item.toolkit.slug,
    status: item.status,
    isDisabled: item.isDisabled,
    createdAt: item.createdAt,
  }));
}

export async function initiateConnection(
  uid: string,
  toolkit: SupportedToolkit,
  callbackUrl?: string
): Promise<{ id: string; redirectUrl: string | null }> {
  const composio = getComposio();
  const authConfigId = await resolveAuthConfigId(toolkit);
  const request = await composio.connectedAccounts.link(uid, authConfigId, {
    callbackUrl,
  });
  return { id: request.id, redirectUrl: request.redirectUrl ?? null };
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const composio = getComposio();
  await composio.connectedAccounts.delete(connectionId);
}

export function isSupportedToolkit(value: string): value is SupportedToolkit {
  return SUPPORTED_TOOLKITS.some((entry) => entry.slug === value);
}
