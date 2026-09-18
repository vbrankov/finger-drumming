export const PAD_COUNT = 16;
/** 16th-note steps per 4/4 bar. */
export const STEPS = 16;
export const MAX_BARS = 4;

/** 0..15, 4×4 grid, row-major, 0 = top-left */
export type PadIndex = number;
/** 16th-note index from the start of the pattern: 0..bars*16-1 */
export type Step = number;

export interface Hit {
  pad: PadIndex;
  step: Step;
  velocity?: number; // 1..127, default 100; see Level
}

/**
 * Dynamics are graded at three levels, not by raw velocity: pad sensors vary
 * too much between controllers, pads and fingers for finer distinctions to
 * mean anything musically.
 */
export type Level = 'ghost' | 'normal' | 'accent';
export const LEVELS: Level[] = ['ghost', 'normal', 'accent'];
/** Velocity stored in a pattern for each level. */
export const LEVEL_VELOCITY: Record<Level, number> = { ghost: 40, normal: 100, accent: 127 };
export const LEVEL_GLYPH: Record<Level, string> = { ghost: '\u00b7', normal: '', accent: '\u25b2' };

export interface VelocityThresholds {
  ghost: number; // played velocity below this is a ghost
  accent: number; // played velocity at or above this is an accent
}

/** Level a pattern hit was written at. */
export function levelOfHit(h: Pick<Hit, 'velocity'>): Level {
  const v = h.velocity ?? LEVEL_VELOCITY.normal;
  return v < 64 ? 'ghost' : v >= 112 ? 'accent' : 'normal';
}

/** Level a played velocity counts as, given the user's calibrated thresholds. */
export function levelOfVelocity(v: number, t: VelocityThresholds): Level {
  return v < t.ghost ? 'ghost' : v >= t.accent ? 'accent' : 'normal';
}

export const DIFFICULTIES = [1, 2, 3, 4, 5] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface Pattern {
  id: string;
  name: string;
  author?: string;
  difficulty?: Difficulty; // 1 = easiest, 5 = hardest
  bpm: number;
  bars?: number; // 1..MAX_BARS, default 1
  swing?: Swing; // straight when absent
  kitId: string;
  hits: Hit[];
  createdAt: string;
  updatedAt: string;
}

/** A song is a sequence of patterns, each repeated a number of times. */
export interface SongSection {
  patternId: string;
  repeat: number; // ≥ 1
}

export interface Song {
  id: string;
  name: string;
  author?: string;
  difficulty?: Difficulty;
  bpm: number; // overrides the patterns' own tempos
  kitId: string; // all patterns play on this kit
  sections: SongSection[];
  createdAt: string;
  updatedAt: string;
}

export type SoundRef =
  | { type: 'bundled'; file: string } // public/sounds/<file>
  | { type: 'user'; blobId: string; name: string }; // IndexedDB

export interface KitSlot {
  role: string;
  sound: SoundRef;
  gain?: number; // linear, default 1
  pitch?: number; // semitones, default 0; playback rate = 2^(pitch/12)
}

export interface Kit {
  id: string;
  name: string;
  slots: KitSlot[]; // length 16
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  calibrationMs: number;
  midiDeviceId: string | null;
  noteMap: Record<number, PadIndex>;
  velocityThresholds: VelocityThresholds;
}

export interface ScoreRecord {
  best: number;
  bpm: number;
  at: string;
}

export type Scores = Record<string, ScoreRecord>;

/**
 * Swing delays the off-beat notes so the beat bounces: long-short instead of
 * even. `amount` is the DAW-style percentage: 50 = straight, 66 ≈ triplet
 * feel, 75 = maximum. `unit` says which notes swing: the 16ths ("e" and "a",
 * hip-hop/funk) or the 8ths (the "&", shuffle/jazz).
 */
export interface Swing {
  amount: number; // 50..75
  unit: 'sixteenth' | 'eighth';
}
export const SWING_MIN = 50;
export const SWING_MAX = 75;

export const DEFAULT_KIT_ID = 'default';

export function patternBars(pattern: Pick<Pattern, 'bars'>): number {
  return Math.min(MAX_BARS, Math.max(1, pattern.bars ?? 1));
}

/** Total 16th-note steps in the pattern. */
export function patternSteps(pattern: Pick<Pattern, 'bars'>): number {
  return patternBars(pattern) * STEPS;
}

/** Pads sharing a role name (case-insensitive) are the same drum, e.g. mirrored kicks. */
export function padGroupOf(kit: Kit): (pad: number) => string {
  return (pad) => (kit.slots[pad]?.role ?? String(pad)).trim().toLowerCase() || String(pad);
}

/**
 * One grid row per distinct drum, in pad order: the first pad of each role
 * represents the group. A learner then sees "Kick" once, not twice.
 */
export function kitRows(kit: Kit): { pad: number; pads: number[] }[] {
  const groupOf = padGroupOf(kit);
  const rows = new Map<string, { pad: number; pads: number[] }>();
  for (let pad = 0; pad < PAD_COUNT; pad++) {
    const g = groupOf(pad);
    const row = rows.get(g);
    if (row) row.pads.push(pad);
    else rows.set(g, { pad, pads: [pad] });
  }
  return [...rows.values()];
}

/** Map every pad to the representative pad of its row. */
export function padRepOf(kit: Kit): (pad: number) => number {
  const rep = new Map<number, number>();
  for (const row of kitRows(kit)) for (const p of row.pads) rep.set(p, row.pad);
  return (pad) => rep.get(pad) ?? pad;
}

/**
 * The Akai MPC/MPD convention most 4×4 controllers ship with: bottom-left pad
 * is note 36 (C1), rising left to right and then row by row to 51 top-right.
 * Our pad index is row-major from the top-left, so the rows are flipped.
 */
export function standardNoteMap(): Record<number, PadIndex> {
  const map: Record<number, PadIndex> = {};
  for (let pad = 0; pad < PAD_COUNT; pad++) {
    const row = Math.floor(pad / 4); // 0 = top
    const col = pad % 4;
    map[36 + (3 - row) * 4 + col] = pad;
  }
  return map;
}

export const DEFAULT_SETTINGS: Settings = {
  calibrationMs: 0,
  midiDeviceId: null,
  noteMap: standardNoteMap(),
  velocityThresholds: { ghost: 60, accent: 110 },
};
