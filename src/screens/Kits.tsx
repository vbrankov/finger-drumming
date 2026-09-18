import { useState } from 'react';
import type { Kit } from '../model/types';
import { DEFAULT_KIT_ID } from '../model/types';
import { copyLink, kitPayload, packPayload, packText, shareLink } from '../share';
import { defaultKit, deleteKit, duplicateKit, resetDefaultKit, useStore } from '../store';

interface Props {
  onEdit: (kit: Kit) => void;
}

export default function Kits({ onEdit }: Props) {
  const { kits, patterns } = useStore();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function copySelected() {
    const chosen = kits.filter((k) => selected.has(k.id));
    const text = await packText(packPayload([], chosen, () => chosen[0]));
    try {
      await navigator.clipboard.writeText(text);
      alert(chosen.length + ' kit' + (chosen.length === 1 ? '' : 's') + ' copied as text. Others import it in Settings \u2192 Data. Bundled sounds only.');
    } catch {
      prompt('Copy this text:', text);
    }
  }

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Kits</h2>
        <div className="row">
          {selected.size > 0 && (
            <button onClick={copySelected} title="Copy the selected kits as one text token">
              Copy {selected.size} as text
            </button>
          )}
          <button className="primary" onClick={() => onEdit(duplicateKit(defaultKit(), 'New kit'))}>
            + New kit
          </button>
        </div>
      </div>
      <table className="list">
        <thead>
          <tr>
            <th />
            <th>Name</th>
            <th>User samples</th>
            <th>Used by</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {kits.map((k) => {
            const users = patterns.filter((s) => s.kitId === k.id).length;
            return (
              <tr key={k.id}>
                <td>
                  <input type="checkbox" checked={selected.has(k.id)} onChange={() => toggle(k.id)} />
                </td>
                <td>{k.name}</td>
                <td className="muted">{k.slots.filter((s) => s.sound.type === 'user').length} / 16</td>
                <td className="muted">{users} pattern{users === 1 ? '' : 's'}</td>
                <td className="actions">
                  <button onClick={() => onEdit(k)}>Edit</button>
                  <button onClick={() => onEdit(duplicateKit(k))}>Duplicate</button>
                  <button onClick={() => shareLink(kitPayload(k)).then((url) => copyLink(url, 'kit \u201c' + k.name + '\u201d'))} title="Copy a link that adds this kit to someone's library (bundled sounds only)">
                    Share
                  </button>
                  {k.id === DEFAULT_KIT_ID ? (
                    <button onClick={() => confirm('Reset the default kit to the shipped samples?') && resetDefaultKit()}>Reset</button>
                  ) : (
                    <button
                      className="danger"
                      onClick={() => {
                        if (!confirm('Delete "' + k.name + '"?')) return;
                        const err = deleteKit(k.id);
                        if (err) alert(err);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
