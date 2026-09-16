import { describe, expect, it } from 'vitest';
import { gradePass, scoreOf, MISS_MS } from './grading';
import { matchWindow, passDuration, passIndexOf, stepDuration } from './timing';
import { PracticeSession } from './session';

const BPM = 120; // stepDur = 0.125 s, window = 0.0625 s
const SD = stepDuration(BPM);

describe('timing', () => {
  it('derives step duration and window from bpm', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125);
    expect(passDuration(120)).toBeCloseTo(2);
    expect(matchWindow(120)).toBeCloseTo(0.0625);
    expect(matchWindow(60)).toBeCloseTo(0.125);
    expect(matchWindow(40)).toBeCloseTo(0.15); // capped
  });

  it('assigns early step-0 hits to the next pass and late step-15 hits to this one', () => {
    const W = matchWindow(BPM);
    const pd = passDuration(BPM);
    expect(passIndexOf(10 + pd - W / 2, 10, BPM)).toBe(1); // slightly early for pass 1 step 0
    expect(passIndexOf(10 + pd - W - 0.001, 10, BPM)).toBe(0); // late step 15 of pass 0
    expect(passIndexOf(10 - W / 2, 10, BPM)).toBe(0); // early for the very first hit
  });
});

describe('scoreOf', () => {
  it('sums the three largest errors', () => {
    expect(scoreOf([5, 100, 20, 50, 1])).toBe(170);
    expect(scoreOf([5, 20])).toBe(25);
    expect(scoreOf([])).toBe(0);
  });
});

describe('gradePass', () => {
  const kick = 0;
  const snare = 1;
  const expected = [
    { pad: kick, step: 0 },
    { pad: snare, step: 4 },
    { pad: kick, step: 8 },
    { pad: snare, step: 12 },
  ];

  it('grades a perfect pass as zero', () => {
    const hits = expected.map((h) => ({ pad: h.pad, time: 10 + h.step * SD }));
    const r = gradePass(expected, hits, 10, BPM);
    expect(r.score).toBe(0);
    expect(r.results.every((x) => x.kind === 'hit')).toBe(true);
  });

  it('reports signed offsets in ms, positive = late', () => {
    const hits = [
      { pad: kick, time: 10 + 0.02 },
      { pad: snare, time: 10 + 4 * SD - 0.01 },
      { pad: kick, time: 10 + 8 * SD },
      { pad: snare, time: 10 + 12 * SD + 0.03 },
    ];
    const r = gradePass(expected, hits, 10, BPM);
    const byStep = Object.fromEntries(r.results.map((x) => [x.step, x]));
    expect(byStep[0].kind).toBe('hit');
    expect((byStep[0] as { offsetMs: number }).offsetMs).toBeCloseTo(20);
    expect(byStep[4].kind).toBe('hit');
    expect((byStep[4] as { offsetMs: number }).offsetMs).toBeCloseTo(-10);
    expect(r.score).toBeCloseTo(30 + 20 + 10);
  });

  it('counts a missing hit as 1000', () => {
    const hits = expected.slice(1).map((h) => ({ pad: h.pad, time: 10 + h.step * SD }));
    const r = gradePass(expected, hits, 10, BPM);
    expect(r.results.find((x) => x.kind === 'miss')).toMatchObject({ pad: kick, step: 0, errorMs: MISS_MS });
    expect(r.score).toBe(MISS_MS);
  });

  it('counts an extra hit as 1000 and places it on the nearest step', () => {
    const hits = [
      ...expected.map((h) => ({ pad: h.pad, time: 10 + h.step * SD })),
      { pad: kick, time: 10 + 5.4 * SD },
    ];
    const r = gradePass(expected, hits, 10, BPM);
    expect(r.results.find((x) => x.kind === 'extra')).toMatchObject({ pad: kick, step: 5, errorMs: MISS_MS });
    expect(r.score).toBe(MISS_MS);
  });

  it('treats a wrong pad as a miss plus an extra', () => {
    const hits = [
      { pad: snare, time: 10 }, // should have been kick
      { pad: snare, time: 10 + 4 * SD },
      { pad: kick, time: 10 + 8 * SD },
      { pad: snare, time: 10 + 12 * SD },
    ];
    const r = gradePass(expected, hits, 10, BPM);
    expect(r.results.filter((x) => x.kind === 'miss')).toHaveLength(1);
    expect(r.results.filter((x) => x.kind === 'extra')).toHaveLength(1);
    expect(r.score).toBe(2 * MISS_MS);
  });

  it('a hit outside the window is a miss plus an extra, not a bad hit', () => {
    const W = matchWindow(BPM);
    const hits = [
      { pad: kick, time: 10 + W + 0.001 },
      { pad: snare, time: 10 + 4 * SD },
      { pad: kick, time: 10 + 8 * SD },
      { pad: snare, time: 10 + 12 * SD },
    ];
    const r = gradePass(expected, hits, 10, BPM);
    expect(r.score).toBe(2 * MISS_MS);
  });

  it('matches greedily by smallest offset when two hits compete for one expectation', () => {
    const hits = [
      { pad: kick, time: 10 - 0.03 },
      { pad: kick, time: 10 + 0.01 }, // closer, wins
      { pad: snare, time: 10 + 4 * SD },
      { pad: kick, time: 10 + 8 * SD },
      { pad: snare, time: 10 + 12 * SD },
    ];
    const r = gradePass(expected, hits, 10, BPM);
    const step0 = r.results.filter((x) => x.pad === kick && x.step === 0);
    expect(step0.map((x) => x.kind).sort()).toEqual(['extra', 'hit']);
    expect((step0.find((x) => x.kind === 'hit') as { offsetMs: number }).offsetMs).toBeCloseTo(10);
  });

  it('handles adjacent expected steps on the same pad without stealing', () => {
    const roll = [
      { pad: kick, step: 0 },
      { pad: kick, step: 1 },
    ];
    const hits = [
      { pad: kick, time: 10 + 0.04 }, // late for step 0, but closer to step 0 than step 1? 0.04 vs 0.085
      { pad: kick, time: 10 + SD + 0.02 },
    ];
    const r = gradePass(roll, hits, 10, BPM);
    expect(r.results.map((x) => x.kind)).toEqual(['hit', 'hit']);
    expect(r.score).toBeCloseTo(60);
  });
});

describe('PracticeSession', () => {
  const expected = [{ pad: 0, step: 0 }, { pad: 0, step: 8 }];
  const pd = passDuration(BPM);
  const W = matchWindow(BPM);

  it('grades passes only once they have closed, in order', () => {
    const s = new PracticeSession(expected, BPM, 10);
    s.addHit({ pad: 0, time: 10 });
    s.addHit({ pad: 0, time: 10 + 8 * SD + 0.005 });
    expect(s.collect(10 + pd - W - 0.001)).toEqual([]); // not closed yet
    const out = s.collect(10 + pd);
    expect(out).toHaveLength(1);
    expect(out[0].passIndex).toBe(0);
    expect(out[0].result.score).toBeCloseTo(5);
  });

  it('routes an early hit for the next pass correctly', () => {
    const s = new PracticeSession(expected, BPM, 10);
    s.addHit({ pad: 0, time: 10 });
    s.addHit({ pad: 0, time: 10 + 8 * SD });
    s.addHit({ pad: 0, time: 10 + pd - 0.02 }); // early for pass 1 step 0
    const [p0] = s.collect(10 + pd);
    expect(p0.result.score).toBe(0);
    s.addHit({ pad: 0, time: 10 + pd + 8 * SD });
    const [p1] = s.collect(10 + 2 * pd);
    expect(p1.passIndex).toBe(1);
    expect(p1.result.score).toBeCloseTo(20);
  });

  it('grades a silent pass as all misses', () => {
    const s = new PracticeSession(expected, BPM, 10);
    const out = s.collect(10 + 3 * pd);
    expect(out.map((o) => o.passIndex)).toEqual([0, 1, 2]);
    expect(out[0].result.score).toBe(2 * MISS_MS);
  });
});
