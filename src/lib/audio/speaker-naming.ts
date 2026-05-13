const NAME_WORD_RE = /^[a-z][a-z'-]*$/i;

const NAME_STOP_WORDS = new Set([
  "a",
  "about",
  "all",
  "am",
  "and",
  "are",
  "aria",
  "around",
  "call",
  "can",
  "could",
  "do",
  "everyone",
  "for",
  "from",
  "going",
  "gonna",
  "got",
  "have",
  "here",
  "hey",
  "hi",
  "i",
  "is",
  "just",
  "meeting",
  "my",
  "name",
  "not",
  "now",
  "okay",
  "ok",
  "on",
  "people",
  "participants",
  "ready",
  "room",
  "speakers",
  "team",
  "that",
  "the",
  "thinking",
  "this",
  "today",
  "trying",
  "we",
  "with",
]);

const NAME_TITLES = /^(?:dr|doctor|mr|mrs|ms|miss|prof|professor)\.?\s+/i;

export interface SpeakerNameMatch {
  name: string;
  matchedExpected: boolean;
  source: "explicit-name" | "casual-intro" | "name-here";
}

export type SpeakerNamingCommand =
  | { type: "roster"; names: string[] }
  | { type: "intro-mode"; mode: "solo" | "group" }
  | { type: "intro-done" }
  | { type: "self-introduction"; match: SpeakerNameMatch };

function cleanText(text: string): string {
  return text
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSentenceTail(text: string): string {
  return text
    .replace(
      /\b(?:today|right now|for this meeting|for the meeting|in the room|on the call|with me)\b.*$/i,
      ""
    )
    .replace(/[.!?]+$/g, "")
    .trim();
}

function stripOpeningGreeting(text: string): string {
  return text.replace(
    /^(?:hi|hey|hello|okay|ok)(?:\s*[,.:;!?-]\s*|\s+)(?:aria(?:\s*[,.:;!?-]\s*|\s+)?)?/i,
    ""
  );
}

function titleCaseWord(word: string): string {
  return word
    .split("'")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("'");
}

export function normalizeNameForMatch(name: string): string {
  return cleanText(name)
    .replace(/[^\w\s'-]/g, "")
    .toLowerCase();
}

export function namesMatch(a: string, b: string): boolean {
  return normalizeNameForMatch(a) === normalizeNameForMatch(b);
}

export function formatNameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function normalizePersonName(raw: string): string | null {
  const withoutTail = stripSentenceTail(raw)
    .replace(NAME_TITLES, "")
    .replace(/^(?:and|me|myself)\s+/i, "")
    .replace(/["“”]/g, "")
    .replace(/[^a-z\s'-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutTail) return null;

  const words = withoutTail.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;

  for (const word of words) {
    const lower = word.toLowerCase();
    if (!NAME_WORD_RE.test(word) || NAME_STOP_WORDS.has(lower)) {
      return null;
    }
  }

  return words.map(titleCaseWord).join(" ");
}

function splitNameList(raw: string): string[] {
  const listText = stripSentenceTail(raw)
    .replace(/\s+(?:and|&)\s+/gi, ", ")
    .replace(/\b(?:plus|along with)\b/gi, ", ");

  const names = listText
    .split(",")
    .map((part) => normalizePersonName(part))
    .filter((name): name is string => Boolean(name));

  return Array.from(new Set(names));
}

export function parseParticipantRoster(text: string): string[] | null {
  const normalized = cleanText(text);
  const patterns = [
    /\b(?:participants|attendees|people|speakers|folks|team|names)\s+(?:are|include|includes|will be)\s+(.+)$/i,
    /\b(?:in the room|on the call|here today)\s+(?:are|is)\s+(.+)$/i,
    /^(.+?)\s+(?:are|is)\s+(?:here|in the room|on the call|joining|with me)$/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match?.[1]) continue;
    const names = splitNameList(match[1]);
    if (names.length > 0) return names;
  }

  return null;
}

export function getIntroModeRequest(text: string): "solo" | "group" | null {
  const normalized = cleanText(text);
  const soloPatterns = [
    /\b(?:can|could|may)\s+i\s+(?:please\s+)?introduce\s+myself\b/i,
    /\b(?:can|could|may)\s+i\s+(?:please\s+)?do\s+an\s+introduction\b/i,
    /\bi\s+(?:want|would like|wanna|need)\s+to\s+(?:do\s+an\s+introduction|introduce\s+myself)\b/i,
    /\bi'd\s+like\s+to\s+(?:do\s+an\s+introduction|introduce\s+myself)\b/i,
    /\b(?:let|allow)\s+me\s+introduce\s+myself\b/i,
    /\bi(?:'m| am)\s+introducing\s+myself\b/i,
  ];
  if (soloPatterns.some((pattern) => pattern.test(normalized))) {
    return "solo";
  }

  const groupPatterns = [
    /\b(?:can|could)\s+we\s+(?:do|start|begin)\s+introductions\b/i,
    /\b(?:let's|let us)\s+(?:do\s+)?introductions\b/i,
    /\b(?:start|begin)\s+(?:with\s+)?introductions\b/i,
    /\b(?:everyone|everybody|all of us)\s+(?:should\s+)?introduce\b/i,
    /\bintroduce\s+(?:ourselves|yourselves|the room)\b/i,
  ];
  if (groupPatterns.some((pattern) => pattern.test(normalized))) {
    return "group";
  }

  return null;
}

export function isIntroModeRequest(text: string): boolean {
  return getIntroModeRequest(text) !== null;
}

export function isIntroModeDoneRequest(text: string): boolean {
  const normalized = cleanText(text);
  return [
    /\b(?:that's|that is)\s+(?:everyone|everybody|all)\b/i,
    /\b(?:we're|we are|i'm|i am)\s+done\s+with\s+introductions\b/i,
    /\b(?:done|finished)\s+(?:with\s+)?introductions\b/i,
    /\b(?:stop|cancel|end)\s+introductions\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function extractSelfIntroductionName(
  text: string
): { name: string; source: SpeakerNameMatch["source"] } | null {
  const normalized = stripOpeningGreeting(cleanText(text));

  const patterns: Array<{
    pattern: RegExp;
    source: SpeakerNameMatch["source"];
  }> = [
    {
      pattern: /(?:^|\b)(?:my name is|my name's|this is)\s+(.+?)(?:[.!?]|$)/i,
      source: "explicit-name",
    },
    {
      pattern: /(?:^|\b)(.+?)\s+(?:is|was)\s+my\s+name(?:[.!?]|$)/i,
      source: "explicit-name",
    },
    {
      pattern: /^(?:i'm|i am|it's|it is)\s+(.+?)(?:[.!?]|$)/i,
      source: "casual-intro",
    },
    {
      pattern: /^(.+?)\s+here(?:[.!?]|$)/i,
      source: "name-here",
    },
  ];

  for (const { pattern, source } of patterns) {
    const match = pattern.exec(normalized);
    if (!match?.[1]) continue;
    const candidate = match[1]
      .replace(/\b(?:from|and i|speaking|checking in|joining)\b.*$/i, "")
      .trim();
    const name = normalizePersonName(candidate);
    if (name) return { name, source };
  }

  return null;
}

function findExpectedParticipant(
  candidate: string,
  expectedParticipants: string[]
): string | null {
  const candidateMatch = normalizeNameForMatch(candidate);
  const exact = expectedParticipants.find(
    (name) => normalizeNameForMatch(name) === candidateMatch
  );
  if (exact) return exact;

  const firstNameMatches = expectedParticipants.filter((name) => {
    const firstName = normalizeNameForMatch(name).split(" ")[0];
    return firstName === candidateMatch;
  });

  return firstNameMatches.length === 1 ? (firstNameMatches[0] ?? null) : null;
}

export function resolveSelfIntroduction(
  text: string,
  expectedParticipants: string[],
  options: { allowUnlisted: boolean; allowCasualUnlisted?: boolean }
): SpeakerNameMatch | null {
  const intro = extractSelfIntroductionName(text);
  if (!intro) return null;

  const expected = findExpectedParticipant(intro.name, expectedParticipants);
  if (expected) {
    return { name: expected, matchedExpected: true, source: intro.source };
  }

  if (!options.allowUnlisted) return null;

  const isExplicit = intro.source === "explicit-name";
  if (!isExplicit && !options.allowCasualUnlisted) return null;

  return { name: intro.name, matchedExpected: false, source: intro.source };
}

export function parseSpeakerNamingCommand(
  text: string,
  expectedParticipants: string[]
): SpeakerNamingCommand | null {
  const roster = parseParticipantRoster(text);
  if (roster) return { type: "roster", names: roster };

  if (isIntroModeDoneRequest(text)) return { type: "intro-done" };

  const introMode = getIntroModeRequest(text);
  if (introMode === "group") return { type: "intro-mode", mode: "group" };

  const intro = resolveSelfIntroduction(text, expectedParticipants, {
    allowUnlisted: true,
    allowCasualUnlisted: true,
  });
  if (intro) return { type: "self-introduction", match: intro };

  if (introMode === "solo") return { type: "intro-mode", mode: "solo" };

  return null;
}
