export const PAD_COUNT = 16;
/** 16th-note steps per 4/4 bar. */
export const STEPS = 16;
export const MAX_BARS = 4;

/** 0..15, 4×4 grid, row-major, 0 = top-left */
export type PadIndex = number;
/** 16th-note index from the start of the song: 0..bars*16-1 */
export type Step = number;

export interface Hit {
  pad: PadIndex;
  step: Step;
  velocity?: number; // 1..127, default 100
}

export const DIFFICULTIES = [1, 2, 3, 4, 5] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface Song {
  id: string;
  name: string;
  author?: string;
  difficulty?: Difficulty; // 1 = easiest, 5 = hardest
  bpm: number;
  bars?: number; // 1..MAX_BARS, default 1
  kitId: string;
  hits: Hit[];
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
}

export interface ScoreRecord {
  best: number;
  bpm: number;
  at: string;
}

export type Scores = Record<string, ScoreRecord>;

export const DEFAULT_KIT_ID = 'default';

export function songBars(song: Pick<Song, 'bars'>): number {
  return Math.min(MAX_BARS, Math.max(1, song.bars ?? 1));
}

/** Total 16th-note steps in the song. */
export function songSteps(song: Pick<Song, 'bars'>): number {
  return songBars(song) * STEPS;
}

/** Pads sharing a role name (case-insensitive) are the same drum, e.g. mirrored kicks. */
export function padGroupOf(kit: Kit): (pad: number) => string {
  return (pad) => (kit.slots[pad]?.role ?? String(pad)).trim().toLowerCase() || String(pad);
}

export const DEFAULT_SETTINGS: Settings = {
  calibrationMs: 0,
  midiDeviceId: null,
  noteMap: {},
};
