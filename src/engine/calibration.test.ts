import { describe, expect, it } from 'vitest';
import { estimateCalibrationMs } from './calibration';

describe('estimateCalibrationMs', () => {
  it('returns the median offset to the nearest beat', () => {
    const beat = 0.5; // 120 bpm
    const taps = [0, 1, 2, 3, 4, 5].map((i) => 10 + i * beat + 0.025);
    taps[2] += 0.2; // one outlier
    expect(estimateCalibrationMs(taps, 10, 120)).toBeCloseTo(25);
  });
  it('needs at least four taps', () => {
    expect(estimateCalibrationMs([10, 10.5], 10, 120)).toBeNull();
  });
});
