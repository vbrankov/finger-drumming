import type { Swing } from './types';

export const MAX_WINDOW_S = 0.15;

/** Seconds per 16th-note step. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

/**
 * Time of a step from the start of its pattern, in seconds, with swing applied.
 * Sixteenth swing: within each pair of 16ths the second one lands at
 * 2·stepDur·s instead of stepDur (s = amount/100). Eighth swing: within each
 * beat the "&" lands at 4·stepDur·s instead of 2·stepDur, and the 16ths either
 * side sit halfway between their neighbours.
 */
export function stepTime(step: number, bpm: number, swing?: Swing): number {
  const sd = stepDuration(bpm);
  if (!swing || swing.amount <= 50) return step * sd;
  const s = Math.min(75, swing.amount) / 100;
  if (swing.unit === 'sixteenth') {
    return step % 2 === 0 ? step * sd : (step - 1) * sd + 2 * sd * s;
  }
  const beat = Math.floor(step / 4) * 4 * sd;
  const and = 4 * sd * s; // swung position of the "&" within the beat
  switch (step % 4) {
    case 0:
      return beat;
    case 1:
      return beat + and / 2;
    case 2:
      return beat + and;
    default:
      return beat + (and + 4 * sd) / 2;
  }
}

/** Half a step, capped at 150 ms. A hit further than this from any expected hit is unmatched. */
export function matchWindow(bpm: number): number {
  return Math.min(stepDuration(bpm) / 2, MAX_WINDOW_S);
}

/**
 * Maps steps to seconds for one pass of whatever is being practised: a single
 * pattern, or a sequence of patterns (a song, or a looped section of one),
 * each with its own swing. Pattern boundaries are always on the straight grid.
 */
export interface Timeline {
  bpm: number;
  /** Steps in one pass. */
  steps: number;
  /** Seconds in one pass. */
  duration: number;
  /** Seconds from pass start to the given step (0 ≤ step < steps). */
  timeOf(step: number): number;
  /** The step whose time is nearest to t (seconds from pass start), clamped. */
  nearestStep(t: number): number;
  /** Segments, for display: which pattern is playing at a given step. */
  segments: TimelineSegment[];
}

export interface TimelineSegment {
  start: number; // first global step
  steps: number;
  swing?: Swing;
  /** Free tag for callers (e.g. section index); unused by timing. */
  tag?: unknown;
}

export function makeTimeline(bpm: number, parts: { steps: number; swing?: Swing; tag?: unknown }[]): Timeline {
  const sd = stepDuration(bpm);
  const segments: TimelineSegment[] = [];
  let start = 0;
  for (const p of parts) {
    segments.push({ start, steps: p.steps, swing: p.swing, tag: p.tag });
    start += p.steps;
  }
  const steps = start;
  const segmentAt = (step: number): TimelineSegment => {
    // Few segments; linear scan is fine.
    let seg = segments[0];
    for (const s of segments) if (step >= s.start) seg = s;
    return seg;
  };
  const timeOf = (step: number) => {
    const seg = segmentAt(step);
    return seg.start * sd + stepTime(step - seg.start, bpm, seg.swing);
  };
  return {
    bpm,
    steps,
    duration: steps * sd,
    segments,
    timeOf,
    nearestStep(t: number) {
      // Start from the straight-grid guess and check its neighbours; swing moves
      // a step by less than a step, so the nearest is within ±1.
      const guess = Math.min(steps - 1, Math.max(0, Math.round(t / sd)));
      let best = guess;
      let bestD = Math.abs(timeOf(guess) - t);
      for (const k of [guess - 1, guess + 1]) {
        if (k < 0 || k >= steps) continue;
        const d = Math.abs(timeOf(k) - t);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      return best;
    },
  };
}

/** A single pattern: `steps` 16ths long with one swing setting. */
export function patternTimeline(bpm: number, steps: number, swing?: Swing): Timeline {
  return makeTimeline(bpm, [{ steps, swing }]);
}

// ── Passes ───────────────────────────────────────────────────────────────────

/**
 * Which pass a hit at `time` belongs to. Pass p covers [pStart − W, pEnd − W),
 * so early hits for the next pass's step 0 go to the next pass and late hits
 * for the last step stay in this one. Since W ≤ stepDur / 2 there is no
 * ambiguity.
 */
export function passIndexOf(time: number, songStart: number, tl: Timeline): number {
  return Math.floor((time - songStart + matchWindow(tl.bpm)) / tl.duration);
}

export function passStart(passIndex: number, songStart: number, tl: Timeline): number {
  return songStart + passIndex * tl.duration;
}

/** Audio time after which pass `passIndex` can receive no more hits. */
export function passClosesAt(passIndex: number, songStart: number, tl: Timeline): number {
  return passStart(passIndex + 1, songStart, tl) - matchWindow(tl.bpm);
}
