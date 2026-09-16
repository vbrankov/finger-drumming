import { getAudioContext } from './audio';

const TICK_MS = 25;
const LOOKAHEAD_S = 0.1;

/**
 * Lookahead scheduler. Every tick, asks the callback to schedule everything in
 * [from, to) on the audio clock. Nothing musical is ever timed off setInterval
 * itself; it only decides how far ahead we have scheduled.
 */
export class Scheduler {
  private timer: number | null = null;
  private scheduledUntil = 0;

  constructor(private readonly onSchedule: (from: number, to: number) => void) {}

  start(from: number): void {
    this.stop();
    this.scheduledUntil = from;
    const tick = () => {
      const to = getAudioContext().currentTime + LOOKAHEAD_S;
      if (to > this.scheduledUntil) {
        this.onSchedule(this.scheduledUntil, to);
        this.scheduledUntil = to;
      }
    };
    tick();
    this.timer = window.setInterval(tick, TICK_MS);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }
}
