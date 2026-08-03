export type ModelRateLimitError = {
  message: string;
  retryAfterSeconds?: number;
};

const QUOTA_PATTERN = /quota|RESOURCE_EXHAUSTED|rate.?limit|overloaded/i;
const RETRY_PATTERN = /retry in ([\d.]+)s/i;

function readRetrySeconds(message: string): number | undefined {
  const match = message.match(RETRY_PATTERN);
  if (!match) return undefined;
  return Math.ceil(parseFloat(match[1]));
}

function rateLimitMessage(retryAfterSeconds?: number): string {
  const wait =
    retryAfterSeconds != null && retryAfterSeconds > 0
      ? ` Try again in about ${retryAfterSeconds} seconds.`
      : " Try again in a minute.";
  return `Kivo is hitting the model provider's rate limit right now.${wait}`;
}

/** Detect model-provider rate limit (429) errors from thrown values or nested causes. */
export function parseModelRateLimitError(
  err: unknown
): ModelRateLimitError | null {
  const seen = new Set<unknown>();
  let cur: unknown = err;

  for (let depth = 0; depth < 6 && cur != null; depth += 1) {
    if (seen.has(cur)) break;
    seen.add(cur);

    const statusCode =
      typeof cur === "object" &&
      cur !== null &&
      "statusCode" in cur &&
      typeof (cur as { statusCode: unknown }).statusCode === "number"
        ? (cur as { statusCode: number }).statusCode
        : undefined;

    const message =
      cur instanceof Error
        ? cur.message
        : typeof cur === "object" &&
            cur !== null &&
            "message" in cur &&
            typeof (cur as { message: unknown }).message === "string"
          ? (cur as { message: string }).message
          : "";

    if (statusCode === 429 || QUOTA_PATTERN.test(message)) {
      const retryAfterSeconds = readRetrySeconds(message);
      return {
        message: rateLimitMessage(retryAfterSeconds),
        retryAfterSeconds,
      };
    }

    cur =
      cur instanceof Error && cur.cause != null
        ? cur.cause
        : typeof cur === "object" && cur !== null && "cause" in cur
          ? (cur as { cause: unknown }).cause
          : undefined;
  }

  return null;
}
