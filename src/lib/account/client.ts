import { auth } from "@/lib/firebase/client";

export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  const token = await user.getIdToken();
  const res = await fetch("/api/account/delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to delete account.");
  }
}
