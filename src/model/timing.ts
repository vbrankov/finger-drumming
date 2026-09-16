import { STEPS } from './types';

export const MAX_WINDOW_S = 0.15;

/** Seconds per 16th-note step. */
export function stepDuration(bpm: number): number {
  return 60 / bpm / 4;
}

/** Seconds per pass (one measure). */
export function passDuration(bpm: number): number {
  return stepDuration(bpm) * STEPS;
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
export function passIndexOf(time: number, songStart: number, bpm: number): number {
  return Math.floor((time - songStart + matchWindow(bpm)) / passDuration(bpm));
}

export function passStart(passIndex: number, songStart: number, bpm: number): number {
  return songStart + passIndex * passDuration(bpm);
}

/** Audio time after which pass `passIndex` can receive no more hits. */
export function passClosesAt(passIndex: number, songStart: number, bpm: number): number {
  return passStart(passIndex + 1, songStart, bpm) - matchWindow(bpm);
}
