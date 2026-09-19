let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}

/** Must be called from a user gesture before anything can be heard. */
export async function resumeAudio(): Promise<AudioContext> {
  const c = getAudioContext();
  if (c.state !== 'running') await c.resume();
  return c;
}

export interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export function playBuffer(buffer: AudioBuffer, when: number, gain = 1, rate = 1): Voice {
  const c = getAudioContext();
  const src = c.createBufferSource();
  src.buffer = buffer;
  if (rate !== 1) src.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g).connect(c.destination);
  src.start(Math.max(when, c.currentTime));
  return { src, gain: g };
}

/** Fade a voice out quickly at `when` (a choke), then free it. */
export function chokeVoice(v: Voice, when: number): void {
  const c = getAudioContext();
  const t = Math.max(when, c.currentTime);
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.linearRampToValueAtTime(0, t + 0.02);
  try {
    v.src.stop(t + 0.03);
  } catch {
    /* already stopped */
  }
}

export function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
  return getAudioContext().decodeAudioData(data);
}

/** Velocity 1..127 → linear gain. Gentle curve so soft hits are still audible. */
export function velocityGain(velocity = 100): number {
  const v = Math.min(127, Math.max(1, velocity)) / 127;
  return 0.2 + 0.8 * v * v;
}

/**
 * Metronome click: a short exponentially-decaying sine. Not a drum sound,
 * just the one thing we need that no sample pack ships.
 */
export function makeClick(accent: boolean): AudioBuffer {
  const c = getAudioContext();
  const sr = c.sampleRate;
  const dur = 0.03;
  const buf = c.createBuffer(1, Math.floor(sr * dur), sr);
  const d = buf.getChannelData(0);
  const freq = accent ? 1500 : 1000;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    d[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 150) * (accent ? 0.8 : 0.5);
  }
  return buf;
}

/**
 * Map a performance.now()-based timestamp (what MIDI events carry) onto the
 * AudioContext clock (what everything is scheduled on).
 */
export function perfToAudioTime(perfMs: number): number {
  const c = getAudioContext();
  if (typeof c.getOutputTimestamp === 'function') {
    const { contextTime, performanceTime } = c.getOutputTimestamp();
    if (contextTime !== undefined && performanceTime !== undefined) {
      return contextTime + (perfMs - performanceTime) / 1000;
    }
  }
  return c.currentTime + (perfMs - performance.now()) / 1000;
}
