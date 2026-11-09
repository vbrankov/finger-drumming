import { playBuffer, resumeAudio } from './audio';

/**
 * Latency measurement with the microphone.
 *
 * The browser's own baseLatency + outputLatency is only what it believes about
 * its output path, and on Windows it can be wildly optimistic: it does not know
 * what the shared system mixer, the driver or the device add after it. So we
 * measure instead. An AudioWorklet watches the microphone for transients and
 * reports their time on the AudioContext clock, sample-accurate.
 *
 * Two things can then be measured:
 *
 *   Output path  — play a burst at a known time, see when the mic hears it.
 *                  That gap is output latency + flight time + the mic's own
 *                  input latency, so it is an upper bound on what we want.
 *
 *   End to end   — the player taps a pad. The mic hears two things: the finger
 *                  hitting the pad, then the drum coming out of the speaker.
 *                  The gap between them is the whole chain the player feels
 *                  (controller → MIDI → us → audio out), and the mic's own
 *                  latency cancels out, because both onsets travel through it.
 *                  No reported number is trusted at all.
 */

const ONSET_WORKLET = [
  'class FdOnset extends AudioWorkletProcessor {',
  '  constructor() {',
  '    super();',
  '    this.thresh = 0.15;',
  '    this.hold = 0;',
  '    this.wait = 0;',
  '    this.peak = 0;',
  '    this.onsetTime = 0;',
  '    this.holdFrames = Math.max(1, Math.round(sampleRate * 0.004));',
  '    this.waitFrames = Math.max(1, Math.round(sampleRate * 0.008));',
  '    this.level = 0;',
  '    this.blocks = 0;',
  '    this.port.onmessage = (e) => {',
  '      const d = e.data || {};',
  "      if (typeof d.thresh === 'number') this.thresh = d.thresh;",
  '      if (d.reset) { this.hold = 0; this.wait = 0; }',
  '    };',
  '  }',
  '  process(inputs) {',
  '    const ch = inputs[0] && inputs[0][0];',
  '    if (!ch) return true;',
  '    for (let i = 0; i < ch.length; i++) {',
  '      const a = ch[i] < 0 ? -ch[i] : ch[i];',
  '      if (a > this.level) this.level = a;',
  '      if (this.hold > 0) {',
  '        if (a > this.peak) this.peak = a;',
  '        if (--this.hold === 0) {',
  '          this.port.postMessage({ onset: this.onsetTime, peak: this.peak });',
  '          this.wait = this.waitFrames;',
  '        }',
  '      } else if (this.wait > 0) {',
  '        this.wait--;',
  '      } else if (a >= this.thresh) {',
  '        this.onsetTime = currentTime + i / sampleRate;',
  '        this.peak = a;',
  '        this.hold = this.holdFrames;',
  '      }',
  '    }',
  '    if (++this.blocks >= 8) {',
  '      this.port.postMessage({ level: this.level });',
  '      this.level = 0;',
  '      this.blocks = 0;',
  '    }',
  '    return true;',
  '  }',
  '}',
  "registerProcessor('fd-onset', FdOnset);",
].join('\n');

export interface Onset {
  /** AudioContext clock, seconds. */
  time: number;
  peak: number;
}

export interface Probe {
  onsets: Onset[];
  /** Loudest sample seen since the field was last zeroed. */
  levelPeak: number;
  /** What the browser claims the microphone path costs, ms, or null. */
  reportedInputMs: number | null;
  setThreshold(v: number): void;
  close(): void;
}

const loaded = new WeakSet<AudioContext>();

/** Open the microphone and start watching it for transients. */
export async function openProbe(): Promise<Probe> {
  const stream = await navigator.mediaDevices.getUserMedia({
    // As raw as we can ask for: echo cancellation would eat the very burst we
    // are listening for, and auto gain would move the threshold under us.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = await resumeAudio();
  if (!loaded.has(ctx)) {
    const url = URL.createObjectURL(new Blob([ONSET_WORKLET], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
      loaded.add(ctx);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const node = new AudioWorkletNode(ctx, 'fd-onset', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const src = ctx.createMediaStreamSource(stream);
  const sink = ctx.createGain();
  sink.gain.value = 0; // the worklet has to be pulled, but must not be heard
  src.connect(node).connect(sink).connect(ctx.destination);

  const track = stream.getAudioTracks()[0];
  const trackSettings = (track?.getSettings?.() ?? {}) as { latency?: number };
  const probe: Probe = {
    onsets: [],
    levelPeak: 0,
    reportedInputMs: typeof trackSettings.latency === 'number' ? trackSettings.latency * 1000 : null,
    setThreshold: (v) => node.port.postMessage({ thresh: v }),
    close: () => {
      try {
        src.disconnect();
        node.disconnect();
        sink.disconnect();
      } catch {
        /* already gone */
      }
      for (const t of stream.getTracks()) t.stop();
    },
  };

  node.port.onmessage = (e) => {
    const d = e.data as { onset?: number; peak?: number; level?: number };
    if (d.onset !== undefined) probe.onsets.push({ time: d.onset, peak: d.peak ?? 0 });
    if (d.level !== undefined && d.level > probe.levelPeak) probe.levelPeak = d.level;
  };
  return probe;
}

export const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation, as a plain spread figure. */
export function mad(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/** A short broadband crack: easy for a microphone to place in time. */
export function testBurst(ctx: BaseAudioContext): AudioBuffer {
  const dur = 0.006;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const noise = Math.random() * 2 - 1;
    last = 0.6 * last + 0.4 * noise; // tame the very top end, speakers wobble there
    d[i] = last * Math.exp(-(i / n) * 4) * 0.9;
  }
  return buf;
}

/** The first thing the mic heard after the burst was scheduled to leave. */
export function burstDelay(onsets: Onset[], scheduled: number, window = 0.4): number | null {
  const hit = onsets.find((o) => o.time > scheduled && o.time <= scheduled + window);
  return hit ? (hit.time - scheduled) * 1000 : null;
}

/**
 * Of the onsets around one pad hit, which was the finger and which the drum.
 * The finger comes first (it is what made the MIDI note), the drum is the loud
 * one after it.
 */
export function pairTapAndSound(
  onsets: Onset[],
  midiTime: number,
  opts: { before?: number; after?: number } = {},
): { tap?: Onset; sound?: Onset; endToEndMs: number | null } {
  const before = opts.before ?? 0.06;
  const after = opts.after ?? 0.45;
  const near = onsets.filter((o) => o.time >= midiTime - before && o.time <= midiTime + after);
  if (near.length < 2) return { tap: near[0], endToEndMs: null };
  const tap = near[0];
  const rest = near.slice(1);
  const loudest = Math.max(...rest.map((o) => o.peak));
  const sound = rest.find((o) => o.peak >= 0.6 * loudest) ?? rest[0];
  const ms = (sound.time - tap.time) * 1000;
  if (ms <= 0 || ms > 400) return { tap, sound, endToEndMs: null };
  return { tap, sound, endToEndMs: ms };
}

export interface OutputResult {
  /** Speaker to microphone, ms: our output path plus the mic's input path. */
  roundTripMs: number;
  /** Round trip less the mic's reported cost: what the player's ear waits for. */
  outputMs: number | null;
  spreadMs: number;
  samples: number[];
}

/** Play bursts, listen for them, and see how late they arrive. */
export async function measureOutputPath(
  probe: Probe,
  rounds = 8,
  onProgress?: (done: number, total: number) => void,
): Promise<OutputResult | null> {
  const ctx = await resumeAudio();
  const burst = testBurst(ctx);
  const samples: number[] = [];
  for (let i = 0; i < rounds; i++) {
    probe.onsets.length = 0;
    const at = ctx.currentTime + 0.25;
    playBuffer(burst, at);
    await sleep(600);
    const d = burstDelay(probe.onsets, at);
    if (d !== null) samples.push(d);
    onProgress?.(i + 1, rounds);
  }
  if (samples.length < 3) return null;
  // Throw away anything far from the pack: a chair creak is not our burst.
  const m = median(samples);
  const s = Math.max(mad(samples), 1);
  const keep = samples.filter((x) => Math.abs(x - m) <= 4 * s);
  return {
    roundTripMs: median(keep),
    outputMs: probe.reportedInputMs === null ? null : Math.max(0, median(keep) - probe.reportedInputMs),
    spreadMs: mad(keep),
    samples: keep,
  };
}

/** Measure the noise in the room so the threshold can sit above it. */
export async function noiseFloor(probe: Probe, ms = 500): Promise<number> {
  probe.setThreshold(1.5); // out of reach: we only want levels for now
  probe.levelPeak = 0;
  await sleep(ms);
  return probe.levelPeak;
}

export function thresholdFor(floor: number): number {
  return Math.min(0.5, Math.max(0.035, floor * 5));
}
