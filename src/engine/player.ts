import type { Hit } from '../model/types';
import { STEPS } from '../model/types';
import { stepDuration } from '../model/timing';
import type { Timeline } from '../model/timing';
import { chokeVoice, getAudioContext, makeClick, playBuffer, velocityGain } from './audio';
import type { Voice } from './audio';
import { Scheduler } from './scheduler';

export interface LoadedKit {
  buffers: (AudioBuffer | null)[]; // by pad index
  gains: number[];
  rates: number[]; // playback rate from the slot's pitch
  /** Choke group per pad (e.g. 'hat'), or null. A new hit in a group cuts the group's ringing voices. */
  chokes: (string | null)[];
}

/** Voices still ringing per choke group, so a closed hat can cut an open one. */
const ringing = new Map<string, Voice[]>();

/** Play one slot of a loaded kit at `when` (audio time) with the given velocity. */
export function playSlot(kit: LoadedKit, pad: number, velocity: number | undefined, when: number): void {
  const buf = kit.buffers[pad];
  if (!buf) return;
  const group = kit.chokes[pad] ?? null;
  if (group) {
    for (const v of ringing.get(group) ?? []) chokeVoice(v, when);
    ringing.set(group, []);
  }
  const voice = playBuffer(buf, when, velocityGain(velocity) * (kit.gains[pad] ?? 1), kit.rates[pad] ?? 1);
  if (group) {
    ringing.get(group)!.push(voice);
    voice.src.onended = () => {
      const list = ringing.get(group);
      if (list) ringing.set(group, list.filter((x) => x !== voice));
    };
  }
}

export interface PlayerOptions {
  /** Hits with global steps within the timeline's pass. */
  hits: Hit[];
  /** Steps → seconds for one pass; also fixes the tempo. */
  timeline: Timeline;
  kit: LoadedKit;
  /** Play the pattern's drums. Off = Solo mode. */
  playSong: boolean;
  metronome: boolean;
  countInBars: number;
}

const START_DELAY_S = 0.15;

/**
 * Loops the pattern forever, with an optional count-in. `songStart` is the audio
 * time of step 0 of pass 0, the reference the grader and the playhead both
 * use. Metronome clicks every beat, accented on the first beat of each bar.
 */
export class PatternPlayer {
  songStart = 0;
  private scheduler: Scheduler | null = null;
  private clickHi: AudioBuffer | null = null;
  private clickLo: AudioBuffer | null = null;

  constructor(private readonly opts: PlayerOptions) {}

  start(): number {
    const ctx = getAudioContext();
    this.clickHi ??= makeClick(true);
    this.clickLo ??= makeClick(false);
    const stepDur = stepDuration(this.opts.timeline.bpm);
    const countInSteps = this.opts.countInBars * STEPS;
    const now = ctx.currentTime + START_DELAY_S;
    this.songStart = now + countInSteps * stepDur;

    this.scheduler = new Scheduler((from, to) => this.schedule(from, to));
    this.scheduler.start(now);
    return this.songStart;
  }

  stop(): void {
    this.scheduler?.stop();
    this.scheduler = null;
  }

  get running(): boolean {
    return this.scheduler?.running ?? false;
  }

  /** Global step index (negative during count-in) at audio time t, fractional. */
  positionAt(t: number): number {
    return (t - this.songStart) / stepDuration(this.opts.timeline.bpm);
  }

  private schedule(from: number, to: number): void {
    const { hits, timeline: tl, kit, playSong, metronome } = this.opts;
    const stepDur = stepDuration(tl.bpm);
    const passDur = tl.duration;
    // Metronome and count-in are straight; pattern hits take their swung times.
    const first = Math.ceil((from - this.songStart) / stepDur - 1e-9);
    const last = Math.floor((to - this.songStart) / stepDur - 1e-9);
    for (let k = first; k <= last; k++) {
      const inBar = ((k % STEPS) + STEPS) % STEPS;
      // The count-in always clicks; after it, only when the metronome is on.
      if ((metronome || k < 0) && inBar % 4 === 0) playBuffer(inBar === 0 ? this.clickHi! : this.clickLo!, this.songStart + k * stepDur);
    }
    if (!playSong) return;
    const firstPass = Math.max(0, Math.floor((from - this.songStart) / passDur));
    const lastPass = Math.floor((to - this.songStart) / passDur);
    for (let p = firstPass; p <= lastPass; p++) {
      const pStart = this.songStart + p * passDur;
      for (const h of hits) {
        const t = pStart + tl.timeOf(h.step);
        if (t >= from && t < to) playSlot(kit, h.pad, h.velocity, t);
      }
    }
  }
}
