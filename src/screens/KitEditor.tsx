import { useState } from 'react';
import type { DragEvent } from 'react';
import { newBlobId, putBlob } from '../engine/blobs';
import { invalidateSound, loadSound } from '../engine/kitLoader';
import type { Kit, KitSlot, SoundRef } from '../model/types';
import { auditionPad, useLoadedKit } from '../hooks';
import manifest from '../sounds/manifest.json';
import { DEFAULT_KIT, saveKit } from '../store';

const FAMILIES = Object.entries(manifest.families) as [string, string][];
const UPLOAD = '\u0000upload';

function soundValue(ref: SoundRef): string {
  return ref.type === 'bundled' ? ref.file : 'user:' + ref.blobId;
}

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
    if (p.pitch !== undefined && loaded?.buffers[i]) {
      auditionPad({ buffers: [loaded.buffers[i]], gains: [kit.slots[i].gain ?? 1], rates: [Math.pow(2, p.pitch / 12)], chokes: [null] }, 0);
    }
  }

  function pickBundled(i: number, file: string) {
    const sound: SoundRef = { type: 'bundled', file };
    patchSlot(i, { sound });
    // Audition the new choice as soon as it is decoded.
    loadSound(sound).then((buf) => buf && auditionPad({ buffers: [buf], gains: [kit.slots[i].gain ?? 1], rates: [Math.pow(2, (kit.slots[i].pitch ?? 0) / 12)], chokes: [null] }, 0));
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
    input.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff';
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
            <select
              className={'sound' + (slot.sound.type === 'user' ? ' user' : '')}
              value={soundValue(slot.sound)}
              onChange={(e) => {
                if (e.target.value === UPLOAD) pick(i);
                else if (!e.target.value.startsWith('user:')) pickBundled(i, e.target.value);
              }}
              title={slot.sound.type === 'user' ? 'Your file: ' + slot.sound.name : slot.sound.file}
            >
              {slot.sound.type === 'user' && <option value={'user:' + slot.sound.blobId}>{'\u2191 ' + slot.sound.name}</option>}
              {FAMILIES.map(([key, label]) => (
                <optgroup key={key} label={label}>
                  {manifest.sounds
                    .filter((s) => s.family === key)
                    .map((s) => (
                      <option key={s.file} value={s.file}>
                        {s.label}
                      </option>
                    ))}
                </optgroup>
              ))}
              <optgroup label="Your own">
                <option value={UPLOAD}>Upload a file…</option>
              </optgroup>
            </select>
            {loaded && !loaded.buffers[i] && <div className="file">(missing — using default)</div>}
            <div className="row">
              {slot.sound.type === 'user' && <button onClick={() => patchSlot(i, { sound: DEFAULT_KIT.slots[i].sound })}>Reset</button>}
              <label className="field small pitch" title="Pitch in semitones">
                <button onClick={() => patchSlot(i, { pitch: Math.max(-24, (slot.pitch ?? 0) - 1) })}>{'\u266d'}</button>
                <span className={slot.pitch ? 'val set' : 'val'}>{(slot.pitch ?? 0) > 0 ? '+' + slot.pitch : (slot.pitch ?? 0)}</span>
                <button onClick={() => patchSlot(i, { pitch: Math.min(24, (slot.pitch ?? 0) + 1) })}>{'\u266f'}</button>
              </label>
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
      <p className="muted small">
        Pick from the bundled library (all CC0), or drop a WAV/MP3 on a slot to use your own. Uploaded samples stay in this browser and are never
        exported or shared.
      </p>
    </div>
  );
}
