import { useSyncExternalStore } from 'react';
import type { Kit, Scores, Settings, Song } from './model/types';
import { DEFAULT_KIT_ID, DEFAULT_SETTINGS, standardNoteMap } from './model/types';
import defaultKitJson from './kits/default.json';

const seedSongs = Object.values(import.meta.glob('./songs/*.json', { eager: true, import: 'default' })) as Song[];
const seedKits = Object.values(import.meta.glob('./kits/*.json', { eager: true, import: 'default' })) as Kit[];
export const DEFAULT_KIT = defaultKitJson as Kit;

export interface State {
  songs: Song[];
  kits: Kit[];
  scores: Scores;
  settings: Settings;
}

const KEYS: Record<keyof State, string> = {
  songs: 'fd.songs',
  kits: 'fd.kits',
  scores: 'fd.scores',
  settings: 'fd.settings',
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
function readList<T extends { id: string }>(key: string, ok: (x: T) => boolean): T[] {
  const raw = read<unknown>(key, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is T => !!x && typeof x === 'object' && typeof (x as T).id === 'string' && ok(x as T));
}

let state: State = (() => {
  const songs = mergeSeeds(
    readList<Song>(KEYS.songs, (s) => Array.isArray(s.hits) && typeof s.bpm === 'number'),
    seedSongs,
  );
  const kits = mergeSeeds(
    readList<Kit>(KEYS.kits, (k) => Array.isArray(k.slots) && k.slots.length === 16),
    seedKits,
  );
  const rawScores = read<unknown>(KEYS.scores, {});
  const scores = rawScores && typeof rawScores === 'object' && !Array.isArray(rawScores) ? (rawScores as Scores) : {};
  const rawSettings = read<unknown>(KEYS.settings, {});
  const settings = { ...DEFAULT_SETTINGS, ...(rawSettings && typeof rawSettings === 'object' ? (rawSettings as Partial<Settings>) : {}) };
  if (!settings.noteMap || Object.keys(settings.noteMap).length === 0) settings.noteMap = standardNoteMap();
  return { songs, kits, scores, settings };
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

// ── Songs ────────────────────────────────────────────────────────────────────

export function newId(prefix: string): string {
  return prefix + '-' + crypto.randomUUID().slice(0, 8);
}

export function saveSong(song: Song): void {
  const updated = { ...song, updatedAt: new Date().toISOString() };
  const i = state.songs.findIndex((s) => s.id === song.id);
  set('songs', i < 0 ? [...state.songs, updated] : state.songs.with(i, updated));
}

export function deleteSong(id: string): void {
  set('songs', state.songs.filter((s) => s.id !== id));
  if (state.scores[id]) {
    const { [id]: _, ...rest } = state.scores;
    set('scores', rest);
  }
}

export function emptySong(): Song {
  const now = new Date().toISOString();
  return { id: newId('song'), name: 'Untitled', author: '', difficulty: 1, bpm: 90, bars: 1, kitId: DEFAULT_KIT_ID, hits: [], createdAt: now, updatedAt: now };
}

// ── Kits ─────────────────────────────────────────────────────────────────────

export function kitFor(song: Song): Kit {
  return state.kits.find((k) => k.id === song.kitId) ?? state.kits.find((k) => k.id === DEFAULT_KIT_ID) ?? DEFAULT_KIT;
}

export function defaultKit(): Kit {
  return state.kits.find((k) => k.id === DEFAULT_KIT_ID) ?? DEFAULT_KIT;
}

export function saveKit(kit: Kit): void {
  const updated = { ...kit, updatedAt: new Date().toISOString() };
  const i = state.kits.findIndex((k) => k.id === kit.id);
  set('kits', i < 0 ? [...state.kits, updated] : state.kits.with(i, updated));
}

/** Refused if any song uses the kit or it is the default. Returns the reason. */
export function deleteKit(id: string): string | null {
  if (id === DEFAULT_KIT_ID) return 'The default kit cannot be deleted.';
  const users = state.songs.filter((s) => s.kitId === id);
  if (users.length) return 'Used by ' + users.map((s) => s.name).join(', ') + '.';
  set('kits', state.kits.filter((k) => k.id !== id));
  return null;
}

export function duplicateKit(kit: Kit, name = kit.name + ' copy'): Kit {
  const now = new Date().toISOString();
  const copy: Kit = { ...structuredClone(kit), id: newId('kit'), name, createdAt: now, updatedAt: now };
  saveKit(copy);
  return copy;
}

export function resetDefaultKit(): void {
  saveKit(structuredClone(DEFAULT_KIT));
}

// ── Scores ───────────────────────────────────────────────────────────────────

/** Record a pass score. Only kept when practising at the song's own tempo. */
export function recordScore(song: Song, bpm: number, score: number): boolean {
  if (bpm !== song.bpm) return false;
  const prev = state.scores[song.id];
  if (prev && prev.bpm === bpm && prev.best <= score) return false;
  set('scores', { ...state.scores, [song.id]: { best: score, bpm, at: new Date().toISOString() } });
  return true;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function updateSettings(patch: Partial<Settings>): void {
  set('settings', { ...state.settings, ...patch });
}

// ── Export / import ──────────────────────────────────────────────────────────

export function exportJson(): string {
  const kits = state.kits.map((k) => ({
    ...k,
    slots: k.slots.map((s) =>
      s.sound.type === 'user' ? { ...s, sound: DEFAULT_KIT.slots[k.slots.indexOf(s)].sound } : s,
    ),
  }));
  return JSON.stringify({ version: 1, songs: state.songs, kits, scores: state.scores }, null, 2);
}

export function importJson(text: string): { songs: number; kits: number } {
  const data = JSON.parse(text) as Partial<State> & { version?: number };
  const songs = Array.isArray(data.songs) ? data.songs : [];
  const kits = Array.isArray(data.kits) ? data.kits : [];
  const byId = <T extends { id: string }>(a: T[], b: T[]) => {
    const m = new Map(a.map((x) => [x.id, x]));
    for (const x of b) m.set(x.id, x);
    return [...m.values()];
  };
  set('songs', byId(state.songs, songs));
  set('kits', byId(state.kits, kits));
  if (data.scores) set('scores', { ...state.scores, ...data.scores });
  return { songs: songs.length, kits: kits.length };
}
