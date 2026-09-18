import type { Hit, Swing } from './types';
import { gradePass, MISS_MS, type HitResult, type PadGroup, type PassResult, type PlayerHit } from './grading';
import { matchWindow, nearestStep, passClosesAt, passIndexOf, passStart, stepTime } from './timing';

export type LiveResult = HitResult & { passIndex: number };

export interface Collected {
  /** Passes that closed since the last call, graded in full. */
  passes: { passIndex: number; result: PassResult }[];
  /** Misses whose window expired since the last call. */
  live: LiveResult[];
}

/**
 * Collects player hits during a looping practice run. Gives immediate,
 * provisional feedback per hit (addHit) and per expired expectation
 * (collect), and grades each pass in full once it can receive no more hits.
 * Pure: time is passed in, nothing is scheduled.
 */
export class PracticeSession {
  private pending = new Map<number, PlayerHit[]>();
  private matched = new Set<string>(); // "pass:pad:step" expectations already claimed live
  private reported = new Set<string>(); // expectations already reported live (hit or miss)
  private nextToClose = 0;
  private readonly window: number;
  private readonly groupOf: PadGroup;

  constructor(
    private readonly expected: Hit[],
    private readonly bpm: number,
    /** Audio time of step 0 of pass 0. */
    private readonly songStart: number,
    /** Song length in 16th steps. */
    private readonly steps: number,
    groupOf?: PadGroup,
    private readonly swing?: Swing,
  ) {
    this.window = matchWindow(bpm);
    this.groupOf = groupOf ?? ((pad) => pad);
  }

  /** Record a hit; returns the immediate verdict, or null if the pass already closed. */
  addHit(hit: PlayerHit): LiveResult | null {
    const p = passIndexOf(hit.time, this.songStart, this.bpm, this.steps);
    if (p < this.nextToClose) return null;
    let list = this.pending.get(p);
    if (!list) this.pending.set(p, (list = []));
    list.push(hit);

    const pStart = passStart(p, this.songStart, this.bpm, this.steps);
    const group = this.groupOf(hit.pad);
    let best: { e: Hit; offset: number } | null = null;
    for (const e of this.expected) {
      if (this.groupOf(e.pad) !== group || this.matched.has(this.key(p, e))) continue;
      const offset = hit.time - (pStart + stepTime(e.step, this.bpm, this.swing));
      if (Math.abs(offset) <= this.window && (!best || Math.abs(offset) < Math.abs(best.offset))) best = { e, offset };
    }
    if (best) {
      this.matched.add(this.key(p, best.e));
      this.reported.add(this.key(p, best.e));
      const offsetMs = best.offset * 1000;
      return { kind: 'hit', pad: best.e.pad, step: best.e.step, offsetMs, errorMs: Math.abs(offsetMs), velocity: hit.velocity, passIndex: p };
    }
    const step = nearestStep(hit.time - pStart, this.bpm, this.steps, this.swing);
    return { kind: 'extra', pad: hit.pad, step, time: hit.time, errorMs: MISS_MS, passIndex: p };
  }

  /** Advance to `now`: report newly expired expectations as misses and grade closed passes. */
  collect(now: number): Collected {
    const live: LiveResult[] = [];
    const current = passIndexOf(now, this.songStart, this.bpm, this.steps);
    for (let p = this.nextToClose; p <= current; p++) {
      const pStart = passStart(p, this.songStart, this.bpm, this.steps);
      for (const e of this.expected) {
        const k = this.key(p, e);
        if (this.reported.has(k)) continue;
        if (pStart + stepTime(e.step, this.bpm, this.swing) + this.window <= now) {
          this.reported.add(k);
          live.push({ kind: 'miss', pad: e.pad, step: e.step, errorMs: MISS_MS, passIndex: p });
        }
      }
    }

    const passes: Collected['passes'] = [];
    while (passClosesAt(this.nextToClose, this.songStart, this.bpm, this.steps) <= now) {
      const p = this.nextToClose++;
      const hits = this.pending.get(p) ?? [];
      this.pending.delete(p);
      for (const e of this.expected) {
        this.matched.delete(this.key(p, e));
        this.reported.delete(this.key(p, e));
      }
      passes.push({
        passIndex: p,
        result: gradePass(this.expected, hits, passStart(p, this.songStart, this.bpm, this.steps), this.bpm, this.steps, this.groupOf, this.swing),
      });
    }
    return { passes, live };
  }

  private key(pass: number, e: Hit): string {
    return pass + ':' + e.pad + ':' + e.step;
  }
}
