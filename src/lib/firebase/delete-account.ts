import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isComposioConfigured } from "@/lib/composio/client";
import { invalidateComposioToolsCache } from "@/lib/composio/tools-cache";
import {
  deleteConnection,
  listConnectionsForUser,
} from "@/lib/composio/connections";
import { getPlanStripeIds } from "@/lib/plan/repository";
import { teardownStripeForUser } from "@/lib/stripe/cleanup";

export async function deleteUserAccount(uid: string): Promise<void> {
  invalidateComposioToolsCache(uid);
  if (isComposioConfigured()) {
    try {
      const connections = await listConnectionsForUser(uid);
      await Promise.all(connections.map((c) => deleteConnection(c.id)));
    } catch {
      // Composio cleanup is best-effort; Firestore and Auth removal still run.
    }
  }

  // Stripe teardown runs BEFORE the Firestore delete: the plan doc is the only
  // link from uid to Stripe customer. A failure here throws and aborts the whole
  // deletion (user retries) — proceeding would leave a subscription billing a
  // customer we can no longer identify.
  await teardownStripeForUser(await getPlanStripeIds(uid));

  const db = getAdminDb();

  // GDPR: analytics events reference the uid outside the user subtree.
  try {
    const events = await db
      .collection("events")
      .where("uid", "==", uid)
      .limit(500)
      .get();
    await Promise.all(events.docs.map((doc) => doc.ref.delete()));
  } catch (err) {
    console.error("[delete-account] events sweep failed (continuing):", err);
  }

  const userRef = db.collection("users").doc(uid);
  await db.recursiveDelete(userRef);

  await getAdminAuth().deleteUser(uid);
}
