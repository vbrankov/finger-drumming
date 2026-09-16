# Finger Drumming — Design

Personal practice tool for a 4×4 pad controller. Web app, Chrome/Edge on
desktop; tablets via the same web app (see *Platforms*). Two halves: a **song
editor** and a **song practicer** that grades timing.

Anything not written down here is open.

## Principles

- **A song is data, not audio.** Hits reference pad slots (0–15). A song names
  the kit it was written for by id, nothing more. Songs never reference sound
  files, so sharing a song shares no audio.
- **Kits are their own editable area.** A kit is 16 slots, each with a role
  name and a sample. Songs and kits are edited separately; a song picks a kit.
  If a song's kit is missing, the bundled default kit is used.
- **Timing accuracy is the product.** Everything in the audio/MIDI path is built
  around one clock and a calibration step. Nothing else matters if the ms
  numbers are wrong.
- **Minimal stack.** Vite + React + TypeScript. Raw Web Audio and Web MIDI. No
  audio framework, no synthesizer — samples only.

## Data model

```ts
type PadIndex = 0..15;           // 4×4 grid, row-major, 0 = top-left
type Step     = 0..15;           // 16th notes, one 4/4 measure

interface Song {
  id: string;
  name: string;
  bpm: number;                    // default tempo; best score is only kept at this tempo
  kitId: string;                  // falls back to the default kit if not found
  hits: { pad: PadIndex; step: Step; velocity?: number }[];
  createdAt: string; updatedAt: string;   // ISO
}

type SoundRef =
  | { type: 'bundled'; file: string }               // public/sounds/<file>, ships with the app
  | { type: 'user'; blobId: string };               // uploaded, stored in IndexedDB

interface Kit {
  id: string;
  name: string;
  slots: { role: string; sound: SoundRef; gain?: number }[];   // length 16
  createdAt: string; updatedAt: string;
}

interface Settings {
  calibrationMs: number;          // subtracted from measured hit offsets
  midiDeviceId: string | null;    // null = all inputs
  noteMap: Record<number, PadIndex>;   // MIDI note → pad; global, it's about the controller
}

interface ScoreRecord { best: number; bpm: number; at: string }
type Scores = Record<Song['id'], ScoreRecord>;
```

Later extensions that must not break this: multiple measures (`hits.step`
grows beyond 15 or gains a `measure`), stacking measures into a song, other
time signatures / triplet grids (a `resolution` field on the song).

## Sounds

Samples only; no synthesizer.

1. **Bundled samples** — WAV/MP3 files in `public/sounds/`, supplied by the
   project owner. The **default kit** (`src/kits/default.json`) wires 16 of
   them to the 16 slots with role names. It is the fallback whenever a song's
   kit or a slot's sample is missing. (If the repo is ever made public, these
   files must be redistributable.)
2. **User samples** — in the kit editor, drop a WAV/MP3 onto a slot. Stored as
   a blob in IndexedDB, referenced by `blobId`. The app never distributes user
   audio.

All samples are decoded to `AudioBuffer`s once at load. Playback is one-shot,
velocity → gain. Choke groups (open hat cut by closed hat) are a later nicety.

## Audio scheduling

Standard lookahead scheduler: a `setInterval` (~25 ms) walks the song and
schedules every hit / metronome tick that falls in the next ~100 ms at exact
`AudioContext.currentTime` values. All musical time is expressed in the audio
clock; nothing is timed off `setTimeout`.

## Input sources and clocks

Three input sources, all graded identically because each carries an
`event.timeStamp` on the `performance.now()` clock:

1. **MIDI controller** — primary on desktop. Note On with velocity > 0, mapped
   to a pad through the global note map.
2. **On-screen pads** — a 4×4 grid on the Practice screen. `pointerdown`
   (press, not release) so it responds like an instrument and supports
   multi-touch. Primary on tablets.
3. **Keyboard** — `1234` / `QWER` / `ASDF` / `ZXCV` as a 4×4 block. Lets two
   hands play without hardware.

Timestamps are converted to the audio clock with `ctx.getOutputTimestamp()`
(`audioTime = contextTime + (perfNow − performanceTime) / 1000`).

**Calibration.** Systematic error = controller input latency + audio output
latency (`ctx.outputLatency`, ~10–40 ms on Windows). The Settings screen has a
calibration routine: metronome clicks for 8 bars, user taps along, we take the
median offset of the taps and store it as `calibrationMs`. Every measured
offset in practice has `calibrationMs` subtracted. Day-one feature.

## Practice

**Modes**
- *Play-along* — song drums + metronome + your hits, all audible.
- *Solo* — metronome + your hits only. Grading is identical.

**Flow.** Pick a song, choose tempo (defaults to `song.bpm`), press start.
One-bar count-in, then the measure **loops continuously** until stopped. Each
pass is graded independently and the display updates as each pass completes.

**Grading one pass** (pure function, unit-tested)

- `stepDur = 60 / bpm / 4` seconds, `passDur = 16 · stepDur`.
- Match window `W = min(stepDur / 2, 0.150)` seconds.
- A player hit at audio time `t` (after calibration) belongs to the pass `p`
  where `t ∈ [pStart − W, pEnd − W)`. This sends early hits for the next pass's
  step 0 to the next pass and keeps late hits for step 15 in this one. Since
  `W ≤ stepDur / 2` there is no ambiguity. A pass is finalised at `pEnd + W`.
- For each pad: expected times `pStart + step · stepDur`; player hits on that
  pad. Greedy match by smallest `|offset|` within `W`; each hit and each
  expectation is used at most once.
- Errors, in ms:
  - matched hit → `|offset|` (sign kept for display: early / late)
  - unmatched expectation → **miss, 1000**
  - unmatched player hit → **extra, 1000** (so a wrong pad = miss + extra)
- **Score = sum of the 3 largest errors.** Lower is better. Fewer than 3
  items → sum what exists.

**Best score** is stored per song, only when practising at `song.bpm`.

**Display.** The same 16-pad × 16-step grid as the editor, with a playhead.
After each pass, expected cells show the signed offset in ms coloured on a
gradient (green ≤ 15 ms → amber ~ 50 ms → red ≥ W), misses in red, extras drawn
in their landing cell in a distinct colour. A 4×4 pad mirror flashes on every
hit so you can see mapping problems immediately. Header shows mode, tempo,
last score, best score.

## Song editor

Fields: name, bpm, **kit** (dropdown of all kits). Below, 16 pad rows labelled
by the chosen kit's roles × 16 step columns. Click to toggle a hit; click the
row label to audition that slot. Changing the kit relabels the rows and changes
the sounds; hits stay where they are. Preview play loops the measure with the
metronome. Save writes the song.

## Kit editor

Fields: name. 16 slots in a 4×4 layout matching the controller. Per slot:
role name (editable), current sound (bundled or uploaded file name), drop
zone / file picker to replace it, *reset to bundled default*, audition button.
*Duplicate kit* is the easy way to make a variant. The default kit is editable
too; *Reset default kit* restores it from the shipped JSON.

## Storage

- `localStorage`: songs, kits, scores, settings — one JSON document per key.
  This is the source of truth the app reads and writes.
- **Seeds** ship with the app: songs as `src/songs/*.json`, kits as
  `src/kits/*.json` (authored by hand or by Claude). On startup, any seed whose
  `id` is not already in localStorage is copied in. Editing a seed edits the
  local copy; the seed is not touched, and new seeds added later appear
  automatically.
- `IndexedDB`: user sample blobs keyed by `blobId`.
- Export/import: songs (and optionally scores) as a JSON file. Kits export as
  role names + bundled file names only, never blobs — an imported kit whose
  slots pointed at user samples falls back to the default sample for that slot.

## Screens

Top-level navigation: **Songs** · **Kits** · **Settings**.

**Songs** — the first screen. Lists every song with name, bpm, kit name, hit
count and best score. Per row: *Practice*, *Edit*, *Delete*. A *New song*
button opens the song editor on an empty measure with the default kit
selected. Sorted by last updated.

**Kits** — lists every kit with name and how many slots use user samples. Per
row: *Edit*, *Duplicate*, *Delete* (refused if any song uses it; the default
kit can't be deleted). A *New kit* button starts from a copy of the default.

**Song editor**, **Kit editor**, **Practice** as described above.

**Settings** — MIDI device selector, MIDI learn (4×4 pad grid: click a pad,
hit the controller), calibration routine, export/import.

## Build order

1. Audio engine: sample loading/decoding, one-shot player, lookahead
   scheduler, metronome (a short bundled click sample, accented on beat 1).
2. MIDI input, clock bridge, calibration routine.
3. Song model + grading as pure functions with tests (vitest).
4. Practice screen.
5. Editor.
6. Kit list + kit editor with sample drop (IndexedDB).
7. Song list, seeds, persistence, export/import.

Steps 1–3 are where the risk is; the UI is routine.

## Platforms

- **Desktop Chrome/Edge**: everything, including Web MIDI.
- **Android tablet (Chrome)**: everything, including Web MIDI over USB/BLE.
  Touch-to-sound latency varies by device; calibration absorbs the constant
  part, jitter is what it is.
- **iPad (Safari)**: on-screen pads, keyboard, and everything else — but
  **no Web MIDI** (Safari does not implement it). A controller on iPad needs a
  native wrapper (Capacitor + a CoreMIDI plugin), which is the one reason to
  ever leave the plain web app.
- Path: ship as a **PWA** first (manifest + service worker, installable, works
  offline, samples cached). Wrap with Capacitor only if iPad + controller is
  actually wanted. The engine and screens do not change either way.
- Practice screen must work in landscape on a ~10" screen: pad grid large
  enough for fingers, step grid readable. Not yet tuned.

## Explicitly out of scope for now

Recording from pads, multi-measure songs, sections/arrangement, a
synthesizer, sample-library search, accounts or cloud, per-tempo score
tables, per-kit MIDI note maps.
