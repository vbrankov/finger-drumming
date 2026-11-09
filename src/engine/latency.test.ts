import { describe, expect, it } from 'vitest';
import { burstDelay, mad, median, pairTapAndSound, thresholdFor } from './latency';
import type { Onset } from './latency';

const on = (time: number, peak = 0.5): Onset => ({ time, peak });

describe('median and mad', () => {
  it('takes the middle of an odd list and the mean of the middle pair', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('measures spread without letting one wild value set it', () => {
    expect(mad([10, 10, 10, 10])).toBe(0);
    expect(mad([10, 12, 10, 12, 500])).toBe(2);
  });
});

describe('burstDelay', () => {
  it('reports the gap to the first onset after the burst was scheduled', () => {
    expect(burstDelay([on(1.0), on(2.04), on(2.2)], 2.0)).toBeCloseTo(40, 6);
  });

  it('ignores anything before the burst could possibly arrive', () => {
    expect(burstDelay([on(1.9)], 2.0)).toBeNull();
  });

  it('gives up rather than blame a later noise', () => {
    expect(burstDelay([on(2.9)], 2.0, 0.4)).toBeNull();
  });
});

describe('pairTapAndSound', () => {
  it('takes the finger first and the loud drum after it', () => {
    const onsets = [on(0.98, 0.1), on(1.0, 0.12), on(1.06, 0.8), on(1.2, 0.3)];
    const r = pairTapAndSound(onsets, 1.0);
    expect(r.tap?.time).toBeCloseTo(0.98, 6);
    expect(r.sound?.time).toBeCloseTo(1.06, 6);
    expect(r.endToEndMs).toBeCloseTo(80, 6);
  });

  it('will not guess from a single onset: the pad was not heard', () => {
    expect(pairTapAndSound([on(1.0, 0.1)], 1.0).endToEndMs).toBeNull();
  });

  it('ignores onsets from a neighbouring hit', () => {
    const onsets = [on(0.2, 0.9), on(1.0, 0.1), on(1.05, 0.9), on(3.0, 0.9)];
    expect(pairTapAndSound(onsets, 1.0).endToEndMs).toBeCloseTo(50, 6);
  });

  it('rejects a gap too wide to be this hit', () => {
    expect(pairTapAndSound([on(1.0, 0.1), on(1.44, 0.9)], 1.0, { after: 0.6 }).endToEndMs).toBeNull();
  });
});

describe('thresholdFor', () => {
  it('sits clear of the room noise', () => {
    expect(thresholdFor(0.02)).toBeCloseTo(0.1, 6);
  });

  it('keeps a floor in a silent room and a ceiling in a loud one', () => {
    expect(thresholdFor(0)).toBeCloseTo(0.035, 6);
    expect(thresholdFor(0.4)).toBeCloseTo(0.5, 6);
  });
});
