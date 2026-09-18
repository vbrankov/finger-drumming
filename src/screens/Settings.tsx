import { useEffect, useRef, useState } from 'react';
import PadGrid from '../components/PadGrid';
import { perfToAudioTime, resumeAudio } from '../engine/audio';
import { estimateCalibrationMs, robustMean } from '../engine/calibration';
import { onMidiHit } from '../engine/midi';
import { PatternPlayer } from '../engine/player';
import { isTypingTarget, KEY_TO_PAD, useFlash, useMidiStatus } from '../hooks';
import { standardNoteMap } from '../model/types';
import ImportDialog from '../components/ImportDialog';
import { applyImport, describeOutcome, payloadsFromText, planImport } from '../share';
import type { ImportPlan, Resolution } from '../share';
import { defaultKit, exportJson, importJson, updateSettings, useStore } from '../store';
import { AI_URL, FORMAT_URL } from '../links';

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
  const calPlayer = useRef<PatternPlayer | null>(null);
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
      const p = new PatternPlayer({ hits: [], bpm: CAL_BPM, steps: 16, kit: { buffers: [], gains: [], rates: [] }, playSong: false, metronome: true, countInBars: 0 });
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

  // ── Velocity calibration: soft hits, then hard hits ───────────────────
  const VEL_TAPS = 8;
  const [velPhase, setVelPhase] = useState<'idle' | 'soft' | 'hard'>('idle');
  const velSoft = useRef<number[]>([]);
  const velHard = useRef<number[]>([]);
  const [velCount, setVelCount] = useState(0);
  const [velResult, setVelResult] = useState<{ ghost: number; accent: number; soft: number; hard: number } | null>(null);

  useEffect(() => {
    if (velPhase === 'idle') return;
    return onMidiHit((m) => {
      const list = velPhase === 'soft' ? velSoft.current : velHard.current;
      list.push(m.velocity);
      setVelCount(list.length);
      if (list.length < VEL_TAPS) return;
      if (velPhase === 'soft') {
        setVelPhase('hard');
        setVelCount(0);
        return;
      }
      const soft = robustMean(velSoft.current);
      const hard = robustMean(velHard.current);
      // Ghost/accent thresholds sit a third and two thirds of the way between your soft and hard hits.
      const ghost = Math.round(soft + (hard - soft) / 3);
      const accent = Math.round(soft + ((hard - soft) * 2) / 3);
      setVelResult({ ghost, accent, soft: Math.round(soft), hard: Math.round(hard) });
      setVelPhase('idle');
    });
  }, [velPhase]);

  function velStart() {
    velSoft.current = [];
    velHard.current = [];
    setVelCount(0);
    setVelResult(null);
    setVelPhase('soft');
  }

  // ── Paste import: pack tokens and share links ───────────────────────────
  const [pasted, setPasted] = useState('');
  const [pasteResult, setPasteResult] = useState<string | null>(null);
  const [pastePlan, setPastePlan] = useState<ImportPlan | null>(null);
  function finishPaste(plan: ImportPlan, res: Record<string, Resolution>) {
    const outcome = applyImport(plan, res);
    setPasteResult(describeOutcome(outcome, plan));
    if (outcome.patterns || outcome.kits || outcome.replaced) setPasted('');
  }
  async function doPasteImport() {
    const { payloads, unreadable, newerVersion } = await payloadsFromText(pasted);
    const plan = { ...planImport(payloads), unreadable, newerVersion };
    if (plan.conflicts.length) setPastePlan(plan);
    else finishPaste(plan, {});
  }

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
        alert('Imported ' + r.patterns + ' patterns and ' + r.kits + ' kits.');
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
              {learning !== null
                ? 'Hit the controller pad you want for pad ' + (learning + 1) + '…'
                : 'The standard 4×4 mapping (bottom-left = note 36, up to 51 top-right) is preset. If your controller differs: click a pad, then hit it on the controller.'}
            </p>
            <p className="muted small" style={{ margin: 0 }}>Last: {lastNote ?? '—'}</p>
            <div className="row">
              <button onClick={() => updateSettings({ noteMap: standardNoteMap() })}>Reset to standard (36–51)</button>
              <button onClick={() => confirm('Clear all pad mappings?') && updateSettings({ noteMap: {} })}>Clear</button>
            </div>
          </div>
        </div>
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Calibration</h3>
        <p className="muted small" style={{ margin: 0, maxWidth: 600 }}>
          Compensates for controller and audio output latency. Start, then tap any pad on every click for {CAL_BARS} bars at {CAL_BPM} bpm. A robust mean of the offsets becomes the calibration.
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
        <h3 style={{ margin: 0 }}>Dynamics</h3>
        <p className="muted small" style={{ margin: 0, maxWidth: 600 }}>
          Patterns mark hits as ghost, normal or accent. Teach the app what soft and hard mean on your controller: hit any pad {VEL_TAPS} times softly, then {VEL_TAPS}{' '}
          times hard. Keyboard and on-screen pads have no velocity and always count as normal.
        </p>
        <div className="row">
          {velPhase === 'idle' ? (
            <button className="primary" onClick={velStart} disabled={!midi.ok}>
              {'\u25b6'} Calibrate dynamics
            </button>
          ) : (
            <>
              <span className="tap-target" style={{ cursor: 'default' }}>
                {velPhase === 'soft' ? 'hit SOFTLY' : 'hit HARD'} {'\u00b7'} {velCount}/{VEL_TAPS}
              </span>
              <button onClick={() => setVelPhase('idle')}>Cancel</button>
            </>
          )}
          {velResult && (
            <>
              <span>
                soft {'\u2248'} {velResult.soft}, hard {'\u2248'} {velResult.hard} {'\u2192'} ghost below <b>{velResult.ghost}</b>, accent from <b>{velResult.accent}</b>
              </span>
              <button className="primary" onClick={() => updateSettings({ velocityThresholds: { ghost: velResult.ghost, accent: velResult.accent } })}>
                Use this
              </button>
            </>
          )}
          <label className="field">
            Ghost below
            <input
              type="number"
              min={1}
              max={126}
              value={settings.velocityThresholds.ghost}
              onChange={(e) => updateSettings({ velocityThresholds: { ...settings.velocityThresholds, ghost: Number(e.target.value) || 1 } })}
            />
          </label>
          <label className="field">
            Accent from
            <input
              type="number"
              min={2}
              max={127}
              value={settings.velocityThresholds.accent}
              onChange={(e) => updateSettings({ velocityThresholds: { ...settings.velocityThresholds, accent: Number(e.target.value) || 127 } })}
            />
          </label>
        </div>
      </div>

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>Data</h3>
        <div className="row">
          <button onClick={doExport}>Export patterns, kits &amp; scores</button>
          <button onClick={doImport}>Import…</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Uploaded samples are not exported; imported kits fall back to bundled sounds for those slots.</p>
        <h4 style={{ margin: '8px 0 0' }}>Paste patterns or kits</h4>
        <p className="muted small" style={{ margin: 0, maxWidth: 600 }}>
          Paste text copied from the Patterns list (starts with <code>fd1:</code>) or share links. Anything around them is ignored, so a whole forum post works.{' '}
          <a href={FORMAT_URL} target="_blank" rel="noreferrer">
            Format reference
          </a>{' '}
          {'\u00b7'}{' '}
          <a href={AI_URL} target="_blank" rel="noreferrer">
            Making patterns with AI
          </a>
        </p>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={4}
          placeholder="fd1:… or https://…/#s=…"
          style={{ width: '100%', maxWidth: 600, fontFamily: 'monospace', fontSize: 12 }}
        />
        <div className="row">
          <button className="primary" onClick={doPasteImport} disabled={!pasted.trim()}>
            Import pasted
          </button>
          {pasteResult && <span className="small">{pasteResult}</span>}
        </div>
        {pastePlan && (
          <ImportDialog
            conflicts={pastePlan.conflicts.map((c) => c.conflict)}
            onCancel={() => setPastePlan(null)}
            onDone={(res) => {
              const plan = pastePlan;
              setPastePlan(null);
              finishPaste(plan, res);
            }}
          />
        )}
      </div>
    </div>
  );
}
