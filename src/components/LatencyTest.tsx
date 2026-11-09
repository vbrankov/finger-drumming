import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioContext, perfToAudioTime, playBuffer, resumeAudio } from '../engine/audio';
import { onMidiHit } from '../engine/midi';
import {
  mad,
  measureOutputPath,
  median,
  noiseFloor,
  openProbe,
  pairTapAndSound,
  testBurst,
  thresholdFor,
} from '../engine/latency';
import type { OutputResult, Probe } from '../engine/latency';
import { isTypingTarget, KEY_TO_PAD } from '../hooks';

const TAPS = 8;

interface TapResult {
  endToEndMs: number | null;
  spreadMs: number;
  heard: number;
  attempted: number;
}

/**
 * Measures what the ear actually waits for, instead of believing what the
 * browser reports. See src/engine/latency.ts for how the two tests work.
 */
export default function LatencyTest({ reportedMs }: { reportedMs: number | null }) {
  const probeRef = useRef<Probe | null>(null);
  const [phase, setPhase] = useState<'idle' | 'opening' | 'listening' | 'playing' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [out, setOut] = useState<OutputResult | null>(null);
  const [floor, setFloor] = useState<number | null>(null);

  const [tapPhase, setTapPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const taps = useRef<{ midi: number; sched: number }[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const [tapResult, setTapResult] = useState<TapResult | null>(null);

  const close = useCallback(() => {
    probeRef.current?.close();
    probeRef.current = null;
  }, []);
  useEffect(() => close, [close]);

  async function run() {
    setError(null);
    setOut(null);
    setTapResult(null);
    setTapPhase('idle');
    try {
      setPhase('opening');
      await resumeAudio();
      close();
      const probe = await openProbe();
      probeRef.current = probe;

      setPhase('listening');
      const f = await noiseFloor(probe, 600);
      setFloor(f);
      probe.setThreshold(thresholdFor(f));

      setPhase('playing');
      setProgress(0);
      const r = await measureOutputPath(probe, 8, (done, total) => setProgress(done / total));
      setOut(r);
      setPhase('ready');
      if (!r) setError('The microphone never heard the test bursts. Turn the speakers up a little, and take your headphones off: the mic has to hear what comes out.');
    } catch (e) {
      close();
      setPhase('error');
      const err = e as DOMException;
      setError(
        err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError'
          ? 'There is no microphone on this machine, so there is nothing to listen with. The reported figure above is all this browser will tell us.'
          : err?.name === 'NotAllowedError'
            ? 'The browser would not hand over the microphone. Allow it for this page and try again — nothing is recorded or kept, the app only looks for the moment a sound starts.'
            : err?.message || 'The microphone could not be opened.',
      );
    }
  }

  const finishTaps = useCallback(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const got: number[] = [];
    for (const t of taps.current) {
      const p = pairTapAndSound(probe.onsets, t.midi);
      if (p.endToEndMs !== null) got.push(p.endToEndMs);
    }
    setTapResult({
      endToEndMs: got.length >= 3 ? median(got) : null,
      spreadMs: got.length >= 3 ? mad(got) : 0,
      heard: got.length,
      attempted: taps.current.length,
    });
    setTapPhase('done');
  }, []);

  function startTaps() {
    const probe = probeRef.current;
    if (!probe) return;
    probe.onsets.length = 0;
    // A finger on a pad is quieter than the burst, so listen closer in.
    probe.setThreshold(Math.max(0.02, (floor ?? 0.01) * 3));
    taps.current = [];
    setTapCount(0);
    setTapResult(null);
    setTapPhase('running');
  }

  useEffect(() => {
    if (tapPhase !== 'running') return;
    const ctx = getAudioContext();
    const burst = testBurst(ctx);
    let done = false;
    const take = (perfTime: number) => {
      if (done) return;
      const sched = ctx.currentTime;
      playBuffer(burst, sched);
      taps.current.push({ midi: perfToAudioTime(perfTime), sched });
      setTapCount(taps.current.length);
      if (taps.current.length >= TAPS) {
        done = true;
        window.setTimeout(finishTaps, 600);
      }
    };
    const off = onMidiHit((m) => take(m.perfTime));
    const key = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e)) return;
      if (KEY_TO_PAD[e.key.toLowerCase()] !== undefined) take(e.timeStamp);
    };
    window.addEventListener('keydown', key);
    return () => {
      off();
      window.removeEventListener('keydown', key);
    };
  }, [tapPhase, finishTaps]);

  const busy = phase === 'opening' || phase === 'listening' || phase === 'playing';

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 8 }}>
        <button onClick={run} disabled={busy}>
          {busy ? 'Measuring…' : out ? 'Measure again' : 'Measure latency'}
        </button>
        <span className="muted small">
          {phase === 'opening' && 'Opening the microphone…'}
          {phase === 'listening' && 'Listening to the room…'}
          {phase === 'playing' && 'Playing test clicks… ' + Math.round(progress * 100) + '%'}
          {phase === 'idle' && 'Needs the microphone and the speakers, not headphones.'}
        </span>
      </div>

      {error && <p className="small" style={{ margin: 0, color: 'var(--bad, #c33)' }}>{error}</p>}

      {out && (
        <table className="list" style={{ maxWidth: 520 }}>
          <tbody>
            <tr>
              <td>Speaker to microphone</td>
              <td>
                <b>{Math.round(out.roundTripMs)} ms</b>
                {out.spreadMs >= 1 && <span className="muted small"> ± {Math.round(out.spreadMs)}</span>}
              </td>
            </tr>
            <tr>
              <td className="muted">less the microphone's own path</td>
              <td className="muted">
                {probeRef.current?.reportedInputMs == null ? 'not reported' : Math.round(probeRef.current.reportedInputMs) + ' ms'}
              </td>
            </tr>
            <tr>
              <td>
                <b>Output latency</b>
                <div className="muted small">from scheduling a drum to hearing it</div>
              </td>
              <td>
                <b>{out.outputMs === null ? '≤ ' + Math.round(out.roundTripMs) : '≈ ' + Math.round(out.outputMs)} ms</b>
              </td>
            </tr>
            <tr>
              <td className="muted">what the browser claims</td>
              <td className="muted">{reportedMs === null ? 'nothing' : reportedMs + ' ms'}</td>
            </tr>
          </tbody>
        </table>
      )}

      {out && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 8 }}>
            <button onClick={startTaps} disabled={tapPhase === 'running'}>
              {tapPhase === 'running' ? 'Tap ' + (TAPS - tapCount) + ' more…' : 'Measure finger to sound'}
            </button>
            {tapPhase === 'running' && (
              <span className="muted small">Tap one pad firmly, about one tap a second. The mic listens for your finger and for the drum.</span>
            )}
            {tapPhase === 'idle' && <span className="muted small">The honest number: no reported figure is trusted.</span>}
          </div>
          {tapResult && (
            <p className="small" style={{ margin: 0 }}>
              {tapResult.endToEndMs === null ? (
                <>
                  Heard {tapResult.heard} of {tapResult.attempted} taps clearly — not enough to call it. The microphone has to hear both
                  your finger on the pad and the drum; try tapping harder, or move the mic nearer the controller.
                </>
              ) : (
                <>
                  <b>{Math.round(tapResult.endToEndMs)} ms</b> from your finger to the sound
                  {tapResult.spreadMs >= 1 && <span className="muted"> ± {Math.round(tapResult.spreadMs)}</span>} (
                  {tapResult.heard} of {tapResult.attempted} taps). That is the whole chain: the pad, its MIDI, this app, and the audio
                  out.
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
