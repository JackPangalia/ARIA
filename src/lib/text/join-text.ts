/** Merge two transcript fragments without duplicating overlapping suffix/prefix. */
export function joinText(a: string, b: string): string {
  const left = a.trim();
  const right = b.trim();
  if (!left) return right;
  if (!right) return left;
  if (left.endsWith(right)) return left;
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}
