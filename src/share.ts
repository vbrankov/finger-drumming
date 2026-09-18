import type { Kit, Pattern, Song, SongSection } from './model/types';
import { DEFAULT_KIT_ID } from './model/types';
import { DEFAULT_KIT, getState, newId, repairedFile, saveKit, savePattern, saveSong } from './store';

/**
 * Share links and text packs carry whole patterns, songs and kits in the URL
 * fragment or a pasted token: nothing is uploaded anywhere. Kits are stripped
 * of user-uploaded samples, which fall back to the default kit's sound.
 *
 * Wire format version 2 (FORMAT.md). Version 1 — where `t: 'song'` meant what
 * is now a pattern — is still read.
 */

export const FORMAT_VERSION = 2;
const PARAM = 's';

/** Ids travel with shared items so an updated version of something you already have is recognised. */
export type SharedPattern = Pick<Pattern, 'name' | 'author' | 'difficulty' | 'bpm' | 'bars' | 'swing' | 'hits'> & { id?: string };
export type SharedKit = Pick<Kit, 'name' | 'slots'> & { id?: string };
export type SharedSong = Pick<Song, 'name' | 'author' | 'difficulty' | 'bpm' | 'sections'> & { id?: string };

/** Version-2 payloads as written. */
export type SharePayload =
  | { v: 2; t: 'pattern'; pattern: SharedPattern; kit?: SharedKit }
  | { v: 2; t: 'song'; song: SharedSong; patterns: SharedPattern[]; kit?: SharedKit }
  | { v: 2; t: 'kit'; kit: SharedKit }
  | { v: 2; t: 'pack'; items: SharePayload[] };

function stripKit(kit: Kit): SharedKit {
  return {
    id: kit.id,
    name: kit.name,
    slots: kit.slots.map((s, i) => ({
      role: s.role,
      sound: s.sound.type === 'bundled' ? s.sound : DEFAULT_KIT.slots[i].sound,
      ...(s.gain !== undefined && s.gain !== 1 ? { gain: s.gain } : {}),
      ...(s.pitch ? { pitch: s.pitch } : {}),
    })),
  };
}

function stripPattern(pattern: Pattern): SharedPattern {
  const shared: SharedPattern = { id: pattern.id, name: pattern.name, bpm: pattern.bpm, hits: pattern.hits };
  if (pattern.author) shared.author = pattern.author;
  if (pattern.difficulty) shared.difficulty = pattern.difficulty;
  if (pattern.bars && pattern.bars > 1) shared.bars = pattern.bars;
  if (pattern.swing && pattern.swing.amount > 50) shared.swing = pattern.swing;
  return shared;
}

export function patternPayload(pattern: Pattern, kit: Kit): SharePayload {
  const p: SharePayload = { v: 2, t: 'pattern', pattern: stripPattern(pattern) };
  if (kit.id !== DEFAULT_KIT_ID) p.kit = stripKit(kit);
  return p;
}

/** A song with every pattern it uses embedded (and its kit if not the default). */
export function songPayload(song: Song, patterns: Pattern[], kit: Kit): SharePayload {
  const byId = new Map(patterns.map((p) => [p.id, p]));
  const used = [...new Set(song.sections.map((s) => s.patternId))].map((id) => byId.get(id)).filter((p): p is Pattern => !!p);
  const shared: SharedSong = { id: song.id, name: song.name, bpm: song.bpm, sections: song.sections };
  if (song.author) shared.author = song.author;
  if (song.difficulty) shared.difficulty = song.difficulty;
  const p: SharePayload = { v: 2, t: 'song', song: shared, patterns: used.map(stripPattern) };
  if (kit.id !== DEFAULT_KIT_ID) p.kit = stripKit(kit);
  return p;
}

export function kitPayload(kit: Kit): SharePayload {
  return { v: 2, t: 'kit', kit: stripKit(kit) };
}

/** Many items in one payload. */
export function packPayload(
  items: { patterns?: Pattern[]; songs?: Song[]; kits?: Kit[] },
  ctx: { kitFor: (kitId: string) => Kit; patterns: Pattern[] },
): SharePayload {
  return {
    v: 2,
    t: 'pack',
    items: [
      ...(items.kits ?? []).map(kitPayload),
      ...(items.patterns ?? []).map((p) => patternPayload(p, ctx.kitFor(p.kitId))),
      ...(items.songs ?? []).map((s) => songPayload(s, ctx.patterns, ctx.kitFor(s.kitId))),
    ],
  };
}

// ── Encoding: deflate-raw + base64url, falling back to plain base64url ──────

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeShare(payload: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'function') {
    return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  }
  return 'j' + toBase64Url(json);
}

export type Decoded = { ok: true; payload: SharePayload } | { ok: false; reason: 'unreadable' | 'newer' };

/** Decode a token of any supported version into a version-2 payload. */
export async function decodeShare(token: string, versionHint = 1): Promise<Decoded> {
  try {
    const kind = token[0];
    const bytes = fromBase64Url(token.slice(1));
    const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    const raw = JSON.parse(new TextDecoder().decode(json)) as Record<string, unknown>;
    const version = typeof raw.v === 'number' ? raw.v : versionHint;
    if (version > FORMAT_VERSION) return { ok: false, reason: 'newer' };
    const payload = normalize(raw, version);
    return payload ? { ok: true, payload } : { ok: false, reason: 'unreadable' };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/** Upgrade older shapes and validate. Returns null for anything malformed. */
function normalize(raw: Record<string, unknown>, version: number): SharePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw.t;
  if (t === 'pack') {
    if (!Array.isArray(raw.items)) return null;
    const items = (raw.items as Record<string, unknown>[]).map((i) => normalize(i, version));
    return items.every((i): i is SharePayload => !!i) ? { v: 2, t: 'pack', items } : null;
  }
  if (t === 'kit') {
    const kit = raw.kit as SharedKit;
    return Array.isArray(kit?.slots) ? { v: 2, t: 'kit', kit } : null;
  }
  const kit = raw.kit as SharedKit | undefined;
  if (kit && !Array.isArray(kit.slots)) return null;
  if (version < 2) {
    // v1: `song` was a pattern.
    if (t !== 'song') return null;
    const pattern = raw.song as SharedPattern;
    return Array.isArray(pattern?.hits) ? { v: 2, t: 'pattern', pattern, ...(kit ? { kit } : {}) } : null;
  }
  if (t === 'pattern') {
    const pattern = raw.pattern as SharedPattern;
    return Array.isArray(pattern?.hits) ? { v: 2, t: 'pattern', pattern, ...(kit ? { kit } : {}) } : null;
  }
  if (t === 'song') {
    const song = raw.song as SharedSong;
    const patterns = raw.patterns as SharedPattern[];
    if (!Array.isArray(song?.sections) || !Array.isArray(patterns) || !patterns.every((p) => Array.isArray(p?.hits))) return null;
    return { v: 2, t: 'song', song, patterns, ...(kit ? { kit } : {}) };
  }
  return null;
}

/** A pack as a string that survives being pasted into a forum post: "fd2:" + token. */
export async function packText(payload: SharePayload): Promise<string> {
  return 'fd' + FORMAT_VERSION + ':' + (await encodeShare(payload));
}

export async function shareLink(payload: SharePayload): Promise<string> {
  const base = location.origin + location.pathname;
  return base + '#' + PARAM + '=' + (await encodeShare(payload));
}

export function shareTokenFromLocation(): string | null {
  const m = /^#s=([A-Za-z0-9_-]+)/.exec(location.hash);
  return m ? m[1] : null;
}

export function clearShareFromLocation(): void {
  history.replaceState(null, '', location.pathname + location.search);
}

/** Pack tokens ("fd1:…", "fd2:…") and share links ("…#s=…") found in a text, in any surrounding prose. */
export async function payloadsFromText(text: string): Promise<{ payloads: SharePayload[]; unreadable: number; newerVersion: boolean }> {
  const found: { token: string; version: number }[] = [];
  for (const m of text.matchAll(/\bfd(\d+):([A-Za-z0-9_-]+)/g)) found.push({ token: m[2], version: Number(m[1]) });
  for (const m of text.matchAll(/#s=([A-Za-z0-9_-]+)/g)) found.push({ token: m[1], version: 1 });
  const payloads: SharePayload[] = [];
  let unreadable = 0;
  let newerVersion = false;
  for (const { token, version } of found) {
    if (version > FORMAT_VERSION) {
      newerVersion = true;
      continue;
    }
    const d = await decodeShare(token, version);
    if (d.ok) payloads.push(d.payload);
    else if (d.reason === 'newer') newerVersion = true;
    else unreadable++;
  }
  return { payloads, unreadable, newerVersion };
}

// ── Import: plan, let the user resolve conflicts, apply ─────────────────────

export type Resolution = 'replace' | 'both' | 'skip';
type Kind = 'pattern' | 'kit' | 'song';

export interface Conflict {
  key: string; // '<kind>:<id>'
  kind: Kind;
  name: string;
  author?: string;
  /** What differs, for the dialog. */
  summary: string;
}

type PatternIn = SharedPattern & { kitId: string };
type SongIn = SharedSong & { kitId: string };

export interface ImportPlan {
  kits: SharedKit[];
  patterns: PatternIn[];
  songs: SongIn[];
  conflicts: { conflict: Conflict; item: SharedKit | PatternIn | SongIn }[];
  skipped: number; // identical to something already present
  unreadable: number;
  newerVersion: boolean;
}

/** Hits in canonical order, with the default velocity dropped, so equal patterns compare equal. */
function canonicalHits(hits: Pattern['hits']): { pad: number; step: number; velocity?: number }[] {
  return [...hits]
    .map((h) => (h.velocity && h.velocity !== 100 ? { pad: h.pad, step: h.step, velocity: h.velocity } : { pad: h.pad, step: h.step }))
    .sort((a, b) => a.step - b.step || a.pad - b.pad);
}

function patternContent(s: SharedPattern | Pattern, kitId: string): string {
  return JSON.stringify({
    name: s.name,
    author: s.author ?? '',
    difficulty: s.difficulty ?? null,
    bpm: s.bpm,
    bars: s.bars ?? 1,
    swing: s.swing && s.swing.amount > 50 ? s.swing : null,
    kitId,
    hits: canonicalHits(s.hits),
  });
}

function songContent(s: SharedSong | Song, kitId: string): string {
  return JSON.stringify({
    name: s.name,
    author: s.author ?? '',
    difficulty: s.difficulty ?? null,
    bpm: s.bpm,
    kitId,
    sections: s.sections.map((x) => ({ patternId: x.patternId, repeat: x.repeat })),
  });
}

function kitContent(k: SharedKit | Kit): string {
  const stripped = stripKit({ ...k, id: '', createdAt: '', updatedAt: '' } as Kit);
  return JSON.stringify({ name: k.name, slots: stripped.slots });
}

function describePatternDiff(a: SharedPattern, b: Pattern): string {
  const d: string[] = [];
  if (a.name !== b.name) d.push('name');
  if ((a.author ?? '') !== (b.author ?? '')) d.push('author');
  if (a.bpm !== b.bpm) d.push('tempo ' + b.bpm + ' → ' + a.bpm);
  if ((a.bars ?? 1) !== (b.bars ?? 1)) d.push('bars');
  if (JSON.stringify(a.swing ?? null) !== JSON.stringify(b.swing ?? null)) d.push('swing');
  if ((a.difficulty ?? null) !== (b.difficulty ?? null)) d.push('difficulty');
  if (JSON.stringify(canonicalHits(a.hits)) !== JSON.stringify(canonicalHits(b.hits))) d.push('hits (' + b.hits.length + ' → ' + a.hits.length + ')');
  return d.join(', ') || 'kit';
}

function describeSongDiff(a: SharedSong, b: Song): string {
  const d: string[] = [];
  if (a.name !== b.name) d.push('name');
  if ((a.author ?? '') !== (b.author ?? '')) d.push('author');
  if (a.bpm !== b.bpm) d.push('tempo ' + b.bpm + ' → ' + a.bpm);
  if ((a.difficulty ?? null) !== (b.difficulty ?? null)) d.push('difficulty');
  if (JSON.stringify(a.sections) !== JSON.stringify(b.sections)) d.push('sections (' + b.sections.length + ' → ' + a.sections.length + ')');
  return d.join(', ') || 'kit';
}

/** Decide what a set of payloads would do to the library, without touching it. */
export function planImport(payloads: SharePayload[]): ImportPlan {
  const plan: ImportPlan = { kits: [], patterns: [], songs: [], conflicts: [], skipped: 0, unreadable: 0, newerVersion: false };
  const state = getState();
  const seen = new Set<string>();

  const addKit = (k: SharedKit) => {
    const key = 'kit:' + (k.id ?? 'content:' + kitContent(k));
    if (seen.has(key)) return;
    seen.add(key);
    const byId = k.id ? state.kits.find((x) => x.id === k.id) : undefined;
    if (byId) {
      if (kitContent(byId) === kitContent(k)) plan.skipped++;
      else plan.conflicts.push({ conflict: { key: 'kit:' + k.id, kind: 'kit', name: k.name, summary: 'sounds or roles differ' }, item: k });
      return;
    }
    if (state.kits.some((x) => kitContent(x) === kitContent(k))) plan.skipped++;
    else plan.kits.push(k);
  };

  const addPattern = (p: SharedPattern, kitId: string) => {
    const item: PatternIn = { ...p, kitId };
    const key = 'pattern:' + (p.id ?? 'content:' + patternContent(p, kitId));
    if (seen.has(key)) return;
    seen.add(key);
    const byId = p.id ? state.patterns.find((x) => x.id === p.id) : undefined;
    if (byId) {
      if (patternContent(byId, byId.kitId) === patternContent(p, kitId)) plan.skipped++;
      else plan.conflicts.push({ conflict: { key: 'pattern:' + p.id, kind: 'pattern', name: p.name, author: p.author, summary: describePatternDiff(p, byId) }, item });
      return;
    }
    if (state.patterns.some((x) => patternContent(x, x.kitId) === patternContent(p, kitId))) plan.skipped++;
    else plan.patterns.push(item);
  };

  const addSong = (s: SharedSong, kitId: string) => {
    const item: SongIn = { ...s, kitId };
    const key = 'song:' + (s.id ?? 'content:' + songContent(s, kitId));
    if (seen.has(key)) return;
    seen.add(key);
    const byId = s.id ? state.songs.find((x) => x.id === s.id) : undefined;
    if (byId) {
      if (songContent(byId, byId.kitId) === songContent(s, kitId)) plan.skipped++;
      else plan.conflicts.push({ conflict: { key: 'song:' + s.id, kind: 'song', name: s.name, author: s.author, summary: describeSongDiff(s, byId) }, item });
      return;
    }
    if (state.songs.some((x) => songContent(x, x.kitId) === songContent(s, kitId))) plan.skipped++;
    else plan.songs.push(item);
  };

  const walk = (p: SharePayload) => {
    if (p.t === 'pack') p.items.forEach(walk);
    else if (p.t === 'kit') addKit(p.kit);
    else {
      if (p.kit) addKit(p.kit);
      const kitId = p.kit?.id ?? DEFAULT_KIT_ID;
      if (p.t === 'pattern') addPattern(p.pattern, kitId);
      else {
        for (const pat of p.patterns) addPattern(pat, kitId);
        addSong(p.song, kitId);
      }
    }
  };
  payloads.forEach(walk);
  return plan;
}

export interface ImportOutcome {
  patterns: number;
  songs: number;
  kits: number;
  replaced: number;
  skipped: number;
  /** The first imported (or replaced) items, to open one. */
  pattern?: Pattern;
  song?: Song;
  kit?: Kit;
}

/**
 * Apply a plan with the user's resolutions for its conflicts. Kits go first,
 * then patterns, then songs, so later items can be re-pointed when an earlier
 * one was kept as a copy under a new id.
 */
export function applyImport(plan: ImportPlan, resolutions: Record<string, Resolution>): ImportOutcome {
  const out: ImportOutcome = { patterns: 0, songs: 0, kits: 0, replaced: 0, skipped: plan.skipped };
  const now = new Date().toISOString();
  const kitIdMap = new Map<string, string>();
  const patternIdMap = new Map<string, string>();
  const localKitId = (id: string) => kitIdMap.get(id) ?? (getState().kits.some((k) => k.id === id) ? id : DEFAULT_KIT_ID);

  const saveIncomingKit = (k: SharedKit, id: string) => {
    const slots = k.slots.slice(0, 16).map((slot, i) => {
      if (slot.sound?.type !== 'bundled') return { ...slot, sound: DEFAULT_KIT.slots[i].sound };
      const file = repairedFile(slot.sound.file);
      return file ? { ...slot, sound: { type: 'bundled' as const, file } } : { ...slot, sound: DEFAULT_KIT.slots[i].sound };
    });
    const kit: Kit = { id, name: k.name, slots, createdAt: now, updatedAt: now };
    saveKit(kit);
    out.kit ??= kit;
    if (k.id) kitIdMap.set(k.id, id);
  };
  const saveIncomingPattern = (p: PatternIn, id: string) => {
    const { id: _id, kitId, ...rest } = p;
    const pattern: Pattern = { id, ...rest, kitId: localKitId(kitId), createdAt: now, updatedAt: now };
    savePattern(pattern);
    out.pattern ??= pattern;
    if (p.id) patternIdMap.set(p.id, id);
  };
  const saveIncomingSong = (s: SongIn, id: string) => {
    const { id: _id, kitId, ...rest } = s;
    const sections: SongSection[] = s.sections.map((x) => ({ patternId: patternIdMap.get(x.patternId) ?? x.patternId, repeat: Math.max(1, x.repeat || 1) }));
    const song: Song = { id, ...rest, sections, kitId: localKitId(kitId), createdAt: now, updatedAt: now };
    saveSong(song);
    out.song ??= song;
  };

  const resolve = <T extends { id?: string; name: string }>(kind: Kind, save: (item: T, id: string) => void, prefix: string, counter: 'kits' | 'patterns' | 'songs') => {
    for (const { conflict, item } of plan.conflicts) {
      if (conflict.kind !== kind) continue;
      const r = resolutions[conflict.key] ?? 'skip';
      const it = item as unknown as T;
      if (r === 'skip') out.skipped++;
      else if (r === 'replace') {
        save(it, it.id!);
        out.replaced++;
      } else {
        save({ ...it, name: it.name + ' (imported)' }, newId(prefix));
        out[counter]++;
      }
    }
  };

  for (const k of plan.kits) saveIncomingKit(k, k.id ?? newId('kit'));
  resolve<SharedKit>('kit', saveIncomingKit, 'kit', 'kits');
  out.kits += plan.kits.length;

  for (const p of plan.patterns) saveIncomingPattern(p, p.id ?? newId('pattern'));
  resolve<PatternIn>('pattern', saveIncomingPattern, 'pattern', 'patterns');
  out.patterns += plan.patterns.length;

  for (const s of plan.songs) saveIncomingSong(s, s.id ?? newId('song'));
  resolve<SongIn>('song', saveIncomingSong, 'song', 'songs');
  out.songs += plan.songs.length;
  return out;
}

export function describeOutcome(o: ImportOutcome, plan?: Pick<ImportPlan, 'unreadable' | 'newerVersion'>): string {
  const parts: string[] = [];
  if (o.songs) parts.push(o.songs + ' song' + (o.songs === 1 ? '' : 's'));
  if (o.patterns) parts.push(o.patterns + ' pattern' + (o.patterns === 1 ? '' : 's'));
  if (o.kits) parts.push(o.kits + ' kit' + (o.kits === 1 ? '' : 's'));
  let msg = parts.length ? 'Added ' + parts.join(', ') + '.' : '';
  if (o.replaced) msg += ' Replaced ' + o.replaced + '.';
  if (o.skipped) msg += ' Skipped ' + o.skipped + ' you already had.';
  if (plan?.unreadable) msg += ' ' + plan.unreadable + ' item' + (plan.unreadable === 1 ? '' : 's') + ' could not be read.';
  if (plan?.newerVersion) msg += ' Some items were made with a newer version of the app; update to import them.';
  return msg.trim() || 'Nothing to import.';
}

/** Copy to clipboard; falls back to a prompt so the link can be copied by hand. */
export async function copyLink(url: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    alert('Link to ' + what + ' copied. Anyone who opens it gets it added to their library.');
  } catch {
    prompt('Copy this link to ' + what + ':', url);
  }
}
