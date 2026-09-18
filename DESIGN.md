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
type Step     = 0..bars*16-1;    // 16th notes from the start of the song

interface Song {
  id: string;
  name: string;
  author?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5; // set by the author; a judgment, not computed
  bpm: number;                    // default tempo; best score is only kept at this tempo
  bars?: number;                  // 1..4 bars of 4/4, default 1
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

Later extensions that must not break this: stacking blocks into a song
structure, other time signatures / triplet grids (a `resolution` field on the
song).

## Sounds

Samples only; no synthesizer.

1. **Bundled samples** — the full percussive part of the Sonic Pi CC0
   collection (134 one-shots, ~7 MB) in `public/sounds/`, listed in
   `src/sounds/manifest.json` (regenerate with `npm run sounds`). Files are
   fetched only when a kit uses them. The kit editor offers them in a picker
   grouped by family, so a kit built from bundled sounds is fully shareable
   and plays identically for everyone. The **default kit**
   (`src/kits/default.json`) uses the Quest for Groove mirror layout, the most
   common finger-drumming convention (bottom row nearest the player):

   | Low Tom | Mid Tom | High Tom | Crash |
   |---|---|---|---|
   | Closed Hat | Open Hat | Closed Hat | Ride |
   | Sidestick | Snare | Snare | Sidestick |
   | Crash 2 | Kick | Kick | Cymbal |

   It is the fallback whenever a song's kit or a slot's sample is missing.
2. **User samples** — in the kit editor, drop a WAV/MP3 onto a slot or pick
   *Upload a file…*. Stored as a blob in IndexedDB, referenced by `blobId`.
   The app never distributes user audio; exports and share links replace such
   slots with the default kit's sound.

Sounds by URL were considered and left out: CORS makes most hosts fail
silently, links rot, and it would have the app fetch audio from arbitrary
sites. The bundled library covers the need without any of that.

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
calibration routine: metronome clicks for 8 bars, user taps along, and the
offsets to the nearest beat are combined with a MAD-weighted robust mean
(median M, D = median |x − M|; weight 1 within D, else D / |x − M|), stored as
`calibrationMs`. Every measured offset in practice has `calibrationMs`
subtracted. The value is normally negative: the tap timestamp is already
mapped to what was audible at that instant, so the remainder is how early you
tap to make your own sound coincide with the click. Day-one feature.

## Practice

**Modes**
- *Play-along* — song drums + metronome + your hits, all audible.
- *Solo* — metronome + your hits only. Grading is identical.

**Flow.** Pick a song, choose tempo (defaults to `song.bpm`), press start.
One-bar count-in, then the song (all its bars) **loops continuously** until
stopped. A pass is one full run through the song. Each
pass is graded independently and the display updates as each pass completes.

**Grading one pass** (pure function, unit-tested)

- `stepDur = 60 / bpm / 4` seconds, `passDur = bars · 16 · stepDur`.
- Match window `W = min(stepDur / 2, 0.150)` seconds.
- A player hit at audio time `t` (after calibration) belongs to the pass `p`
  where `t ∈ [pStart − W, pEnd − W)`. This sends early hits for the next pass's
  step 0 to the next pass and keeps late hits for step 15 in this one. Since
  `W ≤ stepDur / 2` there is no ambiguity. A pass is finalised at `pEnd + W`.
- For each **pad group**: expected times `pStart + step · stepDur`; player
  hits in that group. Greedy match by smallest `|offset|` within `W`; each hit
  and each expectation is used at most once. Pads whose kit role names are
  equal form one group, so in a mirror layout the two Kick pads are the same
  drum: hitting either satisfies the expectation. A matched hit is reported on
  the expected pad's cell.
- Errors, in ms:
  - matched hit → `|offset|` (sign kept for display: early / late)
  - unmatched expectation → **miss, 1000**
  - unmatched player hit → **extra, 1000** (so a wrong pad = miss + extra)
- **Score = sum of the 3 largest errors.** Lower is better. Fewer than 3
  items → sum what exists.

**Best score** is stored per song, only when practising at `song.bpm`.

**Display.** The same 16-pad × (bars·16)-step grid as the editor, bars side
by side with a divider, with a playhead. At 3–4 bars the cells are too narrow
for numbers, so colour alone carries the verdict (the tooltip keeps the ms).
Feedback is immediate: the instant a hit arrives it is matched to the nearest
unclaimed expectation of that drum within the window and its cell fills with
the offset in ms with an arrow (◂ early, late ▸) on a background that is
green when on time and leans blue the more you rushed, red the more you
dragged, saturating at the window edge; a miss turns its
cell red the moment its window expires; an extra appears at once in its landing
cell. The previous pass stays visible dimmed and is overwritten cell by cell as
the next pass sweeps through. The pass score is computed from the full greedy
grading at pass end (which can differ from the live verdicts only when two hits
compete for one expectation). A 4×4 pad mirror flashes on every
hit so you can see mapping problems immediately. Header shows mode, tempo,
last score, best score.

## Song editor

Fields: name, author, difficulty, bpm, **bars** (1–4), **kit** (dropdown of
all kits). Below, 16 pad rows labelled by the chosen kit's roles × bars·16 step
columns. Reducing bars drops the hits past the new end, after a confirm. Click to toggle a hit; click the
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

## Sharing

Share links carry the content in the URL fragment: `…/#s=<deflate+base64url
JSON>`. A song link holds the song and, if it is not the default kit, its kit
(roles and bundled sounds only; uploaded samples fall back to the default).
A kit link holds a kit. Opening a link adds the content to the visitor's
library — without duplicating something they already have — and opens it.
Nothing is uploaded anywhere; there is no server. *Share* buttons on the Songs
and Kits lists copy the link.

## Screens

Top-level navigation: **Songs** · **Kits** · **Settings**.

**Songs** — the first screen. Lists every song with name, author, difficulty,
bpm, kit name, hit count and best score. Per row: *Practice*, *Edit*, *Share*,
*Delete*. A *New song*
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

Recording from pads, more than 4 bars, sections/arrangement, a
synthesizer, sample-library search, accounts or cloud, per-tempo score
tables, per-kit MIDI note maps.
