/**
 * How far a ring letter rides off the circle — the 2D cousin of the old
 * particle-orb skin. `energy` is the smoothed voice envelope, `flash` is the
 * onset (syllable attack) above that average.
 */
export function letterRadialScale(
  theta: number,
  index: number,
  nowMs: number,
  energy: number,
  flash: number,
  amp: number,
): number {
  if (amp <= 0) return 1;
  const e = Math.min(1, Math.max(0, energy));
  const f = Math.min(1, Math.max(0, flash));
  if (e + f <= 0) return 1;
  const seed = index * 1.746 + 0.37;
  const wobble =
    Math.sin(nowMs * 0.0018 + seed) * (0.012 + e * 0.14) +
    Math.sin(nowMs * 0.007 + seed * 3.1) * (e * 0.05 + f * 0.11);
  const wave = Math.sin(theta * 3 - nowMs * 0.0048) * (e * 0.1 + f * 0.16);
  const bulge = e * 0.14 + f * 0.2;
  return Math.min(1.34, 1 + (bulge + wobble + wave) * amp);
}

/**
 * Frame-rate-independent exponential smoothing. `halfLifeMs` is how long the
 * gap to `target` takes to halve, so a 120Hz display settles at exactly the same
 * rate as a 60Hz one — the old per-frame `x += (t - x) * k` form ran twice as
 * fast on ProMotion, which made the ring visibly snappier on some machines.
 */
export function approach(
  current: number,
  target: number,
  halfLifeMs: number,
  dtMs: number,
): number {
  if (halfLifeMs <= 0 || dtMs <= 0) return dtMs <= 0 ? current : target;
  const k = 1 - Math.pow(2, -dtMs / halfLifeMs);
  return current + (target - current) * k;
}

/**
 * Extra brightness on a letter that was just typed, decaying to nothing. This
 * is what makes speech read as *arriving* rather than merely existing: the head
 * of the sentence burns in and settles back into the trail behind it.
 */
export function glyphIgnition(ageMs: number, durationMs = 420): number {
  if (!Number.isFinite(ageMs) || ageMs >= durationMs) return 0;
  if (ageMs <= 0) return 1;
  const remaining = 1 - ageMs / durationMs;
  return remaining * remaining;
}

/**
 * How lit a live letter is by its distance back from the newest one. The trail
 * falls off smoothly so the eye lands on the words being spoken right now
 * without the older text going unreadable.
 */
export function trailOpacity(
  indexFromHead: number,
  span: number,
  floor: number,
): number {
  if (indexFromHead <= 0) return 1;
  if (span <= 0 || indexFromHead >= span) return floor;
  const t = indexFromHead / span;
  // Smoothstep, so there's no visible kink where the ramp meets the floor.
  const eased = t * t * (3 - 2 * t);
  return 1 - (1 - floor) * eased;
}
