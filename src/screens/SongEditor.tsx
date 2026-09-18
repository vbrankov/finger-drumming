import { useEffect, useMemo, useRef, useState } from 'react';
import { getAudioContext, resumeAudio } from '../engine/audio';
import { PatternPlayer } from '../engine/player';
import { describeSong, layoutSong } from '../model/song';
import { makeTimeline } from '../model/timing';
import { DIFFICULTIES } from '../model/types';
import type { Difficulty, Song, SongSection } from '../model/types';
import { useLoadedKit } from '../hooks';
import { saveSong, useStore } from '../store';

interface Props {
  song: Song;
  onDone: () => void;
}

export default function SongEditor({ song: initial, onDone }: Props) {
  const { patterns, kits } = useStore();
  const [song, setSong] = useState<Song>(initial);
  const [dirty, setDirty] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const player = useRef<PatternPlayer | null>(null);

  const kit = useMemo(() => kits.find((k) => k.id === song.kitId) ?? kits[0], [kits, song.kitId]);
  const loaded = useLoadedKit(kit);
  const layout = useMemo(() => layoutSong(song, patterns), [song, patterns]);
  const sortedPatterns = useMemo(() => [...patterns].sort((a, b) => a.name.localeCompare(b.name)), [patterns]);

  function patch(p: Partial<Song>) {
    setSong((s) => ({ ...s, ...p }));
    setDirty(true);
  }
  function setSections(sections: SongSection[]) {
    patch({ sections });
  }
  function updateSection(i: number, p: Partial<SongSection>) {
    setSections(song.sections.with(i, { ...song.sections[i], ...p }));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= song.sections.length) return;
    const s = [...song.sections];
    [s[i], s[j]] = [s[j], s[i]];
    setSections(s);
  }
  function addSection() {
    const last = song.sections[song.sections.length - 1];
    const patternId = last?.patternId ?? sortedPatterns[0]?.id;
    if (!patternId) return;
    setSections([...song.sections, { patternId, repeat: 1 }]);
  }

  function stop() {
    player.current?.stop();
    player.current = null;
    setPlaying(false);
    setPosition(null);
  }
  function play() {
    if (!loaded || layout.totalSteps === 0) return;
    resumeAudio().then(() => {
      const tl = makeTimeline(song.bpm, layout.parts);
      const p = new PatternPlayer({ hits: layout.hits, timeline: tl, kit: loaded, playSong: true, metronome: true, countInBars: 0 });
      p.start();
      player.current = p;
      setPlaying(true);
    });
  }
  useEffect(() => {
    if (playing) {
      stop();
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.sections, song.bpm, loaded]);
  useEffect(() => stop, []);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const p = player.current;
      if (p) setPosition(((p.positionAt(getAudioContext().currentTime) % layout.totalSteps) + layout.totalSteps) % layout.totalSteps);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, layout.totalSteps]);

  const currentSection = position === null ? -1 : (layout.sections.find((s) => position >= s.start && position < s.start + s.steps)?.index ?? -1);

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
            Kit
            <select value={song.kitId} onChange={(e) => patch({ kitId: e.target.value })}>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          {playing ? (
            <button onClick={stop}>■ Stop</button>
          ) : (
            <button onClick={play} disabled={!loaded || layout.totalSteps === 0}>
              ▶ Preview
            </button>
          )}
          <button className="primary" onClick={save} disabled={!dirty}>
            Save
          </button>
        </div>
      </div>

      <div className="panel stack">
        <div className="row between">
          <b>Sections</b>
          <span className="muted small">
            {layout.totalSteps / 16} bars · {describeSong(song, patterns) || 'empty'}
          </span>
        </div>
        {song.sections.length === 0 && <p className="muted small" style={{ margin: 0 }}>Add a section to start. A groove repeated a few times, then a fill, is the usual shape.</p>}
        <table className="list sections">
          <tbody>
            {song.sections.map((sec, i) => {
              const laid = layout.sections[i];
              return (
                <tr key={i} className={currentSection === i ? 'current' : ''}>
                  <td className="muted small" style={{ width: 24 }}>
                    {i + 1}
                  </td>
                  <td>
                    <select value={sec.patternId} onChange={(e) => updateSection(i, { patternId: e.target.value })}>
                      {!patterns.some((p) => p.id === sec.patternId) && <option value={sec.patternId}>(missing pattern)</option>}
                      {sortedPatterns.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.bars && p.bars > 1 ? ' (' + p.bars + ' bars)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="field small">
                      ×
                      <input type="number" min={1} max={64} value={sec.repeat} onChange={(e) => updateSection(i, { repeat: Math.max(1, Number(e.target.value) || 1) })} />
                    </label>
                  </td>
                  <td className="muted small">{laid ? laid.steps / 16 + ' bar' + (laid.steps === 16 ? '' : 's') : ''}</td>
                  <td className="actions">
                    <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                      ▲
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === song.sections.length - 1} title="Move down">
                      ▼
                    </button>
                    <button onClick={() => setSections([...song.sections.slice(0, i), { ...sec }, ...song.sections.slice(i)])} title="Duplicate">
                      ⧉
                    </button>
                    <button className="danger" onClick={() => setSections(song.sections.filter((_, j) => j !== i))} title="Remove">
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row">
          <button onClick={addSection} disabled={sortedPatterns.length === 0}>
            + Add section
          </button>
        </div>
      </div>
      <p className="muted small">
        Every section plays at the song&apos;s tempo on the song&apos;s kit; each pattern keeps its own swing. Patterns are shared by reference — edit a pattern and every song using it changes.
      </p>
    </div>
  );
}
