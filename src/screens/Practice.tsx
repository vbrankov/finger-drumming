import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import PadGrid from '../components/PadGrid';
import ScrollGrid from '../components/ScrollGrid';
import StepGrid from '../components/StepGrid';
import type { CellState } from '../components/StepGrid';
import { getAudioContext, resumeAudio } from '../engine/audio';
import { playSlot, PatternPlayer } from '../engine/player';
import { scoreOf } from '../model/grading';
import type { PassResult } from '../model/grading';
import { PracticeSession } from '../model/session';
import type { LiveResult } from '../model/session';
import { layoutSong } from '../model/song';
import type { LaidSection } from '../model/song';
import { makeTimeline, matchWindow } from '../model/timing';
import { LEVEL_GLYPH, STEPS, kitRows, levelOfHit, levelOfVelocity, padGroupOf, padRepOf, patternSteps } from '../model/types';
import type { Hit, Pattern, Song, Swing } from '../model/types';
import { auditionPad, useFlash, useLoadedKit, usePadInput } from '../hooks';
import { DEFAULT_KIT, kitFor, recordScore, recordSongScore, useStore } from '../store';

type Mode = 'playalong' | 'solo';
type LoopMode = 'song' | 'section' | 'section+next';

/** A pattern practised on its own, or a song (a sequence of patterns). */
export type Target = { kind: 'pattern'; pattern: Pattern } | { kind: 'song'; song: Song };

interface Props {
  target: Target;
  onBack: () => void;
  onSettings: () => void;
}

/** One repeat of one pattern on the pass's step axis: what the grid shows at a given moment. */
interface View {
  start: number; // pass-local step
  steps: number;
  pattern: Pattern | null;
  section: number; // index into layout.sections, or -1 for a lone pattern
  repeat: number;
}

export default function Practice({ target, onBack, onSettings }: Props) {
  const { scores, songScores, settings, patterns, kits } = useStore();
  const isSong = target.kind === 'song';
  const song = isSong ? target.song : null;
  const pattern = isSong ? null : target.pattern;
  const kit = useMemo(
    () => (song ? (kits.find((k) => k.id === song.kitId) ?? kits[0] ?? DEFAULT_KIT) : kitFor(pattern!)),
    [song, pattern, kits],
  );
  const loaded = useLoadedKit(kit);
  const defaultBpm = song ? song.bpm : pattern!.bpm;
  const name = song ? song.name : pattern!.name;
  const author = song ? song.author : pattern!.author;
  const difficulty = song ? song.difficulty : pattern!.difficulty;

  const [mode, setMode] = useState<Mode>('playalong');
  const [bpm, setBpm] = useState(defaultBpm);
  const [metronome, setMetronome] = useState(true);
  const [loopMode, setLoopMode] = useState<LoopMode>('song');
  const [loopSection, setLoopSection] = useState(0);
  const [running, setRunning] = useState(false);
  const [position, setPosition] = useState<number | null>(null); // fractional pass-local step
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [sectionScores, setSectionScores] = useState<Map<number, number>>(() => new Map());
  const [passCount, setPassCount] = useState(0);
  // Latest live verdict per cell, kept across passes so the previous pass stays visible (dimmed).
  const [cells, setCells] = useState<Map<string, LiveResult>>(() => new Map());
  const [currentPass, setCurrentPass] = useState(0);
  const [flashPads, flash] = useFlash();
  // A controller note that is not mapped to any pad: the app would otherwise just stay silent.
  const [unmapped, setUnmapped] = useState<{ note: number; device: string } | null>(null);

  const player = useRef<PatternPlayer | null>(null);
  const session = useRef<PracticeSession | null>(null);

  // ── What is being practised this run: a step range of the song (or the whole pattern) ──
  const layout = useMemo(() => (song ? layoutSong(song, patterns) : null), [song, patterns]);
  const run = useMemo(() => {
    let parts: { steps: number; swing?: Swing; tag: { section: number; repeat: number } }[];
    let hits: Hit[];
    let start = 0;
    let end: number;
    let sections: LaidSection[] = [];
    if (layout && song) {
      sections = layout.sections;
      const sec = layout.sections[Math.min(loopSection, layout.sections.length - 1)];
      if (loopMode === 'song' || !sec) {
        end = layout.totalSteps;
      } else {
        start = sec.start;
        const next = loopMode === 'section+next' ? layout.sections[sec.index + 1] : undefined;
        end = next ? next.start + next.steps : sec.start + sec.steps;
      }
      let acc = 0;
      parts = layout.parts.filter((p) => {
        const s = acc;
        acc += p.steps;
        return s >= start && s < end;
      });
      hits = layout.hits.filter((h) => h.step >= start && h.step < end).map((h) => ({ ...h, step: h.step - start }));
    } else {
      const p = pattern!;
      parts = [{ steps: patternSteps(p), swing: p.swing, tag: { section: -1, repeat: 0 } }];
      hits = p.hits;
      end = patternSteps(p);
    }
    const views: View[] = [];
    let s = 0;
    for (const p of parts) {
      const sec = sections[p.tag.section];
      views.push({ start: s, steps: p.steps, pattern: sec ? sec.pattern : (pattern ?? null), section: p.tag.section, repeat: p.tag.repeat });
      s += p.steps;
    }
    return { parts, hits, start, end, steps: s, views };
  }, [layout, song, pattern, loopMode, loopSection]);
  const steps = run.steps;

  // ── Split between grid and pads: a draggable handle sets the row height; the
  // pads take whatever height is left. Remembered per browser.
  const SPLIT_KEY = 'fd.practice.cellH';
  const autoCellH = () => Math.min(30, Math.max(12, (window.innerHeight - (isSong ? 580 : 500)) / 17));
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
  }, [cellH, kit, running, isSong]);

  const best = song ? songScores[song.id] : scores[pattern!.id];
  const win = matchWindow(bpm);
  // One row per drum; a hit on either mirrored pad lands in the same row.
  const rows = useMemo(() => kitRows(kit).map((r) => r.pad), [kit]);
  const rep = useMemo(() => padRepOf(kit), [kit]);

  function showLive(results: LiveResult[]) {
    if (!results.length) return;
    setCells((prev) => {
      const next = new Map(prev);
      for (const r of results) {
        const key = rep(r.pad) + ':' + r.step;
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
  }, (m) => setUnmapped({ note: m.note, device: m.deviceName }));
  const mappedCount = Object.keys(settings.noteMap).length;

  /** Song passes are scored per section (worst 3 each) and averaged; a lone pattern is just its worst 3. */
  function scorePass(result: PassResult): number {
    if (!layout || !song) {
      setSectionScores(new Map());
      return result.score;
    }
    const bySection = new Map<number, number[]>();
    for (const r of result.results) {
      const global = run.start + r.step;
      const sec = layout.sections.find((s) => global >= s.start && global < s.start + s.steps);
      if (!sec) continue;
      const list = bySection.get(sec.index) ?? [];
      list.push(r.errorMs);
      bySection.set(sec.index, list);
    }
    const inRange = layout.sections.filter((s) => s.start >= run.start && s.start < run.end);
    const perSection = new Map<number, number>();
    for (const s of inRange) perSection.set(s.index, scoreOf(bySection.get(s.index) ?? []));
    setSectionScores(perSection);
    const values = [...perSection.values()];
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : result.score;
  }

  function start() {
    if (!loaded || steps === 0) return;
    resumeAudio().then(() => {
      const tl = makeTimeline(bpm, run.parts);
      const p = new PatternPlayer({ hits: run.hits, timeline: tl, kit: loaded, playSong: mode === 'playalong', metronome, countInBars: 1 });
      const songStart = p.start();
      player.current = p;
      session.current = new PracticeSession(run.hits, tl, songStart, padGroupOf(kit));
      setLastScore(null);
      setSectionScores(new Map());
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
  }, [mode, bpm, metronome, loaded, loopMode, loopSection]);

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
        const score = scorePass(result);
        setLastScore(score);
        setPassCount((n) => n + 1);
        if (song) {
          if (loopMode === 'song') recordSongScore(song, bpm, score);
        } else recordScore(pattern!, bpm, score);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, target, bpm, steps, loopMode, loopSection]);

  const expectedMap = useMemo(() => new Map(run.hits.map((h) => [rep(h.pad) + ':' + h.step, h])), [run.hits, rep]);

  // Which repeat of which pattern is on screen: the one under the playhead, else the first.
  const passPos = position === null ? null : ((position % steps) + steps) % steps;
  const view: View = useMemo(() => {
    if (passPos !== null && position! >= 0) {
      const v = run.views.find((v) => passPos >= v.start && passPos < v.start + v.steps);
      if (v) return v;
    }
    return run.views[0] ?? { start: 0, steps: 16, pattern: null, section: -1, repeat: 0 };
  }, [run.views, passPos, position]);

  /** Cell for a pass-local step. `upcoming` = a step of the next pass: expected hits only, no results. */
  const cellAt = (pad: number, step: number, upcoming = false): CellState => {
    const key = pad + ':' + step;
    const exp = expectedMap.get(key);
    const on = !!exp;
    const lvl = exp ? levelOfHit(exp) : undefined;
    const base: CellState = { on, className: lvl ? 'lvl-' + lvl : '', data: lvl ? { lvl } : undefined };
    const r = upcoming ? undefined : cells.get(key);
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
      data: { ...(lvl ? { lvl } : {}), ...(played ? { played: LEVEL_GLYPH[played] || '●', dyn } : {}) },
    };
  };
  const cell = (pad: number, local: number): CellState => cellAt(pad, view.start + local);
  const labelAt = (step: number): string | undefined => {
    const v = run.views.find((v) => v.start === step);
    if (!v) return undefined;
    const prev = run.views[run.views.indexOf(v) - 1];
    // Name a bar when a section starts; inside a repeated section show the repeat count.
    if (!prev || prev.section !== v.section) return (v.pattern?.name ?? '?') + (v.repeat === 0 && (layout?.sections[v.section]?.repeat ?? 1) > 1 ? ' ×' + layout!.sections[v.section].repeat : '');
    return undefined;
  };

  const playheadStep = passPos === null || position! < 0 ? null : Math.floor(passPos) - view.start;
  const countIn = position !== null && position < 0 ? Math.ceil(-position / 4) : null;
  const viewBars = view.steps / STEPS;
  const totalBars = steps / STEPS;
  const currentSection = layout ? (view.section >= 0 ? layout.sections[view.section] : undefined) : undefined;

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <button onClick={onBack}>← {isSong ? 'Songs' : 'Patterns'}</button>
          <h2 style={{ margin: 0 }}>{name}</h2>
          <span className="muted small">
            {author ? 'by ' + author + ' · ' : ''}
            {difficulty ? 'difficulty ' + difficulty + '/5 · ' : ''}
            {song ? layout!.totalSteps / STEPS + ' bars' : totalBars + ' bar' + (totalBars === 1 ? '' : 's')}
            {pattern?.swing && pattern.swing.amount > 50 ? ' · swing ' + pattern.swing.amount + '% (' + (pattern.swing.unit === 'eighth' ? '8ths' : '16ths') + ')' : ''}
            {' · kit: ' + kit.name}
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
            <input type="number" value={bpm} min={20} max={300} onChange={(e) => setBpm(Number(e.target.value) || defaultBpm)} />
            <button onClick={() => setBpm((b) => Math.min(300, b + 5))}>+</button>
            {bpm !== defaultBpm && <button onClick={() => setBpm(defaultBpm)}>reset</button>}
          </label>
          {running ? (
            <button className="primary" onClick={stop}>
              ■ Stop
            </button>
          ) : (
            <button className="primary" onClick={start} disabled={!loaded || steps === 0}>
              ▶ Start
            </button>
          )}
        </div>
      </div>

      {(unmapped || mappedCount === 0) && (
        <div className="notice warn" onClick={onSettings}>
          {unmapped
            ? 'Note ' + unmapped.note + ' from ' + unmapped.device + ' is not mapped to a pad'
            : 'No controller pads are mapped on this site yet'}
          {' — open Settings → MIDI to map it, or reset to the standard 36–51 layout.'}
        </div>
      )}

      {layout && song && (
        <div className="structure">
          <div className="row" style={{ gap: 6 }}>
            <span className="muted small">Loop:</span>
            <button className={loopMode === 'song' ? 'active' : ''} onClick={() => setLoopMode('song')}>
              Whole song
            </button>
            <button className={loopMode === 'section' ? 'active' : ''} onClick={() => setLoopMode('section')}>
              Section
            </button>
            <button className={loopMode === 'section+next' ? 'active' : ''} onClick={() => setLoopMode('section+next')}>
              Section + next
            </button>
            <span className="muted small">{loopMode === 'song' ? 'Click a section to loop just that.' : 'Looping ' + (run.end - run.start) / STEPS + ' bars.'}</span>
          </div>
          <div className="strip">
            {layout.sections.map((s) => {
              const inLoop = s.start >= run.start && s.start < run.end;
              const isCurrent = currentSection?.index === s.index && running;
              const score = sectionScores.get(s.index);
              return (
                <div
                  key={s.index}
                  className={'sec' + (inLoop ? ' in-loop' : '') + (isCurrent ? ' current' : '') + (loopSection === s.index ? ' selected' : '')}
                  style={{ flexGrow: s.steps }}
                  onClick={() => {
                    setLoopSection(s.index);
                    if (loopMode === 'song') setLoopMode('section');
                  }}
                  title={(s.pattern?.name ?? 'missing pattern') + ' × ' + s.repeat + ' · bars ' + (s.start / STEPS + 1) + '–' + ((s.start + s.steps) / STEPS)}
                >
                  <span className="sec-name">{s.pattern?.name ?? '?'}</span>
                  <span className="sec-meta">
                    {s.repeat > 1 ? '×' + s.repeat : ''}
                    {isCurrent && s.repeat > 1 ? ' (' + (view.repeat + 1) + '/' + s.repeat + ')' : ''}
                  </span>
                  {score !== undefined && <span className="sec-score">{Math.round(score)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="row between panel stats-bar">
        <div className="stats">
          <div className="stat">
            <div className="v">{lastScore !== null ? Math.round(lastScore) : '—'}</div>
            <div className="k">last pass{song ? ' (avg of sections)' : ''}</div>
          </div>
          <div className="stat">
            <div className="v">{best ? Math.round(best.best) : '—'}</div>
            <div className="k">
              best
              {bpm !== defaultBpm ? ' (at ' + defaultBpm + ' bpm; not saved at ' + bpm + ')' : song && loopMode !== 'song' ? ' (whole-song loops only)' : ''}
            </div>
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

      <div className={'practice-grid' + (!song && viewBars >= 3 ? ' dense' : '')} style={{ ['--cell-h' as string]: cellH + 'px' }}>
        {song ? (
          <ScrollGrid
            kit={kit}
            rows={rows}
            cellAt={cellAt}
            position={position === null ? null : position < 0 ? position : passPos}
            steps={steps}
            labelAt={labelAt}
            flashPads={flashPads}
            onLabelClick={(pad) => auditionPad(loaded, pad)}
          />
        ) : (
          <StepGrid kit={kit} steps={view.steps} rows={rows} cell={cell} playheadStep={playheadStep} flashPads={flashPads} onLabelClick={(pad) => auditionPad(loaded, pad)} />
        )}
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
        Score = sum of the 3 worst timing errors{song ? ' per section, averaged over the loop' : ' in a pass'}; miss or extra = 1000. Best is only recorded at the {isSong ? 'song' : 'pattern'}&apos;s own tempo ({defaultBpm} bpm)
        {song ? ' when looping the whole song' : ''}.
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
