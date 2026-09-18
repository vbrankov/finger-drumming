import { useEffect, useRef, useState } from 'react';
import PadGrid from '../components/PadGrid';
import { perfToAudioTime, resumeAudio } from '../engine/audio';
import { estimateCalibrationMs } from '../engine/calibration';
import { onMidiHit } from '../engine/midi';
import { SongPlayer } from '../engine/player';
import { isTypingTarget, KEY_TO_PAD, useFlash, useMidiStatus } from '../hooks';
import { defaultKit, exportJson, importJson, updateSettings, useStore } from '../store';

const CAL_BPM = 100;
const CAL_BARS = 8;

export default function Settings() {
  const { settings } = useStore();
  const midi = useMidiStatus();
  const [learning, setLearning] = useState<number | null>(null);
  const [lastNote, setLastNote] = useState<string | null>(null);
  const [flashPads, flash] = useFlash();

  // Notes per pad, for display.
  const notes: Record<number, number | undefined> = {};
  for (const [note, pad] of Object.entries(settings.noteMap)) notes[pad] = Number(note);

  // MIDI learn + last-note monitor.
  useEffect(() => {
    return onMidiHit((m) => {
      setLastNote('note ' + m.note + ' vel ' + m.velocity + ' from ' + m.deviceName);
      if (learning !== null) {
        const noteMap = { ...settings.noteMap };
        for (const [n, p] of Object.entries(noteMap)) if (p === learning) delete noteMap[Number(n)];
        noteMap[m.note] = learning;
        updateSettings({ noteMap });
        flash(learning);
        setLearning(null);
      } else {
        const pad = settings.noteMap[m.note];
        if (pad !== undefined) flash(pad);
      }
    });
  }, [learning, settings.noteMap, flash]);

  // ── Calibration ────────────────────────────────────────────────────────
  const [calRunning, setCalRunning] = useState(false);
  const [calTaps, setCalTaps] = useState(0);
  const [calResult, setCalResult] = useState<number | null>(null);
  const calPlayer = useRef<SongPlayer | null>(null);
  const calTapsRef = useRef<number[]>([]);

  function calStop() {
    const p = calPlayer.current;
    calPlayer.current?.stop();
    calPlayer.current = null;
    setCalRunning(false);
    if (p) setCalResult(estimateCalibrationMs(calTapsRef.current, p.songStart, CAL_BPM));
  }

  function calStart() {
    resumeAudio().then(() => {
      calTapsRef.current = [];
      setCalTaps(0);
      setCalResult(null);
      const p = new SongPlayer({ hits: [], bpm: CAL_BPM, steps: 16, kit: { buffers: [], gains: [] }, playSong: false, metronome: true, countInBars: 0 });
      p.start();
      calPlayer.current = p;
      setCalRunning(true);
      window.setTimeout(calStop, ((60 / CAL_BPM) * 4 * CAL_BARS + 0.3) * 1000);
    });
  }

  // Any MIDI note (mapped or not), pad key, or tap on the target counts while calibrating.
  const tap = (perfTime: number) => {
    if (!calPlayer.current) return;
    calTapsRef.current.push(perfToAudioTime(perfTime));
    setCalTaps(calTapsRef.current.length);
  };
  useEffect(() => {
    if (!calRunning) return;
    const off = onMidiHit((m) => tap(m.perfTime));
    const key = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e)) return;
      if (KEY_TO_PAD[e.key.toLowerCase()] !== undefined) tap(e.timeStamp);
    };
    window.addEventListener('keydown', key);
    return () => {
      off();
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calRunning]);
  useEffect(() => () => calPlayer.current?.stop(), []);

  // ── Export / import ────────────────────────────────────────────────────
  function doExport() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'finger-drumming-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const r = importJson(await f.text());
        alert('Imported ' + r.songs + ' songs and ' + r.kits + ' kits.');
      } catch (e) {
        alert('Import failed: ' + (e as Error).message);
      }
    };
    input.click();
  }

  return (
    <div className="stack">
      <h2 style={{ margin: 0 }}>Settings</h2>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>MIDI</h3>
        {!midi.ok && <p className="muted">{midi.error ?? 'Waiting for MIDI access…'}</p>}
        <label className="field">
          Input device
          <select value={settings.midiDeviceId ?? ''} onChange={(e) => updateSettings({ midiDeviceId: e.target.value || null })}>
            <option value="">All devices</option>
            {midi.inputs.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <PadGrid kit={defaultKit()} notes={notes} flashPads={flashPads} learningPad={learning} onPadClick={(p) => setLearning(learning === p ? null : p)} />
          <div className="stack">
            <p className="muted small" style={{ margin: 0, maxWidth: 360 }}>
              {learning !== null ? 'Hit the controller pad you want for pad ' + (learning + 1) + '…' : 'Click a pad, then hit it on the controller to map it. The map is about your controller, so it applies to every kit.'}
            </p>
            <p className="muted small" style={{ margin: 0 }}>Last: {lastNote ?? '—'}</p>
            <button onClick={() => confirm('Clear all pad mappings?') && updateSettings({ noteMap: {} })}>Clear mapping</button>
          </div>
        </div>
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Calibration</h3>
        <p className="muted small" style={{ margin: 0, maxWidth: 600 }}>
          Compensates for controller and audio output latency. Start, then tap any pad on every click for {CAL_BARS} bars at {CAL_BPM} bpm. The median offset becomes the calibration.
        </p>
        <div className="row">
          {calRunning ? <button onClick={calStop}>■ Stop</button> : <button className="primary" onClick={calStart}>▶ Start calibration</button>}
          {calRunning && (
            <div className="tap-target" onPointerDown={(e) => { e.preventDefault(); tap(e.timeStamp); }}>
              tap here · {calTaps}
            </div>
          )}
          {calResult !== null && !calRunning && (
            <>
              <span>
                Measured: <b>{calResult.toFixed(1)} ms</b>
              </span>
              <button className="primary" onClick={() => updateSettings({ calibrationMs: Math.round(calResult * 10) / 10 })}>
                Use this
              </button>
            </>
          )}
          {calResult === null && !calRunning && calTaps > 0 && <span className="muted small">Not enough taps.</span>}
          <label className="field">
            Current
            <input type="number" step={0.5} value={settings.calibrationMs} onChange={(e) => updateSettings({ calibrationMs: Number(e.target.value) || 0 })} />
            ms
          </label>
        </div>
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Data</h3>
        <div className="row">
          <button onClick={doExport}>Export songs, kits &amp; scores</button>
          <button onClick={doImport}>Import…</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Uploaded samples are not exported; imported kits fall back to bundled sounds for those slots.</p>
      </div>
    </div>
  );
}
