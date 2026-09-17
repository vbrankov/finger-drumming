import type { Hit } from './types';
import { gradePass, type PadGroup, type PassResult, type PlayerHit } from './grading';
import { passClosesAt, passIndexOf, passStart } from './timing';

/**
 * Collects player hits during a looping practice run and grades each pass once
 * it can receive no more hits. Pure: time is passed in, nothing is scheduled.
 */
export class PracticeSession {
  private pending = new Map<number, PlayerHit[]>();
  private nextToClose = 0;

  constructor(
    private readonly expected: Hit[],
    private readonly bpm: number,
    /** Audio time of step 0 of pass 0. */
    private readonly songStart: number,
    private readonly groupOf?: PadGroup,
  ) {}

  addHit(hit: PlayerHit): void {
    const p = passIndexOf(hit.time, this.songStart, this.bpm);
    if (p < this.nextToClose) return; // too late, pass already graded
    let list = this.pending.get(p);
    if (!list) this.pending.set(p, (list = []));
    list.push(hit);
  }

  /** Grade every pass that has closed as of `now`. Returns them in order. */
  collect(now: number): { passIndex: number; result: PassResult }[] {
    const out: { passIndex: number; result: PassResult }[] = [];
    while (passClosesAt(this.nextToClose, this.songStart, this.bpm) <= now) {
      const p = this.nextToClose++;
      const hits = this.pending.get(p) ?? [];
      this.pending.delete(p);
      out.push({ passIndex: p, result: gradePass(this.expected, hits, passStart(p, this.songStart, this.bpm), this.bpm, this.groupOf) });
    }
    return out;
  }
}
