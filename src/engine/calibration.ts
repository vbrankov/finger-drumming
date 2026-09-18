/**
 * Systematic latency estimate: for each tap, the signed offset to the nearest
 * beat; return a robust mean in ms. Negative = taps arrive early relative to
 * the audio clock, which is the normal case: to make your own sound land on
 * the click you tap early by the input + output latency.
 */
export function estimateCalibrationMs(tapTimes: number[], songStart: number, bpm: number): number | null {
  if (tapTimes.length < 4) return null;
  const beat = 60 / bpm;
  const offsets = tapTimes.map((t) => {
    const rel = t - songStart;
    return (rel - Math.round(rel / beat) * beat) * 1000;
  });
  return robustMean(offsets);
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Weighted mean with weights from the median absolute deviation: points within
 * D = median(|x − M|) of the median M count fully; points further away are
 * down-weighted by D / |x − M|, so one wild tap cannot drag the estimate.
 */
export function robustMean(xs: number[]): number {
  const m = median(xs);
  const d = median(xs.map((x) => Math.abs(x - m)));
  if (d === 0) return m;
  let sum = 0;
  let wsum = 0;
  for (const x of xs) {
    const dist = Math.abs(x - m);
    const w = dist <= d ? 1 : d / dist;
    sum += w * x;
    wsum += w;
  }
  return sum / wsum;
}
