import type { Kit, Pattern } from './model/types';
import { DEFAULT_KIT_ID } from './model/types';
import { DEFAULT_KIT, getState, newId, saveKit, savePattern } from './store';

/**
 * Share links carry the whole pattern (and, if it is not the default, its kit)
 * in the URL fragment: nothing is uploaded anywhere. Kits are stripped of
 * user-uploaded samples, which fall back to the default kit's sound.
 */

/** Ids travel with shared items so an updated version of something you already have is recognised. */
type SharedPattern = Pick<Pattern, 'name' | 'author' | 'difficulty' | 'bpm' | 'bars' | 'swing' | 'hits'> & { id?: string };
type SharedKit = Pick<Kit, 'name' | 'slots'> & { id?: string };

export type SharePayload =
  | { t: 'song'; song: SharedPattern; kit?: SharedKit }
  | { t: 'kit'; kit: SharedKit }
  | { t: 'pack'; v: number; items: SharePayload[] };

const PARAM = 's';
/** Text-pack format: "fd1:" + token. Bump the number when the payload shape changes incompatibly. */
export const PACK_VERSION = 1;
const PACK_PREFIX = 'fd' + PACK_VERSION + ':';

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

export function patternPayload(pattern: Pattern, kit: Kit): SharePayload {
  const shared: SharedPattern = { id: pattern.id, name: pattern.name, bpm: pattern.bpm, hits: pattern.hits };
  if (pattern.author) shared.author = pattern.author;
  if (pattern.difficulty) shared.difficulty = pattern.difficulty;
  if (pattern.bars && pattern.bars > 1) shared.bars = pattern.bars;
  if (pattern.swing && pattern.swing.amount > 50) shared.swing = pattern.swing;
  return kit.id === DEFAULT_KIT_ID ? { t: 'song', song: shared } : { t: 'song', song: shared, kit: stripKit(kit) };
}

export function kitPayload(kit: Kit): SharePayload {
  return { t: 'kit', kit: stripKit(kit) };
}

/** Many patterns and kits in one payload; a pattern's non-default kit is embedded with it. */
export function packPayload(patterns: Pattern[], kits: Kit[], kitFor: (pattern: Pattern) => Kit): SharePayload {
  return {
    t: 'pack',
    v: PACK_VERSION,
    items: [...kits.map(kitPayload), ...patterns.map((s) => patternPayload(s, kitFor(s)))],
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

export async function decodeShare(token: string): Promise<SharePayload | null> {
  try {
    const kind = token[0];
    const bytes = fromBase64Url(token.slice(1));
    const json = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    const payload = JSON.parse(new TextDecoder().decode(json)) as SharePayload;
    return validPayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

function validPayload(p: SharePayload): boolean {
  if (!p || typeof p !== 'object') return false;
  if (p.t === 'song') return Array.isArray(p.song?.hits);
  if (p.t === 'kit') return Array.isArray(p.kit?.slots);
  if (p.t === 'pack') return Array.isArray(p.items) && p.items.every(validPayload);
  return false;
}

/** A pack as a string that survives being pasted into a forum post. */
export async function packText(payload: SharePayload): Promise<string> {
  return PACK_PREFIX + (await encodeShare(payload));
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

// ── Import: plan, let the user resolve conflicts, apply ─────────────────────

export type Resolution = 'replace' | 'both' | 'skip';

export interface Conflict {
  key: string; // 'pattern:<id>' | 'kit:<id>'
  kind: 'pattern' | 'kit';
  name: string;
  author?: string;
  /** What differs, for the dialog. */
  summary: string;
}

export interface ImportPlan {
  kits: SharedKit[]; // to add (no conflict)
  patterns: SharedPattern[]; // to add (no conflict)
  conflicts: { conflict: Conflict; item: SharedKit | SharedPattern }[];
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

function kitContent(k: SharedKit | Kit): string {
  const stripped = stripKit({ ...k, id: '', createdAt: '', updatedAt: '' } as Kit);
  return JSON.stringify({ name: k.name, slots: stripped.slots });
}

function describePatternDiff(a: SharedPattern, b: Pattern): string {
  const d: string[] = [];
  if (a.name !== b.name) d.push('name');
  if ((a.author ?? '') !== (b.author ?? '')) d.push('author');
  if (a.bpm !== b.bpm) d.push('tempo ' + b.bpm + ' \u2192 ' + a.bpm);
  if ((a.bars ?? 1) !== (b.bars ?? 1)) d.push('bars');
  if (JSON.stringify(a.swing ?? null) !== JSON.stringify(b.swing ?? null)) d.push('swing');
  if ((a.difficulty ?? null) !== (b.difficulty ?? null)) d.push('difficulty');
  if (JSON.stringify(canonicalHits(a.hits)) !== JSON.stringify(canonicalHits(b.hits))) d.push('hits (' + b.hits.length + ' \u2192 ' + a.hits.length + ')');
  return d.join(', ') || 'kit';
}

/** Decide what a set of payloads would do to the library, without touching it. */
export function planImport(payloads: SharePayload[]): ImportPlan {
  const plan: ImportPlan = { kits: [], patterns: [], conflicts: [], skipped: 0, unreadable: 0, newerVersion: false };
  const state = getState();
  const seenKits = new Set<string>();
  const seenPatterns = new Set<string>();

  const addKit = (k: SharedKit) => {
    const key = k.id ?? 'content:' + kitContent(k);
    if (seenKits.has(key)) return;
    seenKits.add(key);
    const byId = k.id ? state.kits.find((x) => x.id === k.id) : undefined;
    if (byId) {
      if (kitContent(byId) === kitContent(k)) plan.skipped++;
      else plan.conflicts.push({ conflict: { key: 'kit:' + k.id, kind: 'kit', name: k.name, summary: 'sounds or roles differ' }, item: k });
      return;
    }
    if (state.kits.some((x) => kitContent(x) === kitContent(k))) plan.skipped++;
    else plan.kits.push(k);
  };

  const addSong = (sng: SharedPattern, kitId: string) => {
    const key = sng.id ?? 'content:' + patternContent(sng, kitId);
    if (seenPatterns.has(key)) return;
    seenPatterns.add(key);
    const byId = sng.id ? state.patterns.find((x) => x.id === sng.id) : undefined;
    if (byId) {
      if (patternContent(byId, byId.kitId) === patternContent(sng, kitId)) plan.skipped++;
      else plan.conflicts.push({ conflict: { key: 'pattern:' + sng.id, kind: 'pattern', name: sng.name, author: sng.author, summary: describePatternDiff(sng, byId) }, item: sng });
      return;
    }
    if (state.patterns.some((x) => patternContent(x, x.kitId) === patternContent(sng, kitId))) plan.skipped++;
    else plan.patterns.push(sng);
  };

  const walk = (p: SharePayload) => {
    if (p.t === 'pack') p.items.forEach(walk);
    else if (p.t === 'kit') addKit(p.kit);
    else {
      if (p.kit) addKit(p.kit);
      addSong({ ...p.song, kitId: p.kit?.id ?? DEFAULT_KIT_ID } as SharedPattern, p.kit?.id ?? DEFAULT_KIT_ID);
    }
  };
  payloads.forEach(walk);
  return plan;
}

export interface ImportOutcome {
  patterns: number;
  kits: number;
  replaced: number;
  skipped: number;
  /** The first imported (or replaced) pattern, to open it. */
  pattern?: Pattern;
  kit?: Kit;
}

/**
 * Apply a plan with the user's resolutions for its conflicts. Kits go first
 * so patterns can be re-pointed when a kit was kept as a copy.
 */
export function applyImport(plan: ImportPlan, resolutions: Record<string, Resolution>): ImportOutcome {
  const out: ImportOutcome = { patterns: 0, kits: 0, replaced: 0, skipped: plan.skipped };
  const now = new Date().toISOString();
  const kitIdMap = new Map<string, string>(); // incoming kit id → local kit id

  const saveIncomingKit = (k: SharedKit, id: string) => {
    const kit: Kit = { id, name: k.name, slots: k.slots.slice(0, 16), createdAt: now, updatedAt: now };
    saveKit(kit);
    out.kit ??= kit;
    if (k.id) kitIdMap.set(k.id, id);
    return kit;
  };
  const saveIncomingPattern = (sng: SharedPattern, id: string) => {
    const kitIdIn = (sng as SharedPattern & { kitId?: string }).kitId ?? DEFAULT_KIT_ID;
    const kitId = kitIdMap.get(kitIdIn) ?? (getState().kits.some((k) => k.id === kitIdIn) ? kitIdIn : DEFAULT_KIT_ID);
    const { id: _id, kitId: _k, ...rest } = sng as SharedPattern & { kitId?: string };
    const pattern: Pattern = { id, ...rest, kitId, createdAt: now, updatedAt: now };
    savePattern(pattern);
    out.pattern ??= pattern;
    return pattern;
  };

  for (const k of plan.kits) saveIncomingKit(k, k.id ?? newId('kit'));
  for (const { conflict, item } of plan.conflicts) {
    if (conflict.kind !== 'kit') continue;
    const r = resolutions[conflict.key] ?? 'skip';
    if (r === 'skip') out.skipped++;
    else if (r === 'replace') {
      saveIncomingKit(item as SharedKit, item.id!);
      out.replaced++;
    } else {
      saveIncomingKit({ ...(item as SharedKit), name: item.name + ' (imported)' }, newId('kit'));
      out.kits++;
    }
  }
  out.kits += plan.kits.length;

  for (const sng of plan.patterns) saveIncomingPattern(sng, sng.id ?? newId('pattern'));
  for (const { conflict, item } of plan.conflicts) {
    if (conflict.kind !== 'pattern') continue;
    const r = resolutions[conflict.key] ?? 'skip';
    if (r === 'skip') out.skipped++;
    else if (r === 'replace') {
      saveIncomingPattern(item as SharedPattern, item.id!);
      out.replaced++;
    } else {
      saveIncomingPattern({ ...(item as SharedPattern), name: item.name + ' (imported)' }, newId('pattern'));
      out.patterns++;
    }
  }
  out.patterns += plan.patterns.length;
  return out;
}

/** Pack tokens ("fd1:…") and share links ("…#s=…") found in a text, in any surrounding prose. */
export async function payloadsFromText(text: string): Promise<{ payloads: SharePayload[]; unreadable: number; newerVersion: boolean }> {
  const tokens: string[] = [];
  let newerVersion = false;
  for (const m of text.matchAll(/\bfd(\d+):([A-Za-z0-9_-]+)/g)) {
    if (Number(m[1]) > PACK_VERSION) newerVersion = true;
    else tokens.push(m[2]);
  }
  for (const m of text.matchAll(/#s=([A-Za-z0-9_-]+)/g)) tokens.push(m[1]);
  const payloads: SharePayload[] = [];
  let unreadable = 0;
  for (const token of tokens) {
    const p = await decodeShare(token);
    if (p) payloads.push(p);
    else unreadable++;
  }
  return { payloads, unreadable, newerVersion };
}

export function describeOutcome(o: ImportOutcome, plan?: Pick<ImportPlan, 'unreadable' | 'newerVersion'>): string {
  const parts: string[] = [];
  if (o.patterns) parts.push(o.patterns + ' pattern' + (o.patterns === 1 ? '' : 's'));
  if (o.kits) parts.push(o.kits + ' kit' + (o.kits === 1 ? '' : 's'));
  let msg = parts.length ? 'Added ' + parts.join(' and ') + '.' : '';
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
