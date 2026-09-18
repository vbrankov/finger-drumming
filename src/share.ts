import type { Kit, Song } from './model/types';
import { DEFAULT_KIT_ID } from './model/types';
import { DEFAULT_KIT, getState, newId, saveKit, saveSong } from './store';

/**
 * Share links carry the whole song (and, if it is not the default, its kit)
 * in the URL fragment: nothing is uploaded anywhere. Kits are stripped of
 * user-uploaded samples, which fall back to the default kit's sound.
 */

type SharedSong = Pick<Song, 'name' | 'author' | 'difficulty' | 'bpm' | 'bars' | 'swing' | 'hits'>;
type SharedKit = Pick<Kit, 'name' | 'slots'>;

export type SharePayload =
  | { t: 'song'; song: SharedSong; kit?: SharedKit }
  | { t: 'kit'; kit: SharedKit }
  | { t: 'pack'; v: number; items: SharePayload[] };

const PARAM = 's';
/** Text-pack format: "fd1:" + token. Bump the number when the payload shape changes incompatibly. */
export const PACK_VERSION = 1;
const PACK_PREFIX = 'fd' + PACK_VERSION + ':';

function stripKit(kit: Kit): SharedKit {
  return {
    name: kit.name,
    slots: kit.slots.map((s, i) => ({
      role: s.role,
      sound: s.sound.type === 'bundled' ? s.sound : DEFAULT_KIT.slots[i].sound,
      ...(s.gain !== undefined && s.gain !== 1 ? { gain: s.gain } : {}),
      ...(s.pitch ? { pitch: s.pitch } : {}),
    })),
  };
}

export function songPayload(song: Song, kit: Kit): SharePayload {
  const shared: SharedSong = { name: song.name, bpm: song.bpm, hits: song.hits };
  if (song.author) shared.author = song.author;
  if (song.difficulty) shared.difficulty = song.difficulty;
  if (song.bars && song.bars > 1) shared.bars = song.bars;
  if (song.swing && song.swing.amount > 50) shared.swing = song.swing;
  return kit.id === DEFAULT_KIT_ID ? { t: 'song', song: shared } : { t: 'song', song: shared, kit: stripKit(kit) };
}

export function kitPayload(kit: Kit): SharePayload {
  return { t: 'kit', kit: stripKit(kit) };
}

/** Many songs and kits in one payload; a song's non-default kit is embedded with it. */
export function packPayload(songs: Song[], kits: Kit[], kitFor: (song: Song) => Kit): SharePayload {
  return {
    t: 'pack',
    v: PACK_VERSION,
    items: [...kits.map(kitPayload), ...songs.map((s) => songPayload(s, kitFor(s)))],
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

export interface TextImportResult {
  songs: number;
  kits: number;
  skipped: number;
  unreadable: number;
  newerVersion: boolean;
}

/**
 * Import everything recognisable in a pasted text: pack tokens ("fd1:…") and
 * share links ("…#s=…"), in any surrounding prose. Items already in the
 * library are skipped.
 */
export async function importText(text: string): Promise<TextImportResult> {
  const result: TextImportResult = { songs: 0, kits: 0, skipped: 0, unreadable: 0, newerVersion: false };
  const tokens: string[] = [];
  for (const m of text.matchAll(/\bfd(\d+):([A-Za-z0-9_-]+)/g)) {
    if (Number(m[1]) > PACK_VERSION) result.newerVersion = true;
    else tokens.push(m[2]);
  }
  for (const m of text.matchAll(/#s=([A-Za-z0-9_-]+)/g)) tokens.push(m[1]);

  const apply = (p: SharePayload) => {
    if (p.t === 'pack') {
      p.items.forEach(apply);
      return;
    }
    const r = importShared(p);
    if (!r.added) result.skipped++;
    else if (p.t === 'song') result.songs++;
    else result.kits++;
  };
  for (const token of tokens) {
    const payload = await decodeShare(token);
    if (payload) apply(payload);
    else result.unreadable++;
  }
  return result;
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

// ── Import into the library, without duplicating what is already there ──────

function sameKit(a: SharedKit, b: Kit): boolean {
  return a.name === b.name && JSON.stringify(a.slots) === JSON.stringify(stripKit(b).slots);
}

function sameSong(a: SharedSong, b: Song, kitId: string): boolean {
  return (
    a.name === b.name &&
    (a.author ?? '') === (b.author ?? '') &&
    a.bpm === b.bpm &&
    (a.bars ?? 1) === (b.bars ?? 1) &&
    JSON.stringify(a.swing ?? null) === JSON.stringify(b.swing ?? null) &&
    kitId === b.kitId &&
    JSON.stringify(a.hits) === JSON.stringify(b.hits)
  );
}

function importKit(shared: SharedKit): Kit {
  const existing = getState().kits.find((k) => sameKit(shared, k));
  if (existing) return existing;
  const now = new Date().toISOString();
  const kit: Kit = { id: newId('kit'), name: shared.name, slots: shared.slots.slice(0, 16), createdAt: now, updatedAt: now };
  saveKit(kit);
  return kit;
}

export function importShared(payload: SharePayload): { song?: Song; kit: Kit; added: boolean } {
  if (payload.t === 'pack') {
    // Callers wanting per-item results use importText; here a pack just imports everything.
    let added = false;
    let last: { song?: Song; kit: Kit; added: boolean } | null = null;
    for (const item of payload.items) {
      last = importShared(item);
      added ||= last.added;
    }
    return last ? { ...last, added } : { kit: DEFAULT_KIT, added: false };
  }
  if (payload.t === 'kit') {
    const before = getState().kits.length;
    const kit = importKit(payload.kit);
    return { kit, added: getState().kits.length > before };
  }
  const kit = payload.kit ? importKit(payload.kit) : (getState().kits.find((k) => k.id === DEFAULT_KIT_ID) ?? DEFAULT_KIT);
  const existing = getState().songs.find((s) => sameSong(payload.song, s, kit.id));
  if (existing) return { song: existing, kit, added: false };
  const now = new Date().toISOString();
  const song: Song = { id: newId('song'), ...payload.song, kitId: kit.id, createdAt: now, updatedAt: now };
  saveSong(song);
  return { song, kit, added: true };
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
