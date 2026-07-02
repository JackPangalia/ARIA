// Admin CLI to print the signup→purchase funnel from first-party events.
//
//   npm run funnel            → last 7 days
//   npm run funnel -- 30      → last 30 days
//
// Requires Firebase Admin env (see set-tier.ts). Loads .env.local for local runs.

try {
  (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(
    ".env.local"
  );
} catch {
  // No .env.local — rely on the real environment.
}

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { EVENT_NAMES } from "@/lib/analytics/events";

async function main() {
  const days = Number(process.argv[2] ?? 7);
  if (!Number.isFinite(days) || days <= 0) {
    console.error("Usage: npm run funnel -- [days]");
    process.exit(1);
  }

  const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);
  const db = getAdminDb();

  console.log(`Funnel — last ${days} day(s)\n`);
  console.log(
    "event".padEnd(20) + "count".padStart(8) + "uniq anon".padStart(12) + "uniq uid".padStart(12)
  );

  for (const name of EVENT_NAMES) {
    const snap = await db
      .collection("events")
      .where("name", "==", name)
      .where("ts", ">=", since)
      .get();

    const anonIds = new Set<string>();
    const uids = new Set<string>();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.anonId && data.anonId !== "server") anonIds.add(String(data.anonId));
      if (data.uid) uids.add(String(data.uid));
    }

    console.log(
      name.padEnd(20) +
        String(snap.size).padStart(8) +
        String(anonIds.size).padStart(12) +
        String(uids.size).padStart(12)
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Funnel query failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
