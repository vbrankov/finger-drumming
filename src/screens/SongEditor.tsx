import { useEffect, useMemo, useRef, useState } from 'react';
import StepGrid from '../components/StepGrid';
import { getAudioContext, resumeAudio } from '../engine/audio';
import { SongPlayer } from '../engine/player';
import { DIFFICULTIES, MAX_BARS, songBars, songSteps } from '../model/types';
import type { Difficulty, Hit, Song } from '../model/types';
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
  const loaded = useLoadedKit(kit);
  const hitSet = useMemo(() => new Set(song.hits.map((h) => h.pad + ':' + h.step)), [song.hits]);

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

  function toggle(pad: number, step: number) {
    const key = pad + ':' + step;
    const hits: Hit[] = hitSet.has(key)
      ? song.hits.filter((h) => !(h.pad === pad && h.step === step))
      : [...song.hits, { pad, step }].sort((a, b) => a.step - b.step || a.pad - b.pad);
    patch({ hits });
    if (!hitSet.has(key)) auditionPad(loaded, pad);
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
      const p = new SongPlayer({ hits: song.hits, bpm: song.bpm, steps, kit: loaded, playSong: true, metronome: true, countInBars: 0 });
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
  }, [song.hits, song.bpm, song.bars, loaded]);
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
        cell={(pad, step) => ({ on: hitSet.has(pad + ':' + step) })}
        playheadStep={playhead}
        onCellClick={toggle}
        onLabelClick={(pad) => auditionPad(loaded, pad)}
      />
      <p className="muted small">Click a cell to toggle a hit. Click a row label to hear that pad. {song.hits.length} hits.</p>
    </div>
  );
}
