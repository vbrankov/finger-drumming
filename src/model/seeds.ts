/** Seed upgrades: a bundled pattern/song/kit that the user never edited follows new app versions. */

function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (
      "{" +
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(o[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}

/** Stable fingerprint of a record, independent of key order (djb2 over canonical JSON). */
export function fingerprint(v: unknown): string {
  const s = canonical(v);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/**
 * Fingerprints of earlier shipped versions of seeds, by id. A local copy that
 * still matches one of these was never edited, so it is upgraded in place.
 * Newer changes are tracked automatically via the recorded fingerprints; this
 * list only covers copies made before that existed.
 */
export const RETIRED_SEEDS: Record<string, string[]> = {
  // Closed hat was also written on the open hat's step.
  "one-drop": ["1086055a"],
  breakbeat: ["1b5a4595"],
  "drum-and-bass": ["22ad1ea9"],
};

/**
 * Merge bundled seeds into the user's list. `recorded` maps id → fingerprint
 * of the seed version last copied in (mutated with what was applied).
 * - missing id → copied in;
 * - present, unedited (fingerprint equals the recorded or a retired one) and
 *   the seed changed → replaced;
 * - otherwise the local copy wins.
 */
export function mergeSeeds<T extends { id: string }>(local: T[], seeds: T[], recorded: Record<string, string>): { list: T[]; changed: boolean } {
  const bySeed = new Map(seeds.map((s) => [s.id, s]));
  let changed = false;
  const list = local.map((x) => {
    const seed = bySeed.get(x.id);
    if (!seed) return x;
    const fp = fingerprint(x);
    const seedFp = fingerprint(seed);
    if (fp === seedFp) {
      if (recorded[x.id] !== seedFp) recorded[x.id] = seedFp;
      return x;
    }
    const unedited = recorded[x.id] === fp || (RETIRED_SEEDS[x.id] ?? []).includes(fp);
    if (!unedited) return x;
    recorded[x.id] = seedFp;
    changed = true;
    return seed;
  });
  const have = new Set(local.map((x) => x.id));
  for (const s of seeds) {
    if (have.has(s.id)) continue;
    recorded[s.id] = fingerprint(s);
    list.push(s);
  }
  return { list, changed };
}
