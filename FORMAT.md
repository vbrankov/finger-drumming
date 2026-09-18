# Share format — for people and AI agents

This describes the text you get from *Copy as text* / *Share* in Finger
Drumming, and what you need to produce to make songs and kits that the app
can import. It is designed so that an AI assistant (or a script) can write
songs for someone without any special tooling.

**Live app:** https://vbrankov.github.io/finger-drumming/ — import via
*Settings → Data → Paste songs or kits*, or open a share link.

## 1. The token

```
fd1:j<base64url of JSON>       uncompressed — easiest to produce
fd1:z<base64url of deflate>    compressed — what the app produces
```

- `fd1` is the **format version**. The app refuses tokens with a higher
  number ("made with a newer version") rather than misreading them. Always use
  `fd1` for the format in this document.
- After the colon, one character says how the JSON is encoded:
  - `j` — the JSON text, UTF-8, base64url (`+`→`-`, `/`→`_`, no `=` padding).
  - `z` — the JSON deflated with **raw deflate** (no zlib/gzip header), then
    base64url.
- The JSON is a **payload** (section 2).
- A **share link** is the same encoding after `#s=`:
  `https://vbrankov.github.io/finger-drumming/#s=z…` (the `fd1:` prefix is not
  used in links).

The importer scans pasted text for every `fd1:…` token and every `#s=…` link
and ignores everything else, so a token can sit inside a forum post.

## 2. Payloads

```jsonc
// One song (optionally with the kit it needs)
{ "t": "song", "song": Song, "kit": Kit }      // "kit" only if not the default kit

// One kit
{ "t": "kit", "kit": Kit }

// Many at once
{ "t": "pack", "v": 1, "items": [ …song and kit payloads… ] }
```

### Song

```jsonc
{
  "id": "my-groove-1",        // optional but recommended: lets the app recognise updates (see §5)
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

- **`step`**: a 16th note counted from the start of the song, `0 … bars*16-1`.
  In 4/4: step 0 is beat 1, step 4 is beat 2, step 8 beat 3, step 12 beat 4;
  odd steps are the "e" and "a", steps 2/6/10/14 the "&". Bar 2 starts at 16.
- **`pad`**: 0–15, see §3. Only the pad's *role* matters for grading (both
  Kick pads are the same drum), so use the first pad of a role unless you are
  writing a hand-specific pattern.
- **`velocity`**: 1–127, default 100 when omitted. The app treats `< 64` as a
  **ghost** note, `≥ 112` as an **accent**, and shows them differently. Use 40
  for ghosts and 127 for accents.
- Two hits on the same pad and step are not meaningful; don't.
- Time signature is always 4/4; resolution is always 16ths. Triplet feels are
  done with swing (§4).

### Kit

```jsonc
{
  "id": "my-kit-1",           // optional but recommended
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

Only include a kit when a song needs one that is not the default layout;
every installation already has the default kit, and songs with no `kit`
payload use it.

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

If a song or kit carries an `id`, the app uses it to recognise the *same*
item later: importing an identical item is skipped silently; importing a
changed item with the same id shows the user a conflict dialog (*Replace
mine* / *Keep both* / *Skip*). So:

- Give your songs stable ids (`author-slug-1` style) and keep them when you
  publish a corrected version.
- Never reuse an id for a different song.
- Items without ids are compared by content only.

## 6. Producing a token

Any language works; here is Python, uncompressed:

```python
import base64, json
payload = {"t": "pack", "v": 1, "items": [
  {"t": "song", "song": {"id": "demo-1", "name": "Demo", "author": "Me", "bpm": 90,
    "hits": [{"pad": 13, "step": 0}, {"pad": 9, "step": 4}, {"pad": 13, "step": 8}, {"pad": 9, "step": 12}]}}
]}
raw = json.dumps(payload, separators=(",", ":")).encode()
print("fd1:j" + base64.urlsafe_b64encode(raw).decode().rstrip("="))
```

JavaScript, in a browser console:

```js
const b64url = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
console.log('fd1:j' + b64url(JSON.stringify(payload)));
```

Compressed tokens (`z`) are ~3× shorter; use raw deflate
(`zlib.compress(raw, wbits=-15)` in Python, `CompressionStream('deflate-raw')`
in browsers) if size matters. A 20-song pack is ~8 KB either way — fine for a
forum comment.

## 7. Prompt for an AI assistant

Paste this, then describe the rhythms you want:

> You are writing drum patterns for the Finger Drumming app. Output ONE line
> starting with `fd1:j` followed by base64url (no padding) of a JSON object
> `{"t":"pack","v":1,"items":[…]}` where each item is
> `{"t":"song","song":{…}}`. A song has: `id` (stable slug), `name`,
> `author`, `difficulty` 1–5, `bpm`, optional `bars` 1–4, optional
> `swing` `{amount 50–75, unit "sixteenth"|"eighth"}`, and `hits`: a list of
> `{pad, step, velocity?}` with `step` a 16th note from 0 to bars×16−1 (beat 1
> = 0, beat 2 = 4, beat 3 = 8, beat 4 = 12) and `velocity` 40 for ghost notes,
> 127 for accents, omitted for normal. Pads: Kick 13, Snare 9, Closed Hat 4,
> Open Hat 5, Ride 7, Crash 3, Sidestick 8, Low/Mid/High Tom 0/1/2. Do not
> place two hits on the same pad and step. Also show the pattern as a
> readable grid so I can check it.

Full description of the app: [MANUAL.md](MANUAL.md).
