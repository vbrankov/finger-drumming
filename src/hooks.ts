import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext, perfToAudioTime, playBuffer, resumeAudio, velocityGain } from './engine/audio';
import { loadKit } from './engine/kitLoader';
import { initMidi, listMidiInputs, onMidiDevicesChanged, onMidiHit, setMidiDeviceFilter } from './engine/midi';
import type { MidiHit, MidiInputInfo } from './engine/midi';
import type { LoadedKit } from './engine/player';
import type { Kit } from './model/types';
import { defaultKit, getState, useStore } from './store';

// ── MIDI ─────────────────────────────────────────────────────────────────────

export interface MidiStatus {
  ok: boolean;
  error?: string;
  inputs: MidiInputInfo[];
}

let midiInit: Promise<{ ok: boolean; error?: string }> | null = null;

export function useMidiStatus(): MidiStatus {
  const { settings } = useStore();
  const [status, setStatus] = useState<MidiStatus>({ ok: false, inputs: [] });

  useEffect(() => {
    midiInit ??= initMidi();
    let alive = true;
    const refresh = (r: { ok: boolean; error?: string }) => {
      if (alive) setStatus({ ok: r.ok, error: r.error, inputs: listMidiInputs() });
    };
    midiInit.then(refresh);
    const off = onMidiDevicesChanged(() => midiInit!.then(refresh));
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => setMidiDeviceFilter(settings.midiDeviceId), [settings.midiDeviceId]);
  return status;
}

export interface PadHit {
  pad: number;
  velocity: number;
  /** Audio-clock seconds, calibration already applied. */
  time: number;
  source: 'midi' | 'pointer' | 'key';
}

/** Keyboard fallback: a 4×4 block of keys laid out like the controller. */
export const KEY_ROWS = ['1234', 'qwer', 'asdf', 'zxcv'];
export const KEY_TO_PAD: Record<string, number> = Object.fromEntries(
  KEY_ROWS.flatMap((row, r) => [...row].map((k, c) => [k, r * 4 + c])),
);
export const PAD_TO_KEY: string[] = KEY_ROWS.flatMap((row) => [...row.toUpperCase()]);

/** True if the key event should be left to a focused form control. */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}

/**
 * Pad hits from the controller (via the note map), the keyboard, or pressing
 * the on-screen pads. All three carry a performance.now() timestamp, so they
 * are graded the same way. The handler ref is updated every render so callers
 * can pass a fresh closure without re-subscribing.
 */
export function usePadInput(
  onHit: (hit: PadHit) => void,
  onUnmappedNote?: (hit: MidiHit) => void,
): (pad: number, perfTime?: number) => void {
  const ref = useRef({ onHit, onUnmappedNote });
  ref.current = { onHit, onUnmappedNote };

  const emit = useCallback((pad: number, velocity: number, perfTime: number, source: PadHit['source']) => {
    const { calibrationMs } = getState().settings;
    const time = perfToAudioTime(perfTime) - calibrationMs / 1000;
    ref.current.onHit({ pad, velocity, time, source });
  }, []);

  useEffect(() => {
    return onMidiHit((m) => {
      const pad = getState().settings.noteMap[m.note];
      if (pad === undefined) ref.current.onUnmappedNote?.(m);
      else emit(pad, m.velocity, m.perfTime, 'midi');
    });
  }, [emit]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e)) return;
      const pad = KEY_TO_PAD[e.key.toLowerCase()];
      if (pad === undefined) return;
      e.preventDefault();
      emit(pad, 100, e.timeStamp, 'key');
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [emit]);

  return useCallback((pad: number, perfTime = performance.now()) => emit(pad, 100, perfTime, 'pointer'), [emit]);
}

// ── Kit buffers ──────────────────────────────────────────────────────────────

export function useLoadedKit(kit: Kit): LoadedKit | null {
  const [loaded, setLoaded] = useState<LoadedKit | null>(null);
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    loadKit(kit, defaultKit()).then((k) => alive && setLoaded(k));
    return () => {
      alive = false;
    };
  }, [kit]);
  return loaded;
}

export function auditionPad(loaded: LoadedKit | null, pad: number, velocity = 100): void {
  const buf = loaded?.buffers[pad];
  if (!buf) return;
  resumeAudio().then(() => playBuffer(buf, getAudioContext().currentTime, velocityGain(velocity) * (loaded!.gains[pad] ?? 1)));
}

// ── Pad flash ────────────────────────────────────────────────────────────────

export function useFlash(ms = 110): [Set<number>, (pad: number) => void] {
  const [pads, setPads] = useState<Set<number>>(() => new Set());
  const flash = useCallback(
    (pad: number) => {
      setPads((p) => new Set(p).add(pad));
      window.setTimeout(
        () =>
          setPads((p) => {
            const n = new Set(p);
            n.delete(pad);
            return n;
          }),
        ms,
      );
    },
    [ms],
  );
  return [pads, flash];
}
