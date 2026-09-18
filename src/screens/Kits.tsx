import type { Kit } from '../model/types';
import { DEFAULT_KIT_ID } from '../model/types';
import { copyLink, kitPayload, shareLink } from '../share';
import { defaultKit, deleteKit, duplicateKit, resetDefaultKit, useStore } from '../store';

interface Props {
  onEdit: (kit: Kit) => void;
}

export default function Kits({ onEdit }: Props) {
  const { kits, songs } = useStore();

  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Kits</h2>
        <button className="primary" onClick={() => onEdit(duplicateKit(defaultKit(), 'New kit'))}>
          + New kit
        </button>
      </div>
      <table className="list">
        <thead>
          <tr>
            <th>Name</th>
            <th>User samples</th>
            <th>Used by</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {kits.map((k) => {
            const users = songs.filter((s) => s.kitId === k.id).length;
            return (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td className="muted">{k.slots.filter((s) => s.sound.type === 'user').length} / 16</td>
                <td className="muted">{users} song{users === 1 ? '' : 's'}</td>
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
