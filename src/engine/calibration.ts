/**
 * Systematic latency estimate: for each tap, the signed offset to the nearest
 * beat; return the median in ms. Positive = taps arrive late relative to the
 * audio clock, which is the normal case (output latency + controller latency).
 */
export function estimateCalibrationMs(tapTimes: number[], songStart: number, bpm: number): number | null {
  if (tapTimes.length < 4) return null;
  const beat = 60 / bpm;
  const offsets = tapTimes
    .map((t) => {
      const rel = t - songStart;
      return (rel - Math.round(rel / beat) * beat) * 1000;
    })
    .sort((a, b) => a - b);
  const mid = offsets.length >> 1;
  return offsets.length % 2 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2;
}
