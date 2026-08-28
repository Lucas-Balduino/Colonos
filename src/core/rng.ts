/** Mulberry32 — returns [0, 1). */
export function nextUnit(rng: number): { value: number; rng: number } {
  let t = (rng + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: t | 0 };
}

export function nextInt(rng: number, min: number, max: number): { value: number; rng: number } {
  const u = nextUnit(rng);
  const value = min + Math.floor(u.value * (max - min + 1));
  return { value, rng: u.rng };
}

export function shuffle<T>(items: T[], rng: number): { items: T[]; rng: number } {
  const copy = [...items];
  let r = rng;
  for (let i = copy.length - 1; i > 0; i--) {
    const n = nextInt(r, 0, i);
    r = n.rng;
    const j = n.value;
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return { items: copy, rng: r };
}

export function pick<T>(items: T[], rng: number): { item: T; rng: number } {
  const n = nextInt(rng, 0, items.length - 1);
  return { item: items[n.value]!, rng: n.rng };
}
