import { useEffect, useMemo, useState } from 'react';
import type { Pattern } from '../model/types';
import { savePattern, useStore } from '../store';

/** A pattern as shipped in a library file: no timestamps until it is added. */
export type LibraryPattern = Omit<Pattern, 'createdAt' | 'updatedAt'>;

interface Collection {
  id: string;
  name: string;
  blurb: string;
  credit: string;
  creditUrl: string;
  load: () => Promise<LibraryPattern[]>;
}

const COLLECTIONS: Collection[] = [
  {
    id: 'gmd',
    name: 'Groove MIDI Dataset',
    blurb:
      'Grooves and fills played by ten drummers on an electronic kit, quantised to the grid with their ghost notes and accents. Real feel, real tempos.',
    credit: 'Google Magenta, CC BY 4.0',
    creditUrl: 'https://magenta.tensorflow.org/datasets/groove',
    load: () => import('../library/gmd.json').then((m) => m.default as LibraryPattern[]),
  },
];

type Kind = 'all' | 'groove' | 'fill';
const isFill = (p: LibraryPattern) => p.tags?.includes('fill') ?? false;

interface Props {
  onPractice: (pattern: Pattern) => void;
}

export default function Library({ onPractice }: Props) {
  const { patterns } = useStore();
  const have = useMemo(() => new Set(patterns.map((p) => p.id)), [patterns]);
  const [collection, setCollection] = useState(COLLECTIONS[0]);
  const [items, setItems] = useState<LibraryPattern[] | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('groove');
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    setItems(null);
    collection.load().then((list) => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, [collection]);

  const styles = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of items ?? []) c.set(p.style ?? 'Other', (c.get(p.style ?? 'Other') ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter(
      (p) =>
        (style === null || (p.style ?? 'Other') === style) &&
        (kind === 'all' || (kind === 'fill') === isFill(p)) &&
        (difficulty === null || p.difficulty === difficulty) &&
        (!q || p.name.toLowerCase().includes(q) || (p.author ?? '').toLowerCase().includes(q)),
    );
  }, [items, style, kind, difficulty, query]);

  function add(p: LibraryPattern): Pattern {
    const now = new Date().toISOString();
    const full: Pattern = { ...p, createdAt: now, updatedAt: now };
    if (!have.has(p.id)) savePattern(full);
    return patterns.find((x) => x.id === p.id) ?? full;
  }

  function addShown() {
    const fresh = shown.filter((p) => !have.has(p.id));
    if (!fresh.length) return;
    if (!confirm('Add ' + fresh.length + ' pattern' + (fresh.length === 1 ? '' : 's') + ' to your patterns?')) return;
    for (const p of fresh) add(p);
  }

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Library</h2>
        {COLLECTIONS.length > 1 && (
          <select value={collection.id} onChange={(e) => setCollection(COLLECTIONS.find((c) => c.id === e.target.value) ?? COLLECTIONS[0])}>
            {COLLECTIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        <b>{collection.name}</b> — {collection.blurb} Source:{' '}
        <a href={collection.creditUrl} target="_blank" rel="noreferrer">
          {collection.credit}
        </a>
        . Add what you like to your patterns; they are yours to edit, share and build songs from.
      </p>

      {items === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="row wrap chips">
            <button className={style === null ? 'active' : ''} onClick={() => setStyle(null)}>
              All styles <span className="muted">{items.length}</span>
            </button>
            {styles.map(([s, n]) => (
              <button key={s} className={style === s ? 'active' : ''} onClick={() => setStyle(style === s ? null : s)}>
                {s} <span className="muted">{n}</span>
              </button>
            ))}
          </div>
          <div className="row wrap">
            <div className="row chips">
              {(['groove', 'fill', 'all'] as Kind[]).map((k) => (
                <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
                  {k === 'groove' ? 'Grooves' : k === 'fill' ? 'Fills' : 'Both'}
                </button>
              ))}
            </div>
            <div className="row chips" title="Difficulty">
              {[1, 2, 3, 4, 5].map((d) => (
                <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(difficulty === d ? null : d)}>
                  {'●'.repeat(d)}
                </button>
              ))}
            </div>
            <input type="search" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 140 }} />
            <span className="muted small">{shown.length} shown</span>
            {shown.some((p) => !have.has(p.id)) && (
              <button onClick={addShown}>Add all shown</button>
            )}
          </div>
          <table className="list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Drummer</th>
                <th>Difficulty</th>
                <th>BPM</th>
                <th>Bars</th>
                <th>Feel</th>
                <th>Hits</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 400).map((p) => (
                <tr key={p.id} className={have.has(p.id) ? 'have' : ''}>
                  <td>
                    {p.name}
                    {isFill(p) && <span className="tag">fill</span>}
                  </td>
                  <td className="muted">{(p.author ?? '').replace(', Groove MIDI Dataset', '')}</td>
                  <td title={p.difficulty ? p.difficulty + ' / 5' : ''}>
                    <span className="dots">{'●'.repeat(p.difficulty ?? 0) + '○'.repeat(5 - (p.difficulty ?? 0))}</span>
                  </td>
                  <td>{p.bpm}</td>
                  <td className="muted">{p.bars ?? 1}</td>
                  <td className="muted">{p.swing && p.swing.amount > 50 ? 'swing ' + p.swing.amount + '% ' + (p.swing.unit === 'eighth' ? '8ths' : '16ths') : 'straight'}</td>
                  <td className="muted">{p.hits.length}</td>
                  <td className="actions">
                    <button className="primary" onClick={() => onPractice(add(p))}>
                      Practice
                    </button>
                    <button disabled={have.has(p.id)} onClick={() => add(p)}>
                      {have.has(p.id) ? 'Added' : 'Add'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > 400 && <p className="muted small">Showing the first 400; narrow the filters to see the rest.</p>}
        </>
      )}
    </div>
  );
}
