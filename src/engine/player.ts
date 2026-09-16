import type { Hit } from '../model/types';
import { STEPS } from '../model/types';
import { stepDuration } from '../model/timing';
import { getAudioContext, makeClick, playBuffer, velocityGain } from './audio';
import { Scheduler } from './scheduler';

export interface LoadedKit {
  buffers: (AudioBuffer | null)[]; // by pad index
  gains: number[];
}

export interface PlayerOptions {
  hits: Hit[];
  bpm: number;
  kit: LoadedKit;
  /** Play the song's drums. Off = Solo mode. */
  playSong: boolean;
  metronome: boolean;
  countInBars: number;
}

const START_DELAY_S = 0.15;

/**
 * Loops one measure forever, with an optional count-in. `songStart` is the
 * audio time of step 0 of pass 0, the reference the grader and the playhead
 * both use.
 */
export class SongPlayer {
  songStart = 0;
  private scheduler: Scheduler | null = null;
  private clickHi: AudioBuffer | null = null;
  private clickLo: AudioBuffer | null = null;

  constructor(private readonly opts: PlayerOptions) {}

  start(): number {
    const ctx = getAudioContext();
    this.clickHi ??= makeClick(true);
    this.clickLo ??= makeClick(false);
    const stepDur = stepDuration(this.opts.bpm);
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
    return (t - this.songStart) / stepDuration(this.opts.bpm);
  }

  private schedule(from: number, to: number): void {
    const { hits, bpm, kit, playSong, metronome } = this.opts;
    const stepDur = stepDuration(bpm);
    const first = Math.ceil((from - this.songStart) / stepDur - 1e-9);
    const last = Math.floor((to - this.songStart) / stepDur - 1e-9);
    for (let k = first; k <= last; k++) {
      const t = this.songStart + k * stepDur;
      const step = ((k % STEPS) + STEPS) % STEPS;
      if (metronome && step % 4 === 0) {
        playBuffer(step === 0 ? this.clickHi! : this.clickLo!, t);
      }
      if (k < 0 || !playSong) continue;
      for (const h of hits) {
        if (h.step !== step) continue;
        const buf = kit.buffers[h.pad];
        if (buf) playBuffer(buf, t, velocityGain(h.velocity) * (kit.gains[h.pad] ?? 1));
      }
    }
  }
}
