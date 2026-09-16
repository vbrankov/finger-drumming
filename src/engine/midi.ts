export interface MidiHit {
  note: number;
  velocity: number;
  /** performance.now() clock, ms */
  perfTime: number;
  deviceId: string;
  deviceName: string;
}

export interface MidiInputInfo {
  id: string;
  name: string;
}

type Listener = (hit: MidiHit) => void;

let access: MIDIAccess | null = null;
let deviceFilter: string | null = null;
const listeners = new Set<Listener>();
const deviceListeners = new Set<() => void>();
const attached = new WeakSet<MIDIInput>();

export async function initMidi(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!navigator.requestMIDIAccess) {
    return { ok: false, error: 'Web MIDI is not supported in this browser. Use Chrome or Edge.' };
  }
  try {
    access = await navigator.requestMIDIAccess();
  } catch (e) {
    return { ok: false, error: 'MIDI access denied: ' + (e as Error).message };
  }
  access.inputs.forEach(attach);
  access.onstatechange = (e) => {
    const port = e.port;
    if (port && port.type === 'input' && port.state === 'connected') attach(port as MIDIInput);
    deviceListeners.forEach((fn) => fn());
  };
  return { ok: true };
}

function attach(input: MIDIInput): void {
  if (attached.has(input)) return;
  attached.add(input);
  input.onmidimessage = (e) => {
    const data = e.data;
    if (!data || data.length < 3) return;
    const [status, note, velocity] = data;
    if ((status & 0xf0) !== 0x90 || velocity === 0) return; // Note On only
    if (deviceFilter && input.id !== deviceFilter) return;
    const hit: MidiHit = {
      note,
      velocity,
      perfTime: e.timeStamp,
      deviceId: input.id,
      deviceName: input.name ?? input.id,
    };
    listeners.forEach((fn) => fn(hit));
  };
}

export function listMidiInputs(): MidiInputInfo[] {
  if (!access) return [];
  return [...access.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? i.id }));
}

export function setMidiDeviceFilter(id: string | null): void {
  deviceFilter = id;
}

export function onMidiHit(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onMidiDevicesChanged(fn: () => void): () => void {
  deviceListeners.add(fn);
  return () => deviceListeners.delete(fn);
}
