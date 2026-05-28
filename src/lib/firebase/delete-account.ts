import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { isComposioConfigured } from "@/lib/composio/client";
import { invalidateComposioToolsCache } from "@/lib/composio/tools-cache";
import {
  deleteConnection,
  listConnectionsForUser,
} from "@/lib/composio/connections";

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

  const db = getAdminDb();
  const userRef = db.collection("users").doc(uid);
  await db.recursiveDelete(userRef);

  await getAdminAuth().deleteUser(uid);
}
