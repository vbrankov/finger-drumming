import type { Swing } from './types';

export const MAX_WINDOW_S = 0.15;

/** Seconds per 16th-note step. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

/**
 * Time of a step from the start of its pass, in seconds, with swing applied.
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

/** Nearest step to a time within a pass (inverse of stepTime), clamped to the pattern. */
export function nearestStep(timeInPass: number, bpm: number, steps: number, swing?: Swing): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < steps; k++) {
    const d = Math.abs(stepTime(k, bpm, swing) - timeInPass);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** Seconds per pass (the whole pattern, `steps` 16ths long). */
export function passDuration(bpm: number, steps: number): number {
  return stepDuration(bpm) * steps;
}

/** Half a step, capped at 150 ms. A hit further than this from any expected hit is unmatched. */
export function matchWindow(bpm: number): number {
  return Math.min(stepDuration(bpm) / 2, MAX_WINDOW_S);
}

/**
 * Which pass a hit at `time` belongs to. Pass p covers [pStart − W, pEnd − W),
 * so early hits for the next pass's step 0 go to the next pass and late hits
 * for step 15 stay in this one.
 */
export function passIndexOf(time: number, songStart: number, bpm: number, steps: number): number {
  return Math.floor((time - songStart + matchWindow(bpm)) / passDuration(bpm, steps));
}

export function passStart(passIndex: number, songStart: number, bpm: number, steps: number): number {
  return songStart + passIndex * passDuration(bpm, steps);
}

/** Audio time after which pass `passIndex` can receive no more hits. */
export function passClosesAt(passIndex: number, songStart: number, bpm: number, steps: number): number {
  return passStart(passIndex + 1, songStart, bpm, steps) - matchWindow(bpm);
}
