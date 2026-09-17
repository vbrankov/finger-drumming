import { useEffect, useMemo, useRef, useState } from 'react';
import PadGrid from '../components/PadGrid';
import StepGrid from '../components/StepGrid';
import type { CellState } from '../components/StepGrid';
import { getAudioContext, playBuffer, resumeAudio, velocityGain } from '../engine/audio';
import { SongPlayer } from '../engine/player';
import type { HitResult, PassResult } from '../model/grading';
import { PracticeSession } from '../model/session';
import { matchWindow } from '../model/timing';
import { padGroupOf, STEPS } from '../model/types';
import type { Song } from '../model/types';
import { auditionPad, useFlash, useLoadedKit, usePadInput } from '../hooks';
import { kitFor, recordScore, useStore } from '../store';

type Mode = 'playalong' | 'solo';

interface Props {
  song: Song;
  onBack: () => void;
}

export default function Practice({ song, onBack }: Props) {
  const { scores } = useStore();
  const kit = useMemo(() => kitFor(song), [song]);
  const loaded = useLoadedKit(kit);

  const [mode, setMode] = useState<Mode>('playalong');
  const [bpm, setBpm] = useState(song.bpm);
  const [metronome, setMetronome] = useState(true);
  const [running, setRunning] = useState(false);
  const [position, setPosition] = useState<number | null>(null); // fractional global step
  const [lastPass, setLastPass] = useState<PassResult | null>(null);
  const [passCount, setPassCount] = useState(0);
  const [flashPads, flash] = useFlash();

  const player = useRef<SongPlayer | null>(null);
  const session = useRef<PracticeSession | null>(null);

  const best = scores[song.id];
  const win = matchWindow(bpm);

  const clickPad = usePadInput((hit) => {
    flash(hit.pad);
    if (loaded?.buffers[hit.pad]) {
      playBuffer(loaded.buffers[hit.pad]!, getAudioContext().currentTime, velocityGain(hit.velocity) * (loaded.gains[hit.pad] ?? 1));
    }
    session.current?.addHit(hit);
  });

  function start() {
    if (!loaded) return;
    resumeAudio().then(() => {
      const p = new SongPlayer({
        hits: song.hits,
        bpm,
        kit: loaded,
        playSong: mode === 'playalong',
        metronome,
        countInBars: 1,
      });
      const songStart = p.start();
      player.current = p;
      session.current = new PracticeSession(song.hits, bpm, songStart, padGroupOf(kit));
      setLastPass(null);
      setPassCount(0);
      setRunning(true);
    });
  }

  function stop() {
    player.current?.stop();
    player.current = null;
    session.current = null;
    setRunning(false);
    setPosition(null);
  }

  useEffect(() => stop, []);
  // Any change to the setup stops the run; restart to apply.
  useEffect(() => {
    if (running) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, bpm, metronome, loaded]);

  // Pass collection on an interval (keeps grading while the tab is hidden);
  // playhead on rAF. Both read the audio clock.
  useEffect(() => {
    if (!running) return;
    const collect = () => {
      const s = session.current;
      if (!s) return;
      for (const { result } of s.collect(getAudioContext().currentTime)) {
        setLastPass(result);
        setPassCount((n) => n + 1);
        recordScore(song, bpm, result.score);
      }
    };
    const timer = window.setInterval(collect, 50);
    let raf = 0;
    const tick = () => {
      const p = player.current;
      if (p) setPosition(p.positionAt(getAudioContext().currentTime));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(raf);
    };
  }, [running, song, bpm]);

  const resultMap = useMemo(() => {
    const m = new Map<string, HitResult>();
    for (const r of lastPass?.results ?? []) {
      const key = r.pad + ':' + r.step;
      // A hit/miss on the expected cell wins over an extra landing on the same cell.
      if (!m.has(key) || r.kind !== 'extra') m.set(key, r);
    }
    return m;
  }, [lastPass]);

  const expectedSet = useMemo(() => new Set(song.hits.map((h) => h.pad + ':' + h.step)), [song]);

  const cell = (pad: number, step: number): CellState => {
    const key = pad + ':' + step;
    const on = expectedSet.has(key);
    const r = resultMap.get(key);
    if (!r) return { on };
    if (r.kind === 'miss') return { on, className: 'miss', content: '✕', title: 'Missed' };
    if (r.kind === 'extra') return { on, className: 'extra', content: '+', title: 'Extra hit' };
    const ms = Math.round(r.offsetMs);
    return {
      on,
      className: 'graded',
      content: <span style={{ color: offsetColor(r.errorMs, win * 1000) }}>{ms > 0 ? '+' + ms : ms}</span>,
      title: (ms > 0 ? 'Late ' : 'Early ') + Math.abs(ms) + ' ms',
    };
  };

  const playheadStep = position === null || position < 0 ? null : Math.floor(position) % STEPS;
  const countIn = position !== null && position < 0 ? Math.ceil(-position / 4) : null;

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <button onClick={onBack}>← Songs</button>
          <h2 style={{ margin: 0 }}>{song.name}</h2>
          <span className="muted small">
            {song.author ? 'by ' + song.author + ' · ' : ''}
            {song.difficulty ? 'difficulty ' + song.difficulty + '/5 · ' : ''}
            kit: {kit.name}
          </span>
        </div>
        <div className="row">
          <button className={mode === 'playalong' ? 'active' : ''} onClick={() => setMode('playalong')}>
            Play-along
          </button>
          <button className={mode === 'solo' ? 'active' : ''} onClick={() => setMode('solo')}>
            Solo
          </button>
          <button className={metronome ? 'active' : ''} onClick={() => setMetronome((m) => !m)}>
            Click
          </button>
          <label className="field">
            Tempo
            <button onClick={() => setBpm((b) => Math.max(20, b - 5))}>−</button>
            <input type="number" value={bpm} min={20} max={300} onChange={(e) => setBpm(Number(e.target.value) || song.bpm)} />
            <button onClick={() => setBpm((b) => Math.min(300, b + 5))}>+</button>
            {bpm !== song.bpm && <button onClick={() => setBpm(song.bpm)}>reset</button>}
          </label>
          {running ? (
            <button className="primary" onClick={stop}>
              ■ Stop
            </button>
          ) : (
            <button className="primary" onClick={start} disabled={!loaded}>
              ▶ Start
            </button>
          )}
        </div>
      </div>

      <div className="row between panel">
        <div className="stats">
          <div className="stat">
            <div className="v">{lastPass ? Math.round(lastPass.score) : '—'}</div>
            <div className="k">last pass</div>
          </div>
          <div className="stat">
            <div className="v">{best ? Math.round(best.best) : '—'}</div>
            <div className="k">best{bpm !== song.bpm ? ' (at ' + song.bpm + ' bpm; not saved at ' + bpm + ')' : ''}</div>
          </div>
          <div className="stat">
            <div className="v">{passCount}</div>
            <div className="k">passes</div>
          </div>
          <div className="stat">
            <div className="v">±{Math.round(win * 1000)}</div>
            <div className="k">window ms</div>
          </div>
        </div>
        <div className="countin">{countIn !== null ? countIn : running ? '' : loaded ? 'ready' : 'loading…'}</div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <StepGrid kit={kit} cell={cell} playheadStep={playheadStep} flashPads={flashPads} onLabelClick={(pad) => auditionPad(loaded, pad)} />
        </div>
        <div className="stack">
          <PadGrid kit={kit} flashPads={flashPads} onPadClick={clickPad} showKeys />
          <p className="muted small" style={{ margin: 0, width: 260 }}>
            No controller? Play with the keyboard (keys shown on the pads) or tap the pads on screen.
          </p>
        </div>
      </div>
      <p className="muted small">
        Score = sum of the 3 worst errors in a pass. Miss or extra hit = 1000. Best is only recorded at the song&apos;s own tempo ({song.bpm} bpm).
      </p>
    </div>
  );
}

/** Green at 0, amber around a third of the window, red at the window edge. */
function offsetColor(errorMs: number, windowMs: number): string {
  const t = Math.min(1, errorMs / windowMs);
  const hue = 120 * (1 - t);
  return 'hsl(' + hue + ' 80% 60%)';
}
