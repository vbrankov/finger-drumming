import type { Kit, SoundRef } from '../model/types';
import { PAD_COUNT } from '../model/types';
import { decodeAudio } from './audio';
import { getBlob } from './blobs';
import type { LoadedKit } from './player';

const cache = new Map<string, Promise<AudioBuffer | null>>();

function keyOf(ref: SoundRef): string {
  return ref.type === 'bundled' ? 'bundled:' + ref.file : 'user:' + ref.blobId;
}

export function loadSound(ref: SoundRef): Promise<AudioBuffer | null> {
  const key = keyOf(ref);
  let p = cache.get(key);
  if (!p) {
    p = fetchSound(ref).catch((e) => {
      console.warn('Could not load sound', ref, e);
      cache.delete(key);
      return null;
    });
    cache.set(key, p);
  }
  return p;
}

async function fetchSound(ref: SoundRef): Promise<AudioBuffer | null> {
  if (ref.type === 'bundled') {
    const res = await fetch(import.meta.env.BASE_URL + 'sounds/' + ref.file);
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return decodeAudio(await res.arrayBuffer());
  }
  const blob = await getBlob(ref.blobId);
  if (!blob) return null;
  return decodeAudio(await blob.arrayBuffer());
}

/**
 * Resolve every slot of a kit to a buffer. A slot whose sound cannot be loaded
 * falls back to the same slot of `fallback` (the default kit), then to silence.
 */
export async function loadKit(kit: Kit, fallback?: Kit): Promise<LoadedKit> {
  const buffers = await Promise.all(
    Array.from({ length: PAD_COUNT }, async (_, i) => {
      const slot = kit.slots[i];
      let buf = slot ? await loadSound(slot.sound) : null;
      if (!buf && fallback && fallback !== kit) buf = await loadSound(fallback.slots[i].sound);
      return buf;
    }),
  );
  return {
    buffers,
    gains: kit.slots.map((s) => s?.gain ?? 1),
    rates: kit.slots.map((s) => Math.pow(2, (s?.pitch ?? 0) / 12)),
  };
}

export function invalidateSound(ref: SoundRef): void {
  cache.delete(keyOf(ref));
}
