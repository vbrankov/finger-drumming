import { useState } from 'react';
import type { Song } from '../model/types';
import { copyLink, packPayload, packText, shareLink, songPayload } from '../share';
import { deleteSong, emptySong, kitFor, useStore } from '../store';

interface Props {
  onPractice: (song: Song) => void;
  onEdit: (song: Song) => void;
}

function Dots({ n }: { n?: number }) {
  if (!n) return <span className="muted">—</span>;
  return <span className="dots">{'●'.repeat(n) + '○'.repeat(5 - n)}</span>;
}

export default function Songs({ onPractice, onEdit }: Props) {
  const { songs, kits, scores } = useStore();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = selected.size === songs.length && songs.length > 0;

  async function copySelected() {
    const chosen = songs.filter((s) => selected.has(s.id));
    const text = await packText(packPayload(chosen, [], kitFor));
    try {
      await navigator.clipboard.writeText(text);
      alert(chosen.length + ' song' + (chosen.length === 1 ? '' : 's') + ' copied as text (' + text.length + ' characters). Paste it anywhere; others import it in Settings \u2192 Data.');
    } catch {
      prompt('Copy this text:', text);
    }
  }
  // Easiest first, so the list reads as a progression; unrated songs last.
  const sorted = [...songs].sort((a, b) => (a.difficulty ?? 9) - (b.difficulty ?? 9) || a.bpm - b.bpm || a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Songs</h2>
        <div className="row">
          {selected.size > 0 && (
            <button onClick={copySelected} title="Copy the selected songs as one text token you can paste in a forum post">
              Copy {selected.size} as text
            </button>
          )}
          <button className="primary" onClick={() => onEdit(emptySong())}>
            + New song
          </button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="muted">No songs yet.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(songs.map((s) => s.id)))}
                  title="Select all"
                />
              </th>
              <th>Name</th>
              <th>Author</th>
              <th>Difficulty</th>
              <th>BPM</th>
              <th>Kit</th>
              <th>Hits</th>
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
                <td className="muted">{kits.find((k) => k.id === s.kitId)?.name ?? 'default (missing)'}</td>
                <td className="muted">{s.hits.length}</td>
                <td>{scores[s.id] ? Math.round(scores[s.id].best) : '—'}</td>
                <td className="actions">
                  <button className="primary" onClick={() => onPractice(s)}>
                    Practice
                  </button>
                  <button onClick={() => onEdit(s)}>Edit</button>
                  <button onClick={() => shareLink(songPayload(s, kitFor(s))).then((url) => copyLink(url, '\u201c' + s.name + '\u201d'))} title="Copy a link that adds this song to someone's library">
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
