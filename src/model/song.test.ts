import { describe, expect, it } from 'vitest';
import { layoutSong } from './song';
import type { Pattern, Song } from './types';

const pat = (id: string, bars: number, steps: number[]): Pattern => ({
  id,
  name: id,
  bpm: 90,
  bars,
  kitId: 'default',
  hits: steps.map((step) => ({ pad: 13, step })),
  createdAt: '',
  updatedAt: '',
});

describe('layoutSong', () => {
  const groove = pat('g', 1, [0, 8]);
  const fill = pat('f', 2, [0, 28, 29, 30, 31]);
  const song: Song = { id: 's', name: 's', bpm: 90, kitId: 'default', sections: [{ patternId: 'g', repeat: 3 }, { patternId: 'f', repeat: 1 }, { patternId: 'g', repeat: 2 }], createdAt: '', updatedAt: '' };

  it('lays repeats out back to back with no gaps or overlaps', () => {
    const l = layoutSong(song, [groove, fill]);
    expect(l.totalSteps).toBe(3 * 16 + 32 + 2 * 16);
    expect(l.sections.map((s) => [s.start, s.steps])).toEqual([[0, 48], [48, 32], [80, 32]]);
    const kickSteps = l.hits.map((h) => h.step);
    expect(kickSteps).toEqual([0, 8, 16, 24, 32, 40, 48, 76, 77, 78, 79, 80, 88, 96, 104]);
    expect(l.parts.map((p) => p.steps)).toEqual([16, 16, 16, 32, 16, 16]);
  });

  it('keeps the shape when a pattern is missing', () => {
    const l = layoutSong(song, [groove]);
    expect(l.missing).toEqual(['f']);
    expect(l.totalSteps).toBe(48 + 16 + 32); // missing pattern counts as one silent bar
  });
});
