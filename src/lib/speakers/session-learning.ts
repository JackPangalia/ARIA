export interface SessionSpeakerClusterSnapshot {
  clusterKey: string;
  streamEpoch: number;
  providerSpeakerLabel: string;
  speakerIdentifiers: string[];
}

export function streamEpochFromUtteranceId(id: string): number {
  const match = /^(\d+):/.exec(id);
  return match ? Math.max(1, Number(match[1])) : 1;
}

export function speakerClusterKey(
  streamEpoch: number,
  providerSpeakerLabel: string
): string {
  return `${Math.max(1, streamEpoch)}:${providerSpeakerLabel}`;
}

export function speakerClusterKeyForTurn(input: {
  providerSpeakerLabel?: string | null;
  sourceUtteranceIds: string[];
}): string | null {
  if (!input.providerSpeakerLabel || input.sourceUtteranceIds.length === 0) {
    return null;
  }
  return speakerClusterKey(
    streamEpochFromUtteranceId(input.sourceUtteranceIds[0]!),
    input.providerSpeakerLabel
  );
}

export function mergeSessionSpeakerClusters(
  current: SessionSpeakerClusterSnapshot[],
  incoming: SessionSpeakerClusterSnapshot[]
): SessionSpeakerClusterSnapshot[] {
  const byKey = new Map(
    current.map((cluster) => [cluster.clusterKey, cluster] as const)
  );
  for (const cluster of incoming) {
    const existing = byKey.get(cluster.clusterKey);
    byKey.set(cluster.clusterKey, {
      ...cluster,
      speakerIdentifiers: Array.from(
        new Set([
          ...(existing?.speakerIdentifiers ?? []),
          ...cluster.speakerIdentifiers,
        ])
      ).filter(Boolean),
    });
  }
  return [...byKey.values()];
}
