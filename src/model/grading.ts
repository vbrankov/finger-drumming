import type { Hit } from './types';
import { STEPS } from './types';
import { matchWindow, stepDuration } from './timing';

export const MISS_MS = 1000;
export const SCORE_WORST_N = 3;

/** A hit the player made, in audio-clock seconds, already calibrated. */
export interface PlayerHit {
  pad: number;
  time: number;
  velocity?: number;
}

export type HitResult =
  | { kind: 'hit'; pad: number; step: number; offsetMs: number; errorMs: number }
  | { kind: 'miss'; pad: number; step: number; errorMs: number }
  | { kind: 'extra'; pad: number; step: number; time: number; errorMs: number };

export interface PassResult {
  results: HitResult[];
  score: number;
}

/** Sum of the N largest errors. Lower is better. */
export function scoreOf(errors: number[], n = SCORE_WORST_N): number {
  return [...errors]
    .sort((a, b) => b - a)
    .slice(0, n)
    .reduce((s, e) => s + e, 0);
}

/**
 * Grade one pass. `playerHits` must already be the hits belonging to this pass
 * (see passIndexOf). Matching is per pad, greedy by smallest |offset| within
 * the window; each expected hit and each player hit is used at most once.
 */
export function gradePass(
  expected: Hit[],
  playerHits: PlayerHit[],
  passStart: number,
  bpm: number,
): PassResult {
  const stepDur = stepDuration(bpm);
  const window = matchWindow(bpm);
  const results: HitResult[] = [];

  const pads = new Set<number>();
  for (const h of expected) pads.add(h.pad);
  for (const h of playerHits) pads.add(h.pad);

  for (const pad of pads) {
    const exp = expected.filter((h) => h.pad === pad);
    const got = playerHits.filter((h) => h.pad === pad);

    // Every candidate pairing within the window, best first.
    const pairs: { ei: number; gi: number; offset: number }[] = [];
    exp.forEach((e, ei) => {
      const expectedTime = passStart + e.step * stepDur;
      got.forEach((g, gi) => {
        const offset = g.time - expectedTime;
        if (Math.abs(offset) <= window) pairs.push({ ei, gi, offset });
      });
    });
    pairs.sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));

    const usedE = new Set<number>();
    const usedG = new Set<number>();
    for (const p of pairs) {
      if (usedE.has(p.ei) || usedG.has(p.gi)) continue;
      usedE.add(p.ei);
      usedG.add(p.gi);
      const offsetMs = p.offset * 1000;
      results.push({ kind: 'hit', pad, step: exp[p.ei].step, offsetMs, errorMs: Math.abs(offsetMs) });
    }
    exp.forEach((e, ei) => {
      if (!usedE.has(ei)) results.push({ kind: 'miss', pad, step: e.step, errorMs: MISS_MS });
    });
    got.forEach((g, gi) => {
      if (usedG.has(gi)) return;
      const step = nearestStep(g.time, passStart, stepDur);
      results.push({ kind: 'extra', pad, step, time: g.time, errorMs: MISS_MS });
    });
  }

  results.sort((a, b) => a.step - b.step || a.pad - b.pad);
  return { results, score: scoreOf(results.map((r) => r.errorMs)) };
}

function nearestStep(time: number, passStart: number, stepDur: number): number {
  const s = Math.round((time - passStart) / stepDur);
  return Math.min(STEPS - 1, Math.max(0, s));
}
