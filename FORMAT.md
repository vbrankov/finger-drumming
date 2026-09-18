# Share format — for people and AI agents

This describes the text you get from *Copy as text* / *Share* in Finger
Drumming, and what you need to produce to make patterns, songs and kits the
app can import. It is designed so that an AI assistant (or a script) can
write content for someone without any special tooling.

**Live app:** https://vbrankov.github.io/finger-drumming/ — import via
*Settings → Data → Paste*, or open a share link.

Vocabulary: a **pattern** is 1–4 bars of hits on a 16th-note grid. A **song**
is a sequence of patterns, each repeated some number of times. A **kit** is
the 16 pads' names and sounds.

## 1. The token

```
fd2:j<base64url of JSON>       uncompressed — easiest to produce
fd2:z<base64url of deflate>    compressed — what the app produces
```

- `fd2` is the **format version** (this document). The app refuses tokens
  with a higher number ("made with a newer version") rather than misreading
  them, and still reads `fd1` tokens (§8).
- After the colon, one character says how the JSON is encoded:
  - `j` — the JSON text, UTF-8, base64url (`+`→`-`, `/`→`_`, no `=` padding).
  - `z` — the JSON deflated with **raw deflate** (no zlib/gzip header), then
    base64url.
- The JSON is a **payload** (§2). Every payload carries `"v": 2`.
- A **share link** is the same encoding after `#s=`:
  `https://vbrankov.github.io/finger-drumming/#s=z…` (no `fd2:` prefix; the
  version is read from the payload's `v`).

The importer scans pasted text for every `fd…:` token and every `#s=…` link
and ignores everything else, so tokens can sit inside a forum post.

## 2. Payloads

```jsonc
// One pattern (with its kit only if that is not the default kit)
{ "v": 2, "t": "pattern", "pattern": Pattern, "kit": Kit }

// One song, with every pattern it uses embedded
{ "v": 2, "t": "song", "song": Song, "patterns": [ Pattern, … ], "kit": Kit }

// One kit
{ "v": 2, "t": "kit", "kit": Kit }

// Many at once
{ "v": 2, "t": "pack", "items": [ …pattern, song and kit payloads… ] }
```

### Pattern

```jsonc
{
  "id": "me-groove-1",        // optional but recommended: lets the app recognise updates (§5)
  "name": "My Groove",
  "author": "Your name",      // optional
  "difficulty": 2,            // optional, 1 (easiest) … 5
  "bpm": 96,                  // default tempo; the best score is only kept at this tempo
  "bars": 1,                  // optional, 1 … 4; omit for 1
  "swing": { "amount": 56, "unit": "sixteenth" },   // optional, see §4
  "hits": [
    { "pad": 13, "step": 0 },
    { "pad": 9,  "step": 4, "velocity": 127 },
    { "pad": 9,  "step": 7, "velocity": 40 }
  ]
}
```

- **`step`**: a 16th note counted from the start of the pattern,
  `0 … bars*16-1`. In 4/4: step 0 is beat 1, step 4 is beat 2, step 8 beat 3,
  step 12 beat 4; odd steps are the "e" and "a", steps 2/6/10/14 the "&".
  Bar 2 starts at 16.
- **`pad`**: 0–15, see §3. Only the pad's *role* matters for grading (both
  Kick pads are the same drum), so use the first pad of a role unless you are
  writing a hand-specific pattern.
- **`velocity`**: 1–127, default 100 when omitted. `< 64` is shown as a
  **ghost** note, `≥ 112` as an **accent**. Use 40 for ghosts and 127 for
  accents.
- Two hits on the same pad and step are not meaningful; don't.
- Time signature is always 4/4; resolution is always 16ths. Triplet feels are
  done with swing (§4).

### Song

```jsonc
{
  "id": "me-song-1",
  "name": "My Song",
  "author": "Your name",      // optional
  "difficulty": 3,            // optional
  "bpm": 96,                  // all sections play at this tempo (patterns keep their own swing)
  "sections": [
    { "patternId": "me-groove-1", "repeat": 4 },
    { "patternId": "me-fill-1",   "repeat": 1 },
    { "patternId": "me-groove-2", "repeat": 4 }
  ]
}
```

- Consecutive repeats of the same pattern are one section with a `repeat`.
- Every `patternId` should be in the payload's `patterns` list (the app can
  import a song whose patterns already exist locally — e.g. the built-in
  `seed-*` ids — but a song referring to a pattern nobody has shows "missing").
- The song's kit is the payload's `kit`, or the default kit if absent.

### Kit

```jsonc
{
  "id": "me-kit-1",
  "name": "My Kit",
  "slots": [                  // exactly 16, pad 0 first (top-left), row by row
    { "role": "Low Tom", "sound": { "type": "bundled", "file": "drum_tom_lo_hard.flac" } },
    { "role": "Kick",    "sound": { "type": "bundled", "file": "bd_808.flac" }, "pitch": -2, "gain": 1.2 },
    …
  ]
}
```

- **`role`** is free text; slots with the same role (case-insensitive) are the
  *same drum* for grading and are shown as one row.
- **`sound`** must be `{ "type": "bundled", "file": … }` with a file from the
  bundled library (list in [MANUAL.md](MANUAL.md#the-sound-library)). User
  uploads never travel in shares.
- **`pitch`**: semitones, −24 … 24, optional. **`gain`**: linear, optional,
  default 1.

Include a kit only when the content needs one that is not the default
layout; every installation already has the default kit.

## 3. Pad numbers and the default kit

Pads are numbered row by row from the top-left; on a controller the bottom
row is nearest you (MIDI notes 36–39 on the bottom row, up to 48–51 on top).

| pad | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| role | Low Tom | Mid Tom | High Tom | Crash |

| pad | 4 | 5 | 6 | 7 |
|---|---|---|---|---|
| role | **Closed Hat** | Open Hat | Closed Hat | Ride |

| pad | 8 | 9 | 10 | 11 |
|---|---|---|---|---|
| role | Sidestick | **Snare** | Snare | Sidestick |

| pad | 12 | 13 | 14 | 15 |
|---|---|---|---|---|
| role | Crash 2 | **Kick** | Kick | Cymbal |

Recommended pads when writing for the default kit: **Kick 13, Snare 9,
Closed Hat 4, Open Hat 5, Ride 7, Crash 3, Sidestick 8, toms 0/1/2.**

## 4. Swing

`"swing": { "amount": A, "unit": U }` — omit for straight time.

- `amount`: 50 = straight (same as omitting) … 75 = maximum; **66 ≈ triplet
  feel**; 54–58 is the subtle MPC-style swing used in hip-hop and funk.
- `unit`: `"sixteenth"` delays the odd steps (the "e" and "a") — hip-hop,
  funk, trap. `"eighth"` delays the "&" of each beat (steps 2, 6, 10, 14) —
  shuffle, jazz.

## 5. Ids and updates

If an item carries an `id`, the app uses it to recognise the *same* item
later: importing an identical item is skipped silently; importing a changed
item with the same id shows the user a conflict dialog (*Replace mine* /
*Keep both* / *Skip*). So:

- Give your patterns and songs stable ids (`author-slug-1` style) and keep
  them when you publish a corrected version.
- Never reuse an id for a different item.
- Items without ids are compared by content only.

## 6. Producing a token

Any language works; here is Python, uncompressed:

```python
import base64, json
payload = {"v": 2, "t": "pack", "items": [
  {"v": 2, "t": "pattern", "pattern": {"id": "demo-1", "name": "Demo", "author": "Me", "bpm": 90,
    "hits": [{"pad": 13, "step": 0}, {"pad": 9, "step": 4}, {"pad": 13, "step": 8}, {"pad": 9, "step": 12}]}}
]}
raw = json.dumps(payload, separators=(",", ":")).encode()
print("fd2:j" + base64.urlsafe_b64encode(raw).decode().rstrip("="))
```

JavaScript, in a browser console:

```js
const b64url = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
console.log('fd2:j' + b64url(JSON.stringify(payload)));
```

Compressed tokens (`z`) are ~3× shorter; use raw deflate
(`zlib.compress(raw, wbits=-15)` in Python, `CompressionStream('deflate-raw')`
in browsers) if size matters. A 14-bar song with five patterns is ~750
characters compressed; a 20-pattern pack ~8 KB — fine for a forum comment.

## 7. Prompt for an AI assistant

Paste this, then describe what you want:

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
that into the Python snippet in §6.

## 8. Version 1 (still readable)

Tokens starting `fd1:` and links without `"v"` are version 1. There,
`{"t":"song","song":{…hits…}}` meant what is now a **pattern**; packs were
`{"t":"pack","v":1,"items":[…]}`. The app upgrades them on import. New
content should use version 2.

Full description of the app: [MANUAL.md](MANUAL.md).
