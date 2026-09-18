import type { Hit, Pattern, Song, Swing } from './types';
import { patternSteps } from './types';

/** One section of a song laid out on the global step axis. */
export interface LaidSection {
  index: number;
  patternId: string;
  pattern: Pattern | null; // null if the pattern is missing from the library
  repeat: number;
  /** Global step where the section starts, and its total length (pattern steps × repeat). */
  start: number;
  steps: number;
  patternStepsEach: number;
}

export interface SongLayout {
  sections: LaidSection[];
  /** Parts for makeTimeline: one per repeat, so each keeps its pattern's swing. */
  parts: { steps: number; swing?: Swing; tag: { section: number; repeat: number } }[];
  /** All hits on the global step axis. */
  hits: Hit[];
  totalSteps: number;
  missing: string[]; // pattern ids not found
}

/** Lay a song out end to end. Missing patterns contribute one silent bar so the shape survives. */
export function layoutSong(song: Song, patterns: Pattern[]): SongLayout {
  const byId = new Map(patterns.map((p) => [p.id, p]));
  const sections: LaidSection[] = [];
  const parts: SongLayout['parts'] = [];
  const hits: Hit[] = [];
  const missing: string[] = [];
  let start = 0;
  song.sections.forEach((sec, index) => {
    const pattern = byId.get(sec.patternId) ?? null;
    if (!pattern) missing.push(sec.patternId);
    const each = pattern ? patternSteps(pattern) : 16;
    const repeat = Math.max(1, Math.floor(sec.repeat || 1));
    sections.push({ index, patternId: sec.patternId, pattern, repeat, start, steps: each * repeat, patternStepsEach: each });
    for (let r = 0; r < repeat; r++) {
      parts.push({ steps: each, swing: pattern?.swing, tag: { section: index, repeat: r } });
      if (pattern) for (const h of pattern.hits) hits.push({ ...h, step: start + r * each + h.step });
      start += each;
    }
  });
  hits.sort((a, b) => a.step - b.step || a.pad - b.pad);
  return { sections, parts, hits, totalSteps: start, missing };
}

/** "Basic Rock ×4 · Fill · Money Beat ×4" */
export function describeSong(song: Song, patterns: Pattern[]): string {
  const byId = new Map(patterns.map((p) => [p.id, p]));
  return song.sections
    .map((s) => (byId.get(s.patternId)?.name ?? '?') + (s.repeat > 1 ? ' ×' + s.repeat : ''))
    .join(' · ');
}

export function songBars(song: Song, patterns: Pattern[]): number {
  return layoutSong(song, patterns).totalSteps / 16;
}
