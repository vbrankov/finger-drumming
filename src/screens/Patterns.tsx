import { useMemo, useState } from 'react';
import type { Pattern } from '../model/types';
import { copyLink, packPayload, packText, shareLink, patternPayload } from '../share';
import { deletePattern, emptyPattern, kitFor, useStore } from '../store';
import { AI_URL } from '../links';

interface Props {
  onPractice: (pattern: Pattern) => void;
  onEdit: (pattern: Pattern) => void;
  onLibrary: () => void;
}

function Dots({ n }: { n?: number }) {
  if (!n) return <span className="muted">—</span>;
  return <span className="dots">{'●'.repeat(n) + '○'.repeat(5 - n)}</span>;
}

export default function Patterns({ onPractice, onEdit, onLibrary }: Props) {
  const { patterns, kits, scores } = useStore();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [style, setStyle] = useState<string | null>(null);
  const styles = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of patterns) c.set(p.style ?? 'Other', (c.get(p.style ?? 'Other') ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [patterns]);
  const visible = style === null ? patterns : patterns.filter((p) => (p.style ?? 'Other') === style);
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  async function copySelected() {
    const chosen = patterns.filter((s) => selected.has(s.id));
    const text = await packText(packPayload({ patterns: chosen }, { kitFor: (id) => kits.find((k) => k.id === id) ?? kitFor(chosen[0]), patterns }));
    try {
      await navigator.clipboard.writeText(text);
      alert(chosen.length + ' pattern' + (chosen.length === 1 ? '' : 's') + ' copied as text (' + text.length + ' characters). Paste it anywhere; others import it in Settings \u2192 Data.');
    } catch {
      prompt('Copy this text:', text);
    }
  }
  // Easiest first, so the list reads as a progression; unrated patterns last.
  const sorted = [...visible].sort((a, b) => (a.difficulty ?? 9) - (b.difficulty ?? 9) || a.bpm - b.bpm || a.name.localeCompare(b.name));

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Patterns</h2>
        <div className="row">
          {selected.size > 0 && (
            <button onClick={copySelected} title="Copy the selected patterns as one text token you can paste in a forum post">
              Copy {selected.size} as text
            </button>
          )}
          <button className="primary" onClick={() => onEdit(emptyPattern())}>
            + New pattern
          </button>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Want more rhythms? Pick from the{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); onLibrary(); }}>
          Library
        </a>
        , build them in the editor, paste ones people share (Settings {'\u2192'} Data), or{' '}
        <a href={AI_URL} target="_blank" rel="noreferrer">
          have an AI write them
        </a>
        .
      </p>
      {styles.length > 1 && (
        <div className="row wrap chips">
          <button className={style === null ? 'active' : ''} onClick={() => setStyle(null)}>
            All <span className="muted">{patterns.length}</span>
          </button>
          {styles.map(([s, n]) => (
            <button key={s} className={style === s ? 'active' : ''} onClick={() => setStyle(style === s ? null : s)}>
              {s} <span className="muted">{n}</span>
            </button>
          ))}
        </div>
      )}
      {sorted.length === 0 ? (
        <p className="muted">No patterns yet.</p>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)))}
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
                <td>
                  {s.name}
                  {s.tags?.includes('fill') && <span className="tag">fill</span>}
                </td>
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
                  <button onClick={() => shareLink(patternPayload(s, kitFor(s))).then((url) => copyLink(url, '\u201c' + s.name + '\u201d'))} title="Copy a link that adds this pattern to someone's library">
                    Share
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      if (!confirm('Delete "' + s.name + '"?')) return;
                      const err = deletePattern(s.id);
                      if (err) alert(err);
                    }}
                  >
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
