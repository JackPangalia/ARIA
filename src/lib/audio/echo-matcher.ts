// Content-based echo discrimination.
//
// While Kivo speaks, the mic picks up two kinds of speech: Kivo's own answer
// coming back through the speakers (echo) and a person talking over the
// answer (a real barge-in). Timing alone can't tell them apart — both overlap
// playback — but content can: echo transcribes as fragments of the answer
// text, which the client now has live via the mux stream. An utterance whose
// words substantially match the answer is echo and must be dropped (or Kivo's
// own "…so you should stop there" would silence itself); anything else is a
// human and deserves an interruption.

// Listener acknowledgments and reactions that ride under (or follow) an answer
// without meaning "stop talking" or "answer this". An utterance made only of
// these must not trigger barge-in, and must not be taken as a follow-up turn.
//
// The reaction vocabulary matters as much as the acknowledgment one: "okay,
// that's pretty cool" is a person reacting to what you just said, not a
// question. Taken as a turn it gets sent to the model as an ask, and the model
// — with nothing to answer — reaches for whatever the room was last talking
// about. That is how "that's pretty cool" came back as a summary of someone's
// IDE preferences.
//
// Everything here is checked under a four-word cap and requires *every* word to
// match, so adding a word only ever suppresses very short utterances. Words
// that carry a real short question ("is", "what", "why", "how") stay out
// deliberately: "is it good" and "why not" must keep working.
const BACKCHANNEL_WORDS = new Set([
  // acknowledgment
  "yeah", "yes", "yep", "yup", "no", "nah", "right", "okay", "ok", "kay",
  "exactly", "sure", "true", "totally", "definitely", "absolutely",
  "mhm", "mm", "mmm", "hmm", "hm", "uh", "huh", "oh", "ah", "got", "it",
  "makes", "sense", "i", "see", "really", "alright", "fine", "noted",
  "understood", "gotcha", "word", "fair", "thanks", "thank", "you",
  // reaction
  "wow", "whoa", "woah", "damn", "dang", "man", "dude", "haha", "lol",
  "yikes", "oof", "ugh", "nice", "cool", "sweet", "neat", "dope", "sick",
  "rad", "solid", "crazy", "wild", "awesome", "amazing", "brilliant",
  "excellent", "fantastic", "wonderful", "beautiful", "lovely", "funny",
  "weird", "clever", "smart", "impressive", "good", "great", "perfect",
  "interesting", "rough", "tough", "terrible",
  // hedges and intensifiers that only ever pad the two groups above
  "that", "that's", "thats", "this", "pretty", "very", "so", "such",
  "i'm", "im", "not", "don't", "dont", "know", "guess", "maybe", "probably",
]);

/** True when the utterance is pure listener acknowledgment or reaction ("yeah
 * exactly", "oh nice", "makes sense", "okay that's pretty cool") rather than an
 * attempt to take the floor or ask something. */
export function isBackchannelOnly(text: string): boolean {
  const words = tokenize(text);
  if (words.length === 0) return true;
  if (words.length > 4) return false;
  return words.every((word) => BACKCHANNEL_WORDS.has(word));
}

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9']+/g) ?? []
  );
}

/**
 * True when `utterance` reads like a fragment of `answerText` (Kivo's own
 * voice picked up by the mic). Conservative in the caller's favor:
 * - 1–2 word utterances are echo only if they appear as an exact phrase in
 *   the answer.
 * - Longer utterances are echo when most of their word bigrams occur in the
 *   answer — single shared words ("the", "and") never condemn a real
 *   interruption, but a run of the answer's own phrasing does.
 */
export function isLikelyEchoOfAnswer(
  utterance: string,
  answerText: string
): boolean {
  const words = tokenize(utterance);
  if (words.length === 0) return true; // nothing intelligible — drop
  const answerWords = tokenize(answerText);
  if (answerWords.length === 0) return false;

  if (words.length <= 2) {
    const phrase = ` ${words.join(" ")} `;
    return ` ${answerWords.join(" ")} `.includes(phrase);
  }

  const answerBigrams = new Set<string>();
  for (let i = 0; i < answerWords.length - 1; i++) {
    answerBigrams.add(`${answerWords[i]} ${answerWords[i + 1]}`);
  }

  let hits = 0;
  const total = words.length - 1;
  for (let i = 0; i < total; i++) {
    if (answerBigrams.has(`${words[i]} ${words[i + 1]}`)) hits += 1;
  }
  return hits / total >= 0.6;
}
