import { useState } from 'react';
import type { Conflict, Resolution } from '../share';

interface Props {
  conflicts: Conflict[];
  onDone: (resolutions: Record<string, Resolution>) => void;
  onCancel: () => void;
}

/** Shown when imported items clash with ones already in the library. */
export default function ImportDialog({ conflicts, onDone, onCancel }: Props) {
  const [res, setRes] = useState<Record<string, Resolution>>(() => Object.fromEntries(conflicts.map((c) => [c.key, 'replace'])));
  const setAll = (r: Resolution) => setRes(Object.fromEntries(conflicts.map((c) => [c.key, r])));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>You already have {conflicts.length === 1 ? 'a different version of this' : 'different versions of these'}</h3>
        <div className="row small">
          <span className="muted">All:</span>
          <button onClick={() => setAll('replace')}>Replace mine</button>
          <button onClick={() => setAll('both')}>Keep both</button>
          <button onClick={() => setAll('skip')}>Skip</button>
        </div>
        <table className="list">
          <tbody>
            {conflicts.map((c) => (
              <tr key={c.key}>
                <td>
                  <b>{c.name}</b>
                  {c.author ? <span className="muted"> by {c.author}</span> : null}
                  <span className="muted"> {'\u00b7'} {c.kind}</span>
                  <div className="muted small">differs: {c.summary}</div>
                </td>
                <td className="actions">
                  {(['replace', 'both', 'skip'] as Resolution[]).map((r) => (
                    <button key={r} className={res[c.key] === r ? 'active' : ''} onClick={() => setRes({ ...res, [c.key]: r })}>
                      {r === 'replace' ? 'Replace mine' : r === 'both' ? 'Keep both' : 'Skip'}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small" style={{ margin: 0 }}>
          Replace overwrites your version (scores stay). Keep both adds the incoming one as a copy marked {'\u201c'}(imported){'\u201d'}.
        </p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onCancel}>Cancel import</button>
          <button className="primary" onClick={() => onDone(res)}>
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
