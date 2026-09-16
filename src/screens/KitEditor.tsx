import { useState } from 'react';
import type { DragEvent } from 'react';
import { newBlobId, putBlob } from '../engine/blobs';
import { invalidateSound } from '../engine/kitLoader';
import type { Kit, KitSlot } from '../model/types';
import { auditionPad, useLoadedKit } from '../hooks';
import { DEFAULT_KIT, saveKit } from '../store';

interface Props {
  kit: Kit;
  onDone: () => void;
}

export default function KitEditor({ kit: initial, onDone }: Props) {
  const [kit, setKit] = useState<Kit>(initial);
  const [dirty, setDirty] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const loaded = useLoadedKit(kit);

  function patchSlot(i: number, p: Partial<KitSlot>) {
    setKit((k) => ({ ...k, slots: k.slots.with(i, { ...k.slots[i], ...p }) }));
    setDirty(true);
  }

  async function setFile(i: number, file: File) {
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|ogg|flac|aif+)$/i.test(file.name)) {
      alert('Not an audio file: ' + file.name);
      return;
    }
    const blobId = newBlobId();
    await putBlob(blobId, file);
    const sound = { type: 'user' as const, blobId, name: file.name };
    invalidateSound(sound);
    patchSlot(i, { sound });
  }

  function onDrop(i: number, e: DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) setFile(i, file);
  }

  function pick(i: number) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.wav,.mp3,.ogg,.flac';
    input.onchange = () => input.files?.[0] && setFile(i, input.files[0]);
    input.click();
  }

  function save() {
    saveKit(kit);
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
          <button onClick={back}>← Kits</button>
          <input
            value={kit.name}
            onChange={(e) => {
              setKit((k) => ({ ...k, name: e.target.value }));
              setDirty(true);
            }}
            style={{ fontSize: 16, width: 240 }}
          />
        </div>
        <button className="primary" onClick={save} disabled={!dirty}>
          Save
        </button>
      </div>

      <div className="slot-grid">
        {kit.slots.map((slot, i) => (
          <div
            key={i}
            className={'slot' + (dragOver === i ? ' dragover' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(i);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(i, e)}
          >
            <div className="row between">
              <span className="muted small">Pad {i + 1}</span>
              <button onClick={() => auditionPad(loaded, i)} disabled={!loaded?.buffers[i]} title="Audition">
                ▶
              </button>
            </div>
            <input value={slot.role} onChange={(e) => patchSlot(i, { role: e.target.value })} placeholder="Role" />
            <div className={'file' + (slot.sound.type === 'user' ? ' user' : '')} title={slot.sound.type === 'user' ? slot.sound.name : slot.sound.file}>
              {slot.sound.type === 'user' ? slot.sound.name : slot.sound.file}
              {loaded && !loaded.buffers[i] ? ' (missing)' : ''}
            </div>
            <div className="row">
              <button onClick={() => pick(i)}>Replace…</button>
              {slot.sound.type === 'user' && <button onClick={() => patchSlot(i, { sound: DEFAULT_KIT.slots[i].sound })}>Reset</button>}
              <label className="field small" title="Gain">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={slot.gain ?? 1}
                  onChange={(e) => patchSlot(i, { gain: Number(e.target.value) })}
                  style={{ width: 60, padding: 0 }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <p className="muted small">Drop a WAV/MP3 on a slot or use Replace. Uploaded samples stay in this browser and are never exported.</p>
    </div>
  );
}
