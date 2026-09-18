import { describe, expect, it } from 'vitest';
import { estimateCalibrationMs, median, robustMean } from './calibration';

describe('robustMean', () => {
  it('equals the plain mean for tight data', () => {
    expect(robustMean([10, 11, 12, 13, 14])).toBeCloseTo(12);
  });

  it('is barely moved by one wild point', () => {
    const tight = [-40, -38, -39, -37, -41, -38, -40, -39];
    const withOutlier = [...tight, 200];
    const plainMean = withOutlier.reduce((a, b) => a + b) / withOutlier.length; // ≈ -12.6
    const robust = robustMean(withOutlier);
    expect(Math.abs(robust - robustMean(tight))).toBeLessThan(2);
    expect(Math.abs(robust - plainMean)).toBeGreaterThan(20);
  });

  it('weights a point at distance k·D by 1/k', () => {
    // M = 0, D = 1; the point at 10 gets weight 0.1
    const xs = [-1, 0, 1, 10];
    // median of [-1,0,1,10] = 0.5; |x-M| = [1.5,0.5,0.5,9.5] → D = 1.0
    const m = 0.5;
    const d = 1.0;
    const w = xs.map((x) => (Math.abs(x - m) <= d ? 1 : d / Math.abs(x - m)));
    const expected = xs.reduce((s, x, i) => s + w[i] * x, 0) / w.reduce((a, b) => a + b);
    expect(robustMean(xs)).toBeCloseTo(expected);
  });

  it('returns the median when the data has no spread', () => {
    expect(robustMean([5, 5, 5, 5, 9])).toBe(5);
  });

  it('median handles even and odd lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('estimateCalibrationMs', () => {
  it('recovers a constant offset to the nearest beat despite an outlier', () => {
    const beat = 0.5; // 120 bpm
    const taps = Array.from({ length: 12 }, (_, i) => 10 + i * beat - 0.038);
    taps[5] += 0.2; // one flubbed tap
    expect(estimateCalibrationMs(taps, 10, 120)).toBeCloseTo(-38, 0);
  });
  it('needs at least four taps', () => {
    expect(estimateCalibrationMs([10, 10.5], 10, 120)).toBeNull();
  });
});
