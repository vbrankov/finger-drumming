# Finger Drumming — Manual

**App:** https://vbrankov.github.io/finger-drumming/ · **Code:** https://github.com/vbrankov/finger-drumming

A practice tool for finger drumming on a 4×4 pad controller. You build or
import short **patterns** (1–4 bars), chain them into **songs**, then play
them on the pads while the app grades every hit in milliseconds and shows you
whether you rushed or dragged. It runs in the browser; nothing is installed
and nothing is uploaded anywhere.

Contents: [Getting started](#getting-started) · [Playing along](#playing-along) ·
[Patterns](#patterns) · [The pattern editor](#the-pattern-editor) ·
[Songs](#songs) · [Kits](#kits) ·
[The sound library](#the-sound-library) · [Sharing](#sharing) ·
[Making songs with AI](#making-songs-with-ai) · [Your data](#your-data) ·
[Tablets, keyboard, touch](#tablets-keyboard-touch) · [Questions](#questions)

---

## Getting started

1. Open the app in **Chrome or Edge** (Firefox works except for MIDI). Plug in
   your controller first.
2. Allow MIDI when the browser asks. The top bar shows the connected device.
3. **Settings → MIDI.** Most 4×4 controllers send notes 36–51 (bottom-left =
   36), which is preset. Tap a pad on screen and hit it on the controller to
   change a mapping; *Reset to standard* puts it back.
4. **Settings → Calibration.** Press *Start*, tap any pad on every click for
   8 bars, press *Use this*. This measures your controller's and sound card's
   latency (typically −20 to −40 ms) so the app grades what you *hear*, not
   what the cable says. Do this once per device.
5. **Settings → Dynamics** (optional). Hit a pad 8 times softly, then 8 times
   hard, so the app knows what ghost notes and accents look like from you.
6. Go to **Patterns**, pick *Basic Rock*, press *Practice*, then *Start*.

## Playing along

The practice screen shows the pattern as a grid — one row per drum, one
column per 16th note, the beats numbered 1–4 — and your 16 pads below it.

- **Start** gives a one-bar count-in, then the pattern **loops** until you
  stop. Every loop is a *pass* and is graded on its own.
- **Play-along** lets you hear the pattern's drums while you play;
  **Solo** plays only the click and your own hits. **Click** toggles the
  metronome.
- **Tempo** overrides the song's tempo for this session. Your best score is
  only saved at the song's own tempo, so the number means something.

**Feedback appears the instant you hit.** A cell fills with your offset in
milliseconds:

- **◂17** you were 17 ms **early** (rushing) — the cell leans **blue**.
- **17▸** 17 ms **late** (dragging) — the cell leans **red**.
- Green is on time. The colour saturates toward the edge of the timing window.
- **✕** on red: you missed that hit. **✕** on a plain cell: you hit something
  that wasn't in the pattern (a stray, or the wrong drum).
- The grid is cleared when a pass ends, so each loop starts clean.
- Hi-hats choke each other: a closed hat cuts a ringing open hat, as on a
  real kit.

**Dynamics.** Patterns can mark hits as ghost notes (**·**, played quietly)
and accents (**▲**, played hard). When you play with a controller, a small
mark in the corner of each graded cell shows the level you actually played —
**orange** if it wasn't what was written. This is shown, not scored (yet).

**Score.** The sum of your three worst errors in the pass, in ms. A miss or a
stray hit counts 1000. Lower is better; 0 is perfect. *Best* is your record
for this song at its own tempo.

**Timing window.** A hit counts as "that note" if it's within half a step
(capped at 150 ms) — at 90 bpm that's ±83 ms. Outside the window it is a miss
plus a stray. The window is shown in the stats bar.

**Which pad?** The default kit has two Kick pads, two Snares, two Closed
Hats, two Sidesticks — the standard mirror layout, so either hand can play
the core drums. Pads with the same name are the **same drum**: hit either
one, it counts and lands in the same row.

**The handle** between the grid and the pads drags to trade grid height for
pad size; double-click resets it.

## Patterns

The Patterns list shows every pattern with author, difficulty (● dots),
tempo, kit, and your best score, easiest first. Per pattern: **Practice**,
**Edit**, **Share** (copies a link), **Delete**. Tick patterns and **Copy N
as text** to share several at once (see [Sharing](#sharing)). **+ New
pattern** opens the editor on an empty bar.

Twenty-plus rhythms ship with the app, from *Four on the Floor* (difficulty
1) to *Linear Funk* (5), including swung feels (*Blues Shuffle*, *Jazz Ride*,
*Swung Hip Hop*) and four-bar **phrases** with fills (*Basic Rock Phrase*,
*Money Beat Phrase*). Editing a built-in pattern edits your copy. A pattern
can't be deleted while a song uses it.

## The pattern editor

Fields: name, author, difficulty, **BPM**, **Bars** (1–4), **Swing**, **Kit**.

- **Click** an empty cell to add a hit; **click** a hit to remove it.
- **Press and drag up or down** on a cell to set its velocity — like Ableton.
  The number shows while you drag; the cell's brightness follows it.
  Velocity ≥ 112 is an **accent** (▲), < 64 a **ghost** (·).
- **Preview** loops the pattern with the click. Clicking a row label plays
  that drum.
- **Bars**: up to four. The grid shows them side by side with a divider.
  Shrinking a song drops the hits past the new end (it asks first).
- **Swing**: 50 % is straight; 66 % is a triplet feel; 54–58 % is the subtle
  swing of hip-hop and funk. Choose whether the **16ths** swing (hip-hop,
  funk, trap) or the **8ths** (shuffle, jazz). The grid looks the same; the
  timing changes.
- **All 16 pads**: by default the editor shows one row per drum, like the
  practice screen. Tick this to place hits on specific pads, e.g. to write a
  left/right hand pattern.

Everything is on a 16th-note grid in 4/4. Triplet feels are written with
swing rather than a triplet grid.

## Songs

A song is a **sequence of patterns**, each repeated some number of times:
`Basic Rock ×3 · One-beat Fill · Money Beat ×3 · Rock with Fill …`. That's how
grooves are actually played — a few bars of groove, a fill, the next section
— and it's where transitions get practised.

**Song editor:** name, author, difficulty, **BPM** (the whole song plays at
this tempo; each pattern keeps its own swing), **Kit** (all patterns play on
it). Then the sections: pick a pattern, set its repeat count, reorder with
▲▼, duplicate, remove. *Preview* loops the whole song. Patterns are shared by
reference — edit a pattern and every song using it changes.

**Practising a song** works like a pattern, plus:

- A **structure strip** above the grid shows the sections; the current one
  is highlighted with its repeat count (2/4).
- The grid **scrolls**: the playhead stays put a little in from the left,
  half a bar of what you just played trails behind it, and two bars of what's
  coming slide in from the right, with the next pattern's name above its bar
  line. A ↺ marks where the loop restarts.
- **Loop modes**: *Whole song*; *Section* (click a section in the strip);
  *Section + next* — the fill *and* the bar you land on, which is the thing
  worth drilling.
- Each section gets its own score (worst three hits) shown in the strip; the
  pass score is their average. *Best* is recorded only for whole-song loops at
  the song's own tempo.

One song ships with the app (*Rock Song*) as a template. Sharing a song
includes all its patterns.

## Kits

A kit is the 16 pads: a **role name** and a **sound** for each, plus optional
**pitch** (♭/♯, semitones) and **gain**. Every song is written for a kit;
change it in the editor's *Kit* field.

The **default kit** is the layout the Quest for Groove course teaches
(bottom row nearest you):

| | | | |
|---|---|---|---|
| Low Tom | Mid Tom | High Tom | Crash |
| Closed Hat | Open Hat | Closed Hat | Ride |
| Sidestick | Snare | Snare | Sidestick |
| Crash 2 | **Kick** | **Kick** | Cymbal |

Thumbs on the kicks, index fingers on the snares, middle fingers on the hats.
Either of a doubled pad counts when playing.

**Kits screen:** *Edit*, *Duplicate* (the easy way to make a variant),
*Share*, *Delete* (refused while a song uses it). The default kit can be
edited and *Reset* to the shipped version. **Kit editor:** per pad, a role
name, a picker over the bundled library grouped by family, *Upload a file…*
or drop a WAV/MP3 on the pad, ♭/♯ pitch, a gain slider, and ▶ to audition.

Uploaded samples are stored in your browser only and are **never** included
when you share a kit; those pads fall back to the default sound for the
recipient.

## The sound library

134 one-shot samples from the Sonic Pi collection, all **CC0 (public
domain)**, bundled with the app as WAV so every browser can decode them.
Files are fetched only when a kit uses them.

**Bass Drum** (15): `bd_808`, `bd_ada`, `bd_boom`, `bd_chip`, `bd_fat`, `bd_gas`, `bd_haus`, `bd_jazz`, `bd_klub`, `bd_mehackit`, `bd_pure`, `bd_sone`, `bd_tek`, `bd_zome`, `bd_zum`

**Drum** (20): `drum_bass_hard`, `drum_bass_soft`, `drum_cowbell`, `drum_cymbal_closed`, `drum_cymbal_hard`, `drum_cymbal_open`, `drum_cymbal_pedal`, `drum_cymbal_soft`, `drum_heavy_kick`, `drum_roll`, `drum_snare_hard`, `drum_snare_soft`, `drum_splash_hard`, `drum_splash_soft`, `drum_tom_hi_hard`, `drum_tom_hi_soft`, `drum_tom_lo_hard`, `drum_tom_lo_soft`, `drum_tom_mid_hard`, `drum_tom_mid_soft`

**Snare** (4): `sn_dolf`, `sn_dub`, `sn_generic`, `sn_zome`

**Hi-Hat** (21): `hat_bdu`, `hat_cab`, `hat_cats`, `hat_gem`, `hat_gnu`, `hat_gump`, `hat_hier`, `hat_len`, `hat_mess`, `hat_metal`, `hat_noiz`, `hat_psych`, `hat_raw`, `hat_sci`, `hat_snap`, `hat_star`, `hat_tap`, `hat_yosh`, `hat_zan`, `hat_zap`, `hat_zild`

**Ride** (2): `ride_tri`, `ride_via`

**Percussion** (10): `perc_bell`, `perc_bell2`, `perc_door`, `perc_impact1`, `perc_impact2`, `perc_snap`, `perc_snap2`, `perc_swash`, `perc_swoosh`, `perc_till`

**Tabla** (26): `tabla_dhec`, `tabla_ghe1` … `tabla_ghe8`, `tabla_ke1` … `tabla_ke3`, `tabla_na`, `tabla_na_o`, `tabla_na_s`, `tabla_re`, `tabla_tas1` … `tabla_tas3`, `tabla_te_m`, `tabla_te_ne`, `tabla_te1`, `tabla_te2`, `tabla_tun1` … `tabla_tun3`

**Electronic** (25): `elec_beep`, `elec_bell`, `elec_blip`, `elec_blip2`, `elec_blup`, `elec_bong`, `elec_chime`, `elec_cymbal`, `elec_filt_snare`, `elec_flip`, `elec_fuzz_tom`, `elec_hi_snare`, `elec_hollow_kick`, `elec_lo_snare`, `elec_mid_snare`, `elec_ping`, `elec_plip`, `elec_pop`, `elec_snare`, `elec_soft_kick`, `elec_tick`, `elec_triangle`, `elec_twang`, `elec_twip`, `elec_wood`

**Glitch** (8): `glitch_bass_g`, `glitch_perc1` … `glitch_perc5`, `glitch_robot1`, `glitch_robot2`

**Misc** (3): `misc_burp`, `misc_cineboom`, `misc_crow`

All files are `.wav` (16-bit, 44.1 kHz). The default kit uses `drum_heavy_kick`,
`drum_snare_hard`, `drum_cymbal_closed/open/hard/soft`, `drum_splash_hard/soft`,
`drum_tom_*_hard` and `drum_sidestick` (a CC0 cross-stick from freesound.org by KEVOY; the Sonic Pi set has no recorded one).

## Sharing

There is no account and no server; sharing is by **text**.

- **Share** on a pattern, song or kit copies a link. Whoever opens it gets
  the item added to their library and opened for practice. A song brings its
  patterns; a non-default kit travels with whatever uses it.
- **Copy N as text** (tick patterns, songs or kits first) copies one token
  like `fd2:z7ZZPi9swEMW…` — a few hundred characters per pattern, under a
  thousand for a whole song. Post it anywhere.
- **Settings → Data → Paste**: paste any text containing tokens
  or links — a whole forum comment is fine — and press *Import pasted*. Items
  you already have are skipped.
- **Conflicts.** If an incoming pattern, song or kit has the same identity as one you
  have but differs (someone posted an updated version, or you edited yours),
  a dialog lets you **Replace mine**, **Keep both** (adds a copy marked
  "(imported)"), or **Skip** — per item or for all.
- The token starts with a version (`fd2`); a token from a newer app version
  is refused with a message rather than misread, and older `fd1` tokens still
  import.
- *Export* / *Import* in Settings save and load your whole library as a JSON
  file — use it for backups or moving to another device.

The format is documented in [FORMAT.md](FORMAT.md).

## Making songs with AI

You don't need to click in patterns by hand. Any AI assistant that can write
text can write patterns — and songs made of them — for the app.

1. Copy the prompt below into your assistant.
2. Say what you want: *"a slow reggae one drop at 72 bpm"*, *"three funk
   grooves with ghost notes, difficulty 3"*, *"a 4-bar rock phrase with a tom
   fill in the last bar"*.
3. Copy the `fd2:…` line it gives you into **Settings → Data → Paste** and
   press *Import pasted*.
4. Practise. If it's wrong, tell the assistant what to change — or fix it in
   the editor.

The prompt:

> You are writing drum patterns for the Finger Drumming app. Output ONE line
> starting with `fd2:j` followed by base64url (no padding) of a JSON object
> `{"v":2,"t":"pack","items":[…]}`. Each item is
> `{"v":2,"t":"pattern","pattern":{…}}`. A pattern has: `id` (stable slug),
> `name`, `author`, `difficulty` 1–5, `bpm`, optional `bars` 1–4, optional
> `swing` `{amount 50–75, unit "sixteenth"|"eighth"}`, and `hits`: a list of
> `{pad, step, velocity?}` with `step` a 16th note from 0 to bars×16−1 (beat 1
> = 0, beat 2 = 4, beat 3 = 8, beat 4 = 12) and `velocity` 40 for ghost notes,
> 127 for accents, omitted for normal. Pads: Kick 13, Snare 9, Closed Hat 4,
> Open Hat 5, Ride 7, Crash 3, Sidestick 8, Low/Mid/High Tom 0/1/2. Do not
> place two hits on the same pad and step. To also arrange patterns into a
> song, add an item `{"v":2,"t":"song","song":{id,name,author,bpm,sections:[{patternId,repeat},…]},"patterns":[…the patterns it uses…]}`.
> Also show each pattern as a readable grid so I can check it.

If the assistant can't produce base64, ask it for the JSON only and paste
that into the Python snippet in [FORMAT.md](FORMAT.md#6-producing-a-token).

## Your data

Everything — patterns, songs, kits, scores, settings, calibration, uploaded samples —
lives in your browser's storage for this site. Nothing is sent anywhere.
Consequences: each browser and device has its own library (use share links,
packs or Export/Import to move things); clearing site data erases it; an
uploaded sample exists only where you uploaded it.

## Tablets, keyboard, touch

- The on-screen pads respond to touch (multi-touch, on press) and to the
  keyboard: `1234` / `QWER` / `ASDF` / `ZXCV` mirror the 4×4, keys shown on
  the pads.
- Touch and keys have no velocity; they always count as normal dynamics and
  get no dynamics mark.
- Calibrate on the tablet too — its latency differs from the PC's. The
  calibration screen has a tap target.
- **Android Chrome:** MIDI controllers work over USB. **iPad:** Safari has no
  Web MIDI, so it's pads and keys only.
- Drag the handle above the pads to size them for your screen.

## Questions

**My controller plays nothing in Practice but calibration works.** Its notes
aren't mapped. Practice shows an orange banner with the note number; use
*Settings → MIDI* to map or reset to standard. Check the controller is on pad
bank A.

**Every hit reads 30 ms late.** Run calibration.

**The same pattern feels wrong on the tablet.** Calibrate there separately.

**Can I use my own drum sounds?** Yes — upload to a kit slot. They stay on
your device and aren't shared.

**Triplets? 3/4?** Triplet feel: use swing 66 %. Other time signatures aren't
supported yet. Patterns are up to 4 bars; songs chain as many as you like.

**Is the code open?** MIT licence; samples are CC0. Repository link at the top.
