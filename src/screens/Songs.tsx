import { useState } from 'react';
import type { Song } from '../model/types';
import { describeSong, songBars } from '../model/song';
import { copyLink, packPayload, packText, shareLink, songPayload } from '../share';
import { DEFAULT_KIT, deleteSong, emptySong, useStore } from '../store';

interface Props {
  onPractice: (song: Song) => void;
  onEdit: (song: Song) => void;
}

function Dots({ n }: { n?: number }) {
  if (!n) return <span className="muted">—</span>;
  return <span className="dots">{'●'.repeat(n) + '○'.repeat(5 - n)}</span>;
}

export default function Songs({ onPractice, onEdit }: Props) {
  const { songs, patterns, kits, songScores } = useStore();
  const kitFor = (id: string) => kits.find((k) => k.id === id) ?? DEFAULT_KIT;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function copySelected() {
    const chosen = songs.filter((s) => selected.has(s.id));
    const text = await packText(packPayload({ songs: chosen }, { kitFor, patterns }));
    try {
      await navigator.clipboard.writeText(text);
      alert(chosen.length + ' song' + (chosen.length === 1 ? '' : 's') + ' with their patterns copied as text (' + text.length + ' characters).');
    } catch {
      prompt('Copy this text:', text);
    }
  }
  const share = (s: Song) => shareLink(songPayload(s, patterns, kitFor(s.kitId))).then((url) => copyLink(url, '\u201c' + s.name + '\u201d'));
  const sorted = [...songs].sort((a, b) => (a.difficulty ?? 9) - (b.difficulty ?? 9) || a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Songs</h2>
        <div className="row">
          {selected.size > 0 && (
            <button onClick={copySelected} title="Copy the selected songs, with their patterns, as one text token">
              Copy {selected.size} as text
            </button>
          )}
          <button className="primary" onClick={() => onEdit(emptySong())}>
            + New song
          </button>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        A song is a sequence of patterns: grooves repeated, fills between them. Practise the whole thing, one section, or a section and the one after it.
      </p>
      {sorted.length === 0 ? (
        <p className="muted">No songs yet. Make one from your patterns.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th />
              <th>Name</th>
              <th>Author</th>
              <th>Difficulty</th>
              <th>BPM</th>
              <th>Bars</th>
              <th>Sections</th>
              <th>Kit</th>
              <th>Best</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.id}>
                <td>
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                </td>
                <td>{s.name}</td>
                <td className="muted">{s.author || '—'}</td>
                <td title={s.difficulty ? s.difficulty + ' / 5' : 'not set'}>
                  <Dots n={s.difficulty} />
                </td>
                <td>{s.bpm}</td>
                <td className="muted">{songBars(s, patterns)}</td>
                <td className="muted small" title={describeSong(s, patterns)}>
                  {describeSong(s, patterns)}
                </td>
                <td className="muted">{kits.find((k) => k.id === s.kitId)?.name ?? 'default (missing)'}</td>
                <td>{songScores[s.id] ? Math.round(songScores[s.id].best) : '—'}</td>
                <td className="actions">
                  <button className="primary" onClick={() => onPractice(s)} disabled={s.sections.length === 0}>
                    Practice
                  </button>
                  <button onClick={() => onEdit(s)}>Edit</button>
                  <button onClick={() => share(s)} title="Copy a link that adds this song and its patterns to someone's library">
                    Share
                  </button>
                  <button className="danger" onClick={() => confirm('Delete "' + s.name + '"?') && deleteSong(s.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
