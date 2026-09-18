import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import PadGrid from '../components/PadGrid';
import StepGrid from '../components/StepGrid';
import type { CellState } from '../components/StepGrid';
import { getAudioContext, resumeAudio } from '../engine/audio';
import { playSlot, SongPlayer } from '../engine/player';
import type { PassResult } from '../model/grading';
import { PracticeSession } from '../model/session';
import type { LiveResult } from '../model/session';
import { matchWindow } from '../model/timing';
import { LEVEL_GLYPH, levelOfHit, levelOfVelocity, padGroupOf, songBars, songSteps } from '../model/types';
import type { Song } from '../model/types';
import { auditionPad, useFlash, useLoadedKit, usePadInput } from '../hooks';
import { kitFor, recordScore, useStore } from '../store';

type Mode = 'playalong' | 'solo';

interface Props {
  song: Song;
  onBack: () => void;
}

export default function Practice({ song, onBack }: Props) {
  const { scores, settings } = useStore();
  const kit = useMemo(() => kitFor(song), [song]);
  const loaded = useLoadedKit(kit);

  const [mode, setMode] = useState<Mode>('playalong');
  const [bpm, setBpm] = useState(song.bpm);
  const [metronome, setMetronome] = useState(true);
  const [running, setRunning] = useState(false);
  const [position, setPosition] = useState<number | null>(null); // fractional global step
  const [lastPass, setLastPass] = useState<PassResult | null>(null);
  const [passCount, setPassCount] = useState(0);
  // Latest live verdict per cell, kept across passes so the previous pass stays visible (dimmed).
  const [cells, setCells] = useState<Map<string, LiveResult>>(() => new Map());
  const [currentPass, setCurrentPass] = useState(0);
  const [flashPads, flash] = useFlash();

  const player = useRef<SongPlayer | null>(null);
  const session = useRef<PracticeSession | null>(null);

  // ── Split between grid and pads: a draggable handle sets the row height; the
  // pads take whatever height is left. Remembered per browser.
  const SPLIT_KEY = 'fd.practice.cellH';
  const autoCellH = () => Math.min(30, Math.max(13, (window.innerHeight - 500) / 17));
  const [cellH, setCellH] = useState<number>(() => {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return v >= 8 && v <= 48 ? v : autoCellH();
  });
  const padsRef = useRef<HTMLDivElement>(null);
  const [padsWidth, setPadsWidth] = useState<number | undefined>(undefined);

  function onHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = cellH;
    const move = (ev: PointerEvent) => setCellH(Math.min(48, Math.max(8, startH + (ev.clientY - startY) / 17)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setCellH((h) => {
        localStorage.setItem(SPLIT_KEY, String(h));
        return h;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function resetSplit() {
    localStorage.removeItem(SPLIT_KEY);
    setCellH(autoCellH());
  }

  // Size the pad grid to the space below the handle: 4 rows of 2:1 pads → width ≈ 2 × height.
  useLayoutEffect(() => {
    const fit = () => {
      const el = padsRef.current;
      if (!el) return;
      const avail = window.innerHeight - el.getBoundingClientRect().top - 40;
      const byHeight = (avail - 3 * 6) * 2 + 3 * 6;
      setPadsWidth(Math.max(240, Math.min(el.clientWidth, 720, byHeight)));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [cellH, kit, running]);

  const best = scores[song.id];
  const win = matchWindow(bpm);
  const steps = songSteps(song);
  const bars = songBars(song);

  function showLive(results: LiveResult[]) {
    if (!results.length) return;
    setCells((prev) => {
      const next = new Map(prev);
      for (const r of results) {
        const key = r.pad + ':' + r.step;
        const cur = next.get(key);
        // An expected cell's own verdict (hit/miss) beats an extra landing on it.
        if (!cur || cur.passIndex < r.passIndex || r.kind !== 'extra') next.set(key, r);
      }
      return next;
    });
  }

  const clickPad = usePadInput((hit) => {
    flash(hit.pad);
    if (loaded) playSlot(loaded, hit.pad, hit.velocity, getAudioContext().currentTime);
    // Only a controller reports real velocity; keyboard and touch hits carry none, so no dynamics mark for them.
    const r = session.current?.addHit({ pad: hit.pad, time: hit.time, velocity: hit.source === 'midi' ? hit.velocity : undefined });
    if (r) showLive([r]);
  });

  function start() {
    if (!loaded) return;
    resumeAudio().then(() => {
      const p = new SongPlayer({
        hits: song.hits,
        bpm,
        steps,
        kit: loaded,
        playSong: mode === 'playalong',
        metronome,
        countInBars: 1,
      });
      const songStart = p.start();
      player.current = p;
      session.current = new PracticeSession(song.hits, bpm, songStart, steps, padGroupOf(kit));
      setLastPass(null);
      setPassCount(0);
      setCells(new Map());
      setCurrentPass(0);
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
      const p = player.current;
      if (!s || !p) return;
      const now = getAudioContext().currentTime;
      const { passes, live } = s.collect(now);
      showLive(live);
      for (const { result } of passes) {
        setLastPass(result);
        setPassCount((n) => n + 1);
        recordScore(song, bpm, result.score);
      }
      // The sweep clears the previous pass behind the playhead; cells ahead of it stay (dimmed).
      const pos = p.positionAt(now);
      const pass = Math.max(0, Math.floor(pos / steps));
      const step = pos < 0 ? -1 : Math.floor(pos) % steps;
      setCurrentPass(pass);
      setCells((prev) => {
        let next: Map<string, LiveResult> | null = null;
        for (const [key, r] of prev) {
          if (r.passIndex < pass && r.step <= step) {
            next ??= new Map(prev);
            next.delete(key);
          }
        }
        return next ?? prev;
      });
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
  }, [running, song, bpm, steps]);

  const expectedMap = useMemo(() => new Map(song.hits.map((h) => [h.pad + ':' + h.step, h])), [song]);

  const cell = (pad: number, step: number): CellState => {
    const key = pad + ':' + step;
    const exp = expectedMap.get(key);
    const on = !!exp;
    const lvl = exp ? levelOfHit(exp) : undefined;
    const base: CellState = { on, className: lvl ? 'lvl-' + lvl : '', data: lvl ? { lvl } : undefined };
    const r = cells.get(key);
    if (!r) return base;
    const stale = r.passIndex < currentPass ? ' stale' : '';
    if (r.kind === 'miss') return { ...base, className: base.className + ' miss' + stale, content: '✕', title: 'Missed' };
    if (r.kind === 'extra') return { ...base, className: base.className + ' extra' + stale, content: '+', title: 'Extra hit' };
    const ms = Math.round(r.offsetMs);
    const abs = Math.abs(ms);
    // Dynamics: shown, not scored. Keyboard and touch have no velocity and always read as normal.
    const played = r.velocity === undefined ? undefined : levelOfVelocity(r.velocity, settings.velocityThresholds);
    const dyn = played && lvl ? (played === lvl ? 'ok' : 'off') : '';
    return {
      ...base,
      className: base.className + ' graded' + stale,
      style: { background: offsetColor(r.offsetMs, win * 1000) },
      content: ms < 0 ? '◂' + abs : ms > 0 ? abs + '▸' : abs,
      title:
        (ms > 0 ? 'Late (dragging) ' : ms < 0 ? 'Early (rushing) ' : 'On time ') +
        abs +
        ' ms' +
        (played ? ' · played ' + played + (lvl && played !== lvl ? ', expected ' + lvl : '') : ''),
      data: { ...(lvl ? { lvl } : {}), ...(played ? { played: LEVEL_GLYPH[played] || '\u25cf', dyn } : {}) },
    };
  };

  const playheadStep = position === null || position < 0 ? null : Math.floor(position) % steps;
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
            {bars} bar{bars === 1 ? '' : 's'} · kit: {kit.name}
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

      <div className="row between panel stats-bar">
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

      <div className={'practice-grid' + (bars >= 3 ? ' dense' : '')} style={{ ['--cell-h' as string]: cellH + 'px' }}>
        <StepGrid kit={kit} steps={steps} cell={cell} playheadStep={playheadStep} flashPads={flashPads} onLabelClick={(pad) => auditionPad(loaded, pad)} />
      </div>

      <div className="split-handle" onPointerDown={onHandlePointerDown} onDoubleClick={resetSplit} title="Drag to resize; double-click to reset">
        <span />
      </div>

      <div className="pads-below" ref={padsRef}>
        <PadGrid kit={kit} flashPads={flashPads} onPadClick={clickPad} showKeys width={padsWidth} />
        <p className="muted small" style={{ margin: 0 }}>
          No controller? Tap the pads or use the keyboard (keys shown on the pads).
        </p>
      </div>
      <p className="muted small">
        <span className="swatch early" /> {'◂'} early (rushing) &nbsp; <span className="swatch ontime" /> on time &nbsp; <span className="swatch late" /> late (dragging) {'▸'} &nbsp;·&nbsp; {'▲'} accent, {'·'} ghost; the corner mark is the level you played (orange = not the level written). Dynamics are shown, not scored.
        Score = sum of the 3 worst timing errors in a pass; miss or extra = 1000. Best is only recorded at the song&apos;s own tempo ({song.bpm} bpm).
      </p>
    </div>
  );
}

/**
 * Green when on time; leans blue the earlier (rushing) and red the later
 * (dragging) the hit was, reaching full colour at the window edge.
 */
export function offsetColor(offsetMs: number, windowMs: number): string {
  const t = Math.min(1, Math.abs(offsetMs) / windowMs);
  const hue = offsetMs < 0 ? 120 + 100 * t : 120 - 120 * t; // 120 green → 220 blue | → 0 red
  return 'hsl(' + hue + ' ' + (55 + 20 * t) + '% 42%)';
}
