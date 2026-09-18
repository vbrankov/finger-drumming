import { useSyncExternalStore } from "react";
import type { Kit, Scores, Settings, Pattern } from "./model/types";
import {
  DEFAULT_KIT_ID,
  DEFAULT_SETTINGS,
  standardNoteMap,
} from "./model/types";
import defaultKitJson from "./kits/default.json";
import manifest from "./sounds/manifest.json";

const seedPatterns = Object.values(
  import.meta.glob("./patterns/*.json", { eager: true, import: "default" }),
) as Pattern[];
const seedKits = Object.values(
  import.meta.glob("./kits/*.json", { eager: true, import: "default" }),
) as Kit[];
export const DEFAULT_KIT = defaultKitJson as Kit;

export interface State {
  patterns: Pattern[];
  kits: Kit[];
  scores: Scores;
  settings: Settings;
}

const KEYS: Record<keyof State, string> = {
  patterns: "fd.patterns", // was "fd.songs" before songs became sequences of patterns
  kits: "fd.kits",
  scores: "fd.scores",
  settings: "fd.settings",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Copy in any seed whose id is not present. Local edits win. */
function mergeSeeds<T extends { id: string }>(local: T[], seeds: T[]): T[] {
  const have = new Set(local.map((x) => x.id));
  return [...local, ...seeds.filter((s) => !have.has(s.id))];
}

/** Keep only well-formed records so one bad entry cannot take the app down. */
function readList<T extends { id: string }>(
  key: string,
  ok: (x: T) => boolean,
): T[] {
  const raw = read<unknown>(key, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is T =>
      !!x &&
      typeof x === "object" &&
      typeof (x as T).id === "string" &&
      ok(x as T),
  );
}

/** Bundled files that were renamed when the full library came in. */
const RENAMED_SOUNDS: Record<string, string> = {
  "kick.flac": "drum_heavy_kick.flac",
  "snare.flac": "drum_snare_hard.flac",
  "sidestick.flac": "elec_wood.flac",
  "rim.flac": "elec_wood.flac",
  "hat-closed.flac": "drum_cymbal_closed.flac",
  "hat-open.flac": "drum_cymbal_open.flac",
  "ride.flac": "drum_cymbal_hard.flac",
  "crash.flac": "drum_splash_hard.flac",
  "crash2.flac": "drum_splash_soft.flac",
  "cymbal.flac": "drum_cymbal_soft.flac",
  "tom-hi.flac": "drum_tom_hi_hard.flac",
  "tom-mid.flac": "drum_tom_mid_hard.flac",
  "tom-lo.flac": "drum_tom_lo_hard.flac",
};
const BUNDLED = new Set(manifest.sounds.map((s) => s.file));

/**
 * Point stored kits at files that exist: renamed files get their new name,
 * anything else unknown takes the shipped default for that slot. Returns the
 * kits and whether anything changed (so the fix can be persisted).
 */
function repairKits(kits: Kit[]): { kits: Kit[]; changed: boolean } {
  let changed = false;
  const stale = (k: Kit) =>
    k.slots.some(
      (slot) => slot.sound.type === "bundled" && !BUNDLED.has(slot.sound.file),
    );
  const out = kits.map((k) => {
    // A stale *default* kit predates the current layout altogether: take the shipped one.
    if (k.id === DEFAULT_KIT_ID && stale(k)) {
      changed = true;
      return structuredClone(DEFAULT_KIT);
    }
    return {
      ...k,
      slots: k.slots.map((slot, i) => {
        if (slot.sound.type !== "bundled" || BUNDLED.has(slot.sound.file))
          return slot;
        changed = true;
        const renamed = RENAMED_SOUNDS[slot.sound.file];
        return {
          ...slot,
          sound: renamed
            ? { type: "bundled" as const, file: renamed }
            : DEFAULT_KIT.slots[i].sound,
        };
      }),
    };
  });
  return { kits: out, changed };
}

// One-time move: the library's 1-4 bar items used to live under "fd.songs".
if (!localStorage.getItem("fd.patterns") && localStorage.getItem("fd.songs")) {
  try {
    const old = JSON.parse(localStorage.getItem("fd.songs") ?? "[]");
    if (Array.isArray(old) && old.every((x) => x && Array.isArray(x.hits))) {
      localStorage.setItem("fd.patterns", JSON.stringify(old));
      localStorage.removeItem("fd.songs");
    }
  } catch {
    /* leave it */
  }
}

let state: State = (() => {
  const patterns = mergeSeeds(
    readList<Pattern>(
      KEYS.patterns,
      (s) => Array.isArray(s.hits) && typeof s.bpm === "number",
    ),
    seedPatterns,
  );
  const repaired = repairKits(
    readList<Kit>(
      KEYS.kits,
      (k) => Array.isArray(k.slots) && k.slots.length === 16,
    ),
  );
  const kits = mergeSeeds(repaired.kits, seedKits);
  if (repaired.changed)
    localStorage.setItem(KEYS.kits, JSON.stringify(repaired.kits));
  const rawScores = read<unknown>(KEYS.scores, {});
  const scores =
    rawScores && typeof rawScores === "object" && !Array.isArray(rawScores)
      ? (rawScores as Scores)
      : {};
  const rawSettings = read<unknown>(KEYS.settings, {});
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(rawSettings && typeof rawSettings === "object"
      ? (rawSettings as Partial<Settings>)
      : {}),
  };
  if (!settings.noteMap || Object.keys(settings.noteMap).length === 0)
    settings.noteMap = standardNoteMap();
  return { patterns, kits, scores, settings };
})();

const listeners = new Set<() => void>();

function set<K extends keyof State>(key: K, value: State[K]): void {
  state = { ...state, [key]: value };
  localStorage.setItem(KEYS[key], JSON.stringify(value));
  listeners.forEach((fn) => fn());
}

export function getState(): State {
  return state;
}

export function useStore(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

// ── Patterns ────────────────────────────────────────────────────────────────────

export function newId(prefix: string): string {
  return prefix + "-" + crypto.randomUUID().slice(0, 8);
}

export function savePattern(pattern: Pattern): void {
  const updated = { ...pattern, updatedAt: new Date().toISOString() };
  const i = state.patterns.findIndex((s) => s.id === pattern.id);
  set(
    "patterns",
    i < 0 ? [...state.patterns, updated] : state.patterns.with(i, updated),
  );
}

export function deletePattern(id: string): void {
  set(
    "patterns",
    state.patterns.filter((s) => s.id !== id),
  );
  if (state.scores[id]) {
    const { [id]: _, ...rest } = state.scores;
    set("scores", rest);
  }
}

export function emptyPattern(): Pattern {
  const now = new Date().toISOString();
  return {
    id: newId("pattern"),
    name: "Untitled",
    author: "",
    difficulty: 1,
    bpm: 90,
    bars: 1,
    kitId: DEFAULT_KIT_ID,
    hits: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Kits ─────────────────────────────────────────────────────────────────────

export function kitFor(pattern: Pattern): Kit {
  return (
    state.kits.find((k) => k.id === pattern.kitId) ??
    state.kits.find((k) => k.id === DEFAULT_KIT_ID) ??
    DEFAULT_KIT
  );
}

export function defaultKit(): Kit {
  return state.kits.find((k) => k.id === DEFAULT_KIT_ID) ?? DEFAULT_KIT;
}

export function saveKit(kit: Kit): void {
  const updated = { ...kit, updatedAt: new Date().toISOString() };
  const i = state.kits.findIndex((k) => k.id === kit.id);
  set("kits", i < 0 ? [...state.kits, updated] : state.kits.with(i, updated));
}

/** Refused if any pattern uses the kit or it is the default. Returns the reason. */
export function deleteKit(id: string): string | null {
  if (id === DEFAULT_KIT_ID) return "The default kit cannot be deleted.";
  const users = state.patterns.filter((s) => s.kitId === id);
  if (users.length)
    return "Used by " + users.map((s) => s.name).join(", ") + ".";
  set(
    "kits",
    state.kits.filter((k) => k.id !== id),
  );
  return null;
}

export function duplicateKit(kit: Kit, name = kit.name + " copy"): Kit {
  const now = new Date().toISOString();
  const copy: Kit = {
    ...structuredClone(kit),
    id: newId("kit"),
    name,
    createdAt: now,
    updatedAt: now,
  };
  saveKit(copy);
  return copy;
}

export function resetDefaultKit(): void {
  saveKit(structuredClone(DEFAULT_KIT));
}

// ── Scores ───────────────────────────────────────────────────────────────────

/** Record a pass score. Only kept when practising at the pattern's own tempo. */
export function recordScore(pattern: Pattern, bpm: number, score: number): boolean {
  if (bpm !== pattern.bpm) return false;
  const prev = state.scores[pattern.id];
  if (prev && prev.bpm === bpm && prev.best <= score) return false;
  set("scores", {
    ...state.scores,
    [pattern.id]: { best: score, bpm, at: new Date().toISOString() },
  });
  return true;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function updateSettings(patch: Partial<Settings>): void {
  set("settings", { ...state.settings, ...patch });
}

// ── Export / import ──────────────────────────────────────────────────────────

export function exportJson(): string {
  const kits = state.kits.map((k) => ({
    ...k,
    slots: k.slots.map((s) =>
      s.sound.type === "user"
        ? { ...s, sound: DEFAULT_KIT.slots[k.slots.indexOf(s)].sound }
        : s,
    ),
  }));
  return JSON.stringify(
    { version: 1, patterns: state.patterns, kits, scores: state.scores },
    null,
    2,
  );
}

export function importJson(text: string): { patterns: number; kits: number } {
  const data = JSON.parse(text) as Partial<State> & { version?: number };
  const patterns = Array.isArray(data.patterns) ? data.patterns : [];
  const kits = Array.isArray(data.kits) ? data.kits : [];
  const byId = <T extends { id: string }>(a: T[], b: T[]) => {
    const m = new Map(a.map((x) => [x.id, x]));
    for (const x of b) m.set(x.id, x);
    return [...m.values()];
  };
  set("patterns", byId(state.patterns, patterns));
  set("kits", byId(state.kits, kits));
  if (data.scores) set("scores", { ...state.scores, ...data.scores });
  return { patterns: patterns.length, kits: kits.length };
}
