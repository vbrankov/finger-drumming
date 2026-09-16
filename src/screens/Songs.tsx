import type { Song } from '../model/types';
import { deleteSong, emptySong, useStore } from '../store';

interface Props {
  onPractice: (song: Song) => void;
  onEdit: (song: Song) => void;
}

export default function Songs({ onPractice, onEdit }: Props) {
  const { songs, kits, scores } = useStore();
  const sorted = [...songs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Songs</h2>
        <button className="primary" onClick={() => onEdit(emptySong())}>
          + New song
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="muted">No songs yet.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>Name</th>
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
                <td>{s.name}</td>
                <td>{s.bpm}</td>
                <td className="muted">{kits.find((k) => k.id === s.kitId)?.name ?? 'default (missing)'}</td>
                <td className="muted">{s.hits.length}</td>
                <td>{scores[s.id] ? Math.round(scores[s.id].best) : '—'}</td>
                <td className="actions">
                  <button className="primary" onClick={() => onPractice(s)}>
                    Practice
                  </button>
                  <button onClick={() => onEdit(s)}>Edit</button>
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
