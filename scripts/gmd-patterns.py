"""
Turn the Groove MIDI Dataset (Google Magenta, CC BY 4.0) into practice patterns.

    python scripts/gmd-patterns.py <path to unpacked groove-v1.0.0-midionly>/groove [--dry]

Each GMD file is a human performance: a drummer playing a groove (or a fill)
to a click. A "beat" file is quantised to 16ths and cut into bars; the cells
that appear in most bars are the groove, and if odd and even bars disagree
consistently the groove is two bars long. Velocities become ghost / accent
marks. A "fill" file is taken as it is (one or two bars). Swing is detected
from how late the off-beat 16ths (or 8ths) land.

Output: src/library/gmd.json, one pattern per usable performance, which the
app's Library screen offers for adding to the user's patterns.
"""
import csv
import json
import os
import re
import statistics
import sys
from collections import Counter, defaultdict

import mido

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "library", "gmd.json")


# Roland TD-11 pitches -> default kit pads (see FORMAT.md section 3).
PAD = {
    36: 13,              # kick
    38: 9, 40: 9,        # snare head, rim(shot)
    37: 8,               # cross stick -> sidestick
    48: 2, 50: 2,        # tom 1 -> high tom
    45: 1, 47: 1,        # tom 2 -> mid tom
    43: 0, 58: 0,        # tom 3 (floor) -> low tom
    46: 5, 26: 5,        # open hat (bow, edge)
    42: 4, 22: 4, 44: 4, # closed hat (bow, edge, pedal)
    49: 3, 55: 3,        # crash 1 -> crash
    57: 12, 52: 12,      # crash 2 -> crash 2
    51: 7, 59: 7, 53: 7, # ride (bow, edge, bell)
}
STEPS = 16
MIN_HITS_PER_BAR = 4
MAX_BARS = 4
STYLE_NAME = {
    "afrobeat": "Afrobeat", "afrocuban": "Afro-Cuban", "blues": "Blues", "country": "Country",
    "dance": "Dance", "funk": "Funk", "gospel": "Gospel", "highlife": "Highlife", "hiphop": "Hip-hop",
    "jazz": "Jazz", "latin": "Latin", "middleeastern": "Middle Eastern", "neworleans": "New Orleans",
    "pop": "Pop", "punk": "Punk", "reggae": "Reggae", "rock": "Rock", "soul": "Soul",
}


def load_hits(path):
    """(beat position as float, pad, velocity) for every note-on."""
    m = mido.MidiFile(path)
    tpb = m.ticks_per_beat
    out = []
    for tr in m.tracks:
        t = 0
        for msg in tr:
            t += msg.time
            if msg.type == "note_on" and msg.velocity > 0 and msg.note in PAD:
                out.append((t / tpb, PAD[msg.note], msg.velocity))
    return out


def detect_swing(hits):
    """
    Where the off-beat hits sit inside the beat (0..1). Straight 8ths cluster
    at 0.5; swung 8ths drift towards 0.67 (triplet). Straight 16ths sit at
    0.25 / 0.75; swung 16ths drift towards 0.33 / 0.83. Returns the app's
    swing record or None.
    """
    n = len(hits)
    fr = [b % 1 for b, _p, _v in hits]
    ands = [f for f in fr if 0.42 < f < 0.78]   # "&" candidates
    es = [f for f in fr if 0.15 < f < 0.40]     # "e" candidates (an early "&" is not an "e")
    as_ = [f - 0.5 for f in fr if 0.65 < f < 0.90]  # "a" candidates
    thr = max(8, n * 0.12)
    def tight(xs):
        return percentile(xs, 0.75) - percentile(xs, 0.25) < 0.12
    if len(ands) >= thr and tight(ands):
        c = statistics.median(ands)
        # Swung 8ths: the "&" sits late. A triplet feel also puts hits at 1/3 (the
        # app's step 1 under eighth swing), so "e"s near 0.33 do not contradict it.
        if c > 0.585 and (len(es) < len(ands) / 3 or statistics.median(es) > 0.29):
            return {"amount": int(min(75, round(50 + 100 * (c - 0.5)))), "unit": "eighth"}
    six = es + as_
    if len(six) >= thr and tight(six):
        c = statistics.median(six)
        if 0.305 < c < 0.37:  # under ~61 it is just human timing, not a feel
            return {"amount": int(min(67, round(50 + 200 * (c - 0.25)))), "unit": "sixteenth"}
    return None


def step_offsets(swing):
    """Position of each of the 16 steps within a bar, in beats, under the swing (mirrors timing.ts)."""
    sd = 0.25
    if not swing:
        return [i * sd for i in range(STEPS)]
    s = swing["amount"] / 100
    if swing["unit"] == "sixteenth":
        return [i * sd if i % 2 == 0 else (i - 1) * sd + 2 * sd * s for i in range(STEPS)]
    out = []
    for i in range(STEPS):
        beat = (i // 4) * 4 * sd
        and_ = 4 * sd * s
        out.append([beat, beat + and_ / 2, beat + and_, beat + (and_ + 4 * sd) / 2][i % 4])
    return out


def quantise(hits, swing):
    """Snap every hit to the nearest swung step. -> {bar: {(pad, step): [velocities]}}"""
    bars = defaultdict(lambda: defaultdict(list))
    offs = step_offsets(swing)
    for beat, pad, v in hits:
        bar = int(beat // 4)
        frac = beat - bar * 4
        # Nearest swung step, looking into the neighbouring bars for hits just before a barline.
        k, step = min(((k, i) for k in (-1, 0, 1) for i in range(STEPS)), key=lambda ki: abs(frac - (ki[0] * 4 + offs[ki[1]])))
        b = bar + k
        if b < 0:
            continue
        bars[b][(pad, step)].append(v)
    return bars


def one_hat_per_step(cells):
    """A drummer has one hi-hat: where the open hat plays, drop the closed hat."""
    for (pad, step) in [k for k in cells if k[0] == 5]:
        cells.pop((4, step), None)
    # And one ride/hat vs pedal collision is already merged by the pad map.
    return cells


def majority(bars_list, phase_bars):
    """Cells present in more than half of the given bars, with median velocity."""
    n = len(phase_bars)
    if n == 0:
        return {}
    count = Counter()
    vel = defaultdict(list)
    for b in phase_bars:
        for cell, vs in bars_list[b].items():
            count[cell] += 1
            vel[cell].append(statistics.median(vs))
    return {c: statistics.median(vel[c]) for c, k in count.items() if k > n / 2}


def consistency(bars_list, phase_bars, core):
    """Mean Jaccard similarity between the bars and their core."""
    if not phase_bars:
        return 0
    s = 0
    core_set = set(core)
    for b in phase_bars:
        cells = set(bars_list[b])
        s += len(cells & core_set) / max(1, len(cells | core_set))
    return s / len(phase_bars)


def groove_from_beat(bars):
    """Return (list of bar dicts, consistency) for the best period 1 or 2."""
    ids = sorted(b for b in bars if sum(len(v) for v in bars[b].values()) >= MIN_HITS_PER_BAR)
    if len(ids) < 2:
        return None, 0
    ids = ids[1:] if len(ids) > 4 else ids  # the first bar often has a crash / pickup
    core1 = majority(bars, ids)
    c1 = consistency(bars, ids, core1)
    odd, even = [b for b in ids if b % 2 == 0], [b for b in ids if b % 2 == 1]
    core2 = [majority(bars, odd), majority(bars, even)]
    c2 = (consistency(bars, odd, core2[0]) + consistency(bars, even, core2[1])) / 2
    if len(odd) >= 2 and len(even) >= 2 and c2 > c1 + 0.08 and core2[0] != core2[1]:
        return core2, c2
    return [core1], c1


def fill_from_file(bars):
    ids = sorted(b for b in bars if bars[b])
    if not ids or len(ids) > 2:
        return None
    out = []
    for b in range(ids[0], ids[-1] + 1):
        out.append({c: statistics.median(vs) for c, vs in bars.get(b, {}).items()})
    return out


def percentile(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def dynamics(hits):
    """
    Per pad: how loud this drummer plays it (90th percentile) and whether
    they vary it. A cell is a ghost well below that, an accent at the top of
    a pad that also has softer hits. Drummers and kits differ too much for
    absolute velocities.
    """
    by = defaultdict(list)
    for _b, pad, v in hits:
        by[pad].append(v)
    return {pad: (percentile(vs, 0.9), percentile(vs, 0.25)) for pad, vs in by.items()}


def to_hits(cores, dyn):
    hits = []
    for i, core in enumerate(cores):
        one_hat_per_step(core)
        for (pad, step), v in sorted(core.items(), key=lambda kv: (kv[0][1], kv[0][0])):
            h = {"pad": pad, "step": i * STEPS + step}
            top, low = dyn.get(pad, (v, v))
            if v < 0.5 * top:
                h["velocity"] = 40
            elif v >= 0.9 * top and low < 0.7 * top:
                h["velocity"] = 127
            hits.append(h)
    return hits


def difficulty(hits, bars, bpm):
    per_bar = len(hits) / bars
    d = 1 if per_bar < 8 else 2 if per_bar < 13 else 3 if per_bar < 18 else 4 if per_bar < 24 else 5
    if sum(1 for h in hits if h.get("velocity") == 40) >= 3:
        d += 1
    if bpm >= 160:
        d += 1
    return max(1, min(5, d))


def main():
    root = sys.argv[1]
    dry = "--dry" in sys.argv
    rows = list(csv.DictReader(open(os.path.join(root, "info.csv"), encoding="utf-8")))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    seen = {}
    names = Counter()
    written = []
    skipped = Counter()
    for r in rows:
        if r["time_signature"] != "4-4":
            skipped["time signature"] += 1
            continue
        hits = load_hits(os.path.join(root, r["midi_filename"]))
        if not hits:
            skipped["empty"] += 1
            continue
        swing = detect_swing(hits)
        bars = quantise(hits, swing)
        if r["beat_type"] == "beat":
            cores, c = groove_from_beat(bars)
            # Comping styles (jazz, latin) vary bar to bar; accept a thinner but real core.
            if not cores or not (c >= 0.5 or (c >= 0.35 and sum(len(x) for x in cores) >= 6 * len(cores))):
                skipped["no stable groove"] += 1
                continue
        else:
            cores = fill_from_file(bars)
            if not cores:
                skipped["fill too long"] += 1
                continue
        pattern_hits = to_hits(cores, dynamics(hits))
        n_bars = len(cores)
        if len(pattern_hits) < MIN_HITS_PER_BAR * n_bars:
            skipped["too sparse"] += 1
            continue
        key = (json.dumps(pattern_hits), json.dumps(swing))
        if key in seen:
            skipped["duplicate"] += 1
            continue
        primary, _, secondary = r["style"].partition("/")
        drummer = int(r["drummer"].replace("drummer", ""))
        pid = "gmd-" + r["id"].replace("/", "-")
        seen[key] = pid
        bpm = int(r["bpm"])
        style = STYLE_NAME.get(primary, primary.title())
        kind = "fill" if r["beat_type"] == "fill" else "groove"
        # "Latin samba groove", "Funk groove 3"; a running number keeps names unique.
        word = re.sub(r"[^a-z]", "", secondary.lower())
        word = "" if word in ("", "groove", "beat", "fill") else word
        name = " ".join(x for x in (style, word, kind) if x)  # numbered after sorting, below
        pattern = {
            "id": pid,
            "name": name,
            "author": "Drummer %d, Groove MIDI Dataset" % drummer,
            "style": style,
            "difficulty": difficulty(pattern_hits, n_bars, bpm),
            "bpm": bpm,
            "bars": n_bars,
            "kitId": "default",
            "hits": pattern_hits,
        }
        if swing:
            pattern["swing"] = swing
        if kind == "fill":
            pattern["tags"] = ["fill"]
        written.append(pattern)
    print("written %d, skipped %s" % (len(written), dict(skipped)))
    by = Counter((p["style"], "fill" if "tags" in p else "groove") for p in written)
    for k in sorted(by):
        print("  %-16s %-6s %d" % (k[0], k[1], by[k]))
    print("swing:", sum(1 for p in written if "swing" in p), "two-bar grooves:", sum(1 for p in written if p["bars"] == 2 and "tags" not in p))
    written.sort(key=lambda p: (p["style"], "tags" in p, p["name"], p["bpm"], p["author"]))
    for p in written:
        names[p["name"]] += 1
        if names[p["name"]] > 1:
            p["name"] = "%s %d" % (p["name"], names[p["name"]])
    if not dry:
        with open(OUT, "w", encoding="utf-8") as f:
            f.write("[\n" + ",\n".join(json.dumps(p, separators=(",", ":"), ensure_ascii=False) for p in written) + "\n]\n")
        print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
