// Split total into `count` parts; first (total % count) parts get +1 cent.
export function splitCents(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
