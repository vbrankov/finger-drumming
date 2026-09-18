import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import StepGrid from '../components/StepGrid';
import { getAudioContext, resumeAudio } from '../engine/audio';
import { SongPlayer } from '../engine/player';
import { DIFFICULTIES, LEVEL_VELOCITY, MAX_BARS, SWING_MAX, SWING_MIN, kitRows, levelOfHit, padRepOf, songBars, songSteps } from '../model/types';
import type { Difficulty, Hit, Song, Swing } from '../model/types';
import { auditionPad, useLoadedKit } from '../hooks';
import { saveSong, useStore } from '../store';

interface Props {
  song: Song;
  onDone: () => void;
  onEditKit: (kitId: string) => void;
}

export default function SongEditor({ song: initial, onDone, onEditKit }: Props) {
  const { kits } = useStore();
  const [song, setSong] = useState<Song>(initial);
  const [dirty, setDirty] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const player = useRef<SongPlayer | null>(null);

  const kit = useMemo(() => kits.find((k) => k.id === song.kitId) ?? kits[0], [kits, song.kitId]);
  const steps = songSteps(song);
  const bars = songBars(song);
  // Collapsed: one row per drum, hits stored on the row's first pad. All pads: 16 rows, exact pads.
  const [allPads, setAllPads] = useState(() => localStorage.getItem('fd.editor.allPads') === '1');
  const rows = useMemo(() => (allPads ? undefined : kitRows(kit).map((r) => r.pad)), [kit, allPads]);
  const rep = useMemo(() => (allPads ? (p: number) => p : padRepOf(kit)), [kit, allPads]);
  const loaded = useLoadedKit(kit);
  const hitMap = useMemo(() => new Map(song.hits.map((h) => [rep(h.pad) + ':' + h.step, h])), [song.hits, rep]);

  function patch(p: Partial<Song>) {
    setSong((s) => ({ ...s, ...p }));
    setDirty(true);
  }

  function setBars(n: number) {
    n = Math.min(MAX_BARS, Math.max(1, n));
    const keep = song.hits.filter((h) => h.step < n * 16);
    if (keep.length < song.hits.length && !confirm('Shorter song drops ' + (song.hits.length - keep.length) + ' hits past bar ' + n + '. Continue?')) return;
    patch({ bars: n, hits: keep });
  }

  function setHit(pad: number, step: number, hit: Hit | null) {
    setSong((s) => {
      const rest = s.hits.filter((h) => !(rep(h.pad) === rep(pad) && h.step === step));
      return { ...s, hits: hit ? [...rest, hit].sort((a, b) => a.step - b.step || a.pad - b.pad) : rest };
    });
    setDirty(true);
  }

  // Ableton-style: press creates a hit (or grabs the existing one); dragging up/down
  // sets its velocity, 1 px per unit; a press without movement on an existing hit removes it.
  const [dragging, setDragging] = useState<{ pad: number; step: number; velocity: number } | null>(null);
  function onCellPointerDown(pad: number, step: number, e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const existing = hitMap.get(pad + ':' + step);
    const startVel = existing?.velocity ?? LEVEL_VELOCITY.normal;
    if (!existing) {
      setHit(pad, step, { pad, step });
      auditionPad(loaded, pad, startVel);
    }
    const startY = e.clientY;
    let moved = false;
    let lastLevel = levelOfHit({ velocity: startVel });
    setDragging({ pad, step, velocity: startVel });

    const move = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      if (!moved && Math.abs(dy) < 3) return;
      moved = true;
      const velocity = Math.max(1, Math.min(127, Math.round(startVel + dy)));
      setDragging({ pad, step, velocity });
      setHit(pad, step, velocity === LEVEL_VELOCITY.normal ? { pad, step } : { pad, step, velocity });
      const lvl = levelOfHit({ velocity });
      if (lvl !== lastLevel) {
        lastLevel = lvl;
        auditionPad(loaded, pad, velocity);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDragging(null);
      if (!moved && existing) setHit(pad, step, null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function stop() {
    player.current?.stop();
    player.current = null;
    setPlaying(false);
    setPlayhead(null);
  }

  function play() {
    if (!loaded) return;
    resumeAudio().then(() => {
      const p = new SongPlayer({ hits: song.hits, bpm: song.bpm, steps, swing: song.swing, kit: loaded, playSong: true, metronome: true, countInBars: 0 });
      p.start();
      player.current = p;
      setPlaying(true);
    });
  }

  // Restart preview when the song changes underneath it.
  useEffect(() => {
    if (playing) {
      stop();
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.hits, song.bpm, song.bars, song.swing, loaded]);
  useEffect(() => stop, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const p = player.current;
      if (p) setPlayhead(((Math.floor(p.positionAt(getAudioContext().currentTime)) % steps) + steps) % steps);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, steps]);

  function save() {
    saveSong(song);
    setDirty(false);
  }

  function back() {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    onDone();
  }

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <button onClick={back}>← Songs</button>
          <input value={song.name} onChange={(e) => patch({ name: e.target.value })} style={{ fontSize: 16, width: 220 }} placeholder="Name" />
          <input value={song.author ?? ''} onChange={(e) => patch({ author: e.target.value })} style={{ width: 130 }} placeholder="Author" />
          <label className="field">
            Difficulty
            <select value={song.difficulty ?? ''} onChange={(e) => patch({ difficulty: e.target.value ? (Number(e.target.value) as Difficulty) : undefined })}>
              <option value="">—</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            BPM
            <input type="number" min={20} max={300} value={song.bpm} onChange={(e) => patch({ bpm: Number(e.target.value) || 90 })} />
          </label>
          <label className="field">
            Bars
            <select value={bars} onChange={(e) => setBars(Number(e.target.value))}>
              {Array.from({ length: MAX_BARS }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="field" title="50% = straight. 66% = triplet feel. Which notes swing: the 16ths (e, a) or the 8ths (&).">
            Swing
            <input
              type="number"
              min={SWING_MIN}
              max={SWING_MAX}
              value={song.swing?.amount ?? 50}
              onChange={(e) => {
                const amount = Math.min(SWING_MAX, Math.max(SWING_MIN, Number(e.target.value) || 50));
                patch({ swing: amount > 50 ? { amount, unit: song.swing?.unit ?? 'sixteenth' } : undefined });
              }}
            />
            %
            <select
              value={song.swing?.unit ?? 'sixteenth'}
              onChange={(e) => patch({ swing: { amount: song.swing?.amount ?? 62, unit: e.target.value as Swing['unit'] } })}
            >
              <option value="sixteenth">16ths</option>
              <option value="eighth">8ths</option>
            </select>
          </label>
          <label className="field">
            Kit
            <select value={song.kitId} onChange={(e) => patch({ kitId: e.target.value })}>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => onEditKit(song.kitId)}>Edit kit</button>
        </div>
        <div className="row">
          <label className="field small" title="Show every pad as its own row, e.g. to write left/right hand patterns">
            <input
              type="checkbox"
              checked={allPads}
              onChange={(e) => {
                setAllPads(e.target.checked);
                localStorage.setItem('fd.editor.allPads', e.target.checked ? '1' : '0');
              }}
            />
            all 16 pads
          </label>
          <button onClick={() => patch({ hits: [] })} disabled={!song.hits.length}>
            Clear
          </button>
          {playing ? <button onClick={stop}>■ Stop</button> : <button onClick={play} disabled={!loaded}>▶ Preview</button>}
          <button className="primary" onClick={save} disabled={!dirty}>
            Save
          </button>
        </div>
      </div>

      <StepGrid
        kit={kit}
        steps={steps}
        rows={rows}
        cell={(pad, step) => {
          const h = hitMap.get(pad + ':' + step);
          if (!h) return { on: false };
          const lvl = levelOfHit(h);
          const v = h.velocity ?? LEVEL_VELOCITY.normal;
          const isDrag = dragging?.pad === pad && dragging.step === step;
          return {
            on: true,
            className: 'lvl-' + lvl + (isDrag ? ' dragging' : ''),
            style: { opacity: 0.35 + 0.65 * (v / 127) },
            title: lvl + ' (' + v + ')',
            content: isDrag ? dragging.velocity : undefined,
            data: { lvl },
          };
        }}
        playheadStep={playhead}
        onCellPointerDown={onCellPointerDown}
        onLabelClick={(pad) => auditionPad(loaded, pad)}
      />
      <p className="muted small">
        Click a cell to add a hit, click again to remove it. Press and drag up or down to set its velocity: {'\u2265'}112 is an <b>accent</b> ({'\u25b2'}),{' '}
        {'<'}64 a ghost ({'\u00b7'}). Click a row label to hear that pad. {song.hits.length} hits.
      </p>
    </div>
  );
}
