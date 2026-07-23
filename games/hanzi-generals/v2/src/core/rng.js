function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

export function createRng(seed) {
  return Object.freeze({ state: hashSeed(seed) });
}

export function nextFloat(rng) {
  let x = rng.state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const state = x >>> 0 || 1;
  return { value: state / 0x100000000, rng: Object.freeze({ state }) };
}

export function shuffle(rng, items) {
  const copy = [...items];
  let current = rng;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const result = nextFloat(current);
    current = result.rng;
    const j = Math.floor(result.value * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return { items: copy, rng: current };
}

export function pickOne(rng, items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('pickOne requires at least one item');
  }
  const result = nextFloat(rng);
  return { item: items[Math.floor(result.value * items.length)], rng: result.rng };
}
