"""Write the seed patterns in src/patterns/. Edit the SONGS table and re-run:
    python scripts/seed-patterns.py

Pads (Quest for Groove layout, row-major from the top):
    0 Low Tom   1 Mid Tom   2 High Tom  3 Crash
    4 Closed Hat(L) 5 Open Hat  6 Closed Hat(R) 7 Ride
    8 Sidestick 9 Snare(L)  10 Snare(R) 11 Sidestick
    12 Crash 2  13 Kick(L)  14 Kick(R)  15 Cymbal
Pads sharing a role are interchangeable in grading; the L/R choice only shows
the intended hand in the grid.
"""
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "patterns")
ACCENT, GHOST = 127, 40
K, K2, S, S2, H, H2, OH, RIDE, CR, CR2, SS, LT, MT, HT, CYM = 13, 14, 9, 10, 4, 6, 5, 7, 3, 12, 8, 0, 1, 2, 15


def hits(*groups):
    """groups: (pad, [steps]) or (pad, [steps], velocity)."""
    out = []
    for g in groups:
        pad, steps = g[0], g[1]
        vel = g[2] if len(g) > 2 else None
        for s in steps:
            h = {"pad": pad, "step": s}
            if vel:
                h["velocity"] = vel
            out.append(h)
    out.sort(key=lambda h: (h["step"], h["pad"]))
    return out


E8 = list(range(0, 16, 2))  # eighth notes
E16 = list(range(16))       # sixteenths
BEATS = [0, 4, 8, 12]
OFF8 = [2, 6, 10, 14]

SONGS = [
    # id, name, difficulty, bpm, bars, hits
    ("four-on-the-floor", "Four on the Floor", 1, 122, 1, hits(
        (K, BEATS), (S, [4, 12]), (OH, OFF8))),
    ("basic-rock", "Basic Rock", 1, 90, 1, hits(
        (K, [0, 8]), (S, [4, 12]), (H, E8))),
    ("money-beat-accents", "Money Beat, Accented Hats", 2, 96, 1, hits(
        (K, [0, 8, 10]), (S, [4, 12]), (H, BEATS, ACCENT), (H, OFF8))),
    ("motown", "Motown", 2, 112, 1, hits(
        (K, BEATS), (S, BEATS, ACCENT), (H, E8))),
    ("disco", "Disco", 2, 118, 1, hits(
        (K, BEATS), (S, [4, 12]), (H, BEATS), (OH, OFF8))),
    ("half-time", "Half-time", 2, 80, 1, hits(
        (K, [0, 10]), (S, [8], ACCENT), (H, E8), (H, [0, 8], ACCENT))),
    ("one-drop", "Reggae One Drop", 2, 76, 1, hits(
        (K, [8]), (SS, [8]), (H, [s for s in E8 if s != 14]), (OH, [14]))),
    ("boom-bap", "Boom Bap", 3, 88, 1, hits(
        (K, [0, 7, 10]), (S, [4, 12]), (S, [3, 11], GHOST), (H, BEATS, ACCENT), (H, [2, 6, 10]), (OH, [14])),
        {"amount": 56, "unit": "sixteenth"}),
    ("funk-ghosts", "Funk with Ghost Notes", 3, 100, 1, hits(
        (K, [0, 10]), (S, [4, 12], ACCENT), (S, [7, 11, 15], GHOST), (H, E8)),
        {"amount": 55, "unit": "sixteenth"}),
    ("tom-groove", "Tom Groove", 3, 100, 1, hits(
        (K, [0, 8]), (S, [4, 12]), (LT, [2, 10]), (HT, [6, 14]))),
    ("sixteenth-hats", "Sixteenth Hats (two hands)", 3, 92, 1, hits(
        (K, [0, 8, 10]),
        (S, [4, 12], ACCENT),
        (H, [0, 2, 6, 8, 10, 14]),
        (H2, [1, 3, 5, 7, 9, 11, 13, 15]),
        (H, [0, 8], ACCENT))),
    ("rock-with-fill", "Rock with Fill", 2, 92, 2, hits(
        (K, [0, 8, 10, 16, 24]), (S, [4, 12, 20]), (H, list(range(0, 24, 2))),
        (S, [24, 25]), (HT, [26, 27]), (MT, [28, 29]), (LT, [30]), (CR, [31]))),
    ("bossa-nova", "Bossa Nova", 3, 132, 2, hits(
        (K, [0, 6, 8, 14, 16, 22, 24, 30]),
        (SS, [0, 3, 6, 18, 21]),
        (H, list(range(0, 32, 2))))),
    ("drum-and-bass", "Drum & Bass", 4, 172, 2, hits(
        (K, [0, 10, 16, 22, 26]), (S, [4, 12, 20, 28], ACCENT), (H, [s for s in range(0, 32, 2) if s != 30]), (OH, [30]))),
    ("trap-hats", "Trap Hats", 4, 70, 1, hits(
        (K, [0, 7, 9]), (S, [8], ACCENT), (H, [0, 2, 4, 6, 8, 10, 12, 14]), (H2, [1, 3, 5, 7, 9, 11, 13]), (OH, [15]))),
    ("breakbeat", "Breakbeat", 4, 96, 2, hits(
        (K, [0, 6, 10, 16, 21, 26]), (S, [4, 12, 20, 28], ACCENT), (S, [15, 23, 31], GHOST),
        (H, [s for s in range(0, 32, 2) if s not in (14, 30)]), (OH, [14, 30])),
        {"amount": 54, "unit": "sixteenth"}),
    ("linear-funk", "Linear Funk", 5, 96, 1, hits(
        (K, [0, 6, 8]), (H, [2, 3, 10, 11, 14, 15]), (S, [4, 12], ACCENT), (H2, [7])),
        {"amount": 55, "unit": "sixteenth"}),
    # Phrases: how a groove is actually played — crash on the downbeat, three bars
    # of groove, a fill in bar 4 that lands back on the crash. Hats drop out during fills.
    ("basic-rock-one-beat-fill", "Basic Rock, One-beat Fill", 2, 90, 2, hits(
        (K, [0, 8, 16, 24]), (S, [4, 12, 20]), (H, list(range(0, 28, 2))),
        (S, [28, 29, 30, 31]))),
    ("basic-rock-phrase", "Basic Rock Phrase", 2, 92, 4, hits(
        (CR, [0]),
        (K, [0, 8, 16, 24, 32, 40, 48, 56]), (S, [4, 12, 20, 28, 36, 44, 52]),
        (H, list(range(2, 56, 2))),
        (S, [56, 58]), (S, [60, 61]), (HT, [62]), (LT, [63]))),
    ("money-beat-phrase", "Money Beat Phrase", 3, 96, 4, hits(
        (CR, [0]),
        (K, [0, 8, 10, 16, 24, 26, 32, 40, 42, 48, 56]), (S, [4, 12, 20, 28, 36, 44, 52]),
        (H, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52], ACCENT), (H, [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50, 54]),
        (S, [56, 57]), (HT, [58, 59]), (MT, [60, 61]), (LT, [62]), (S, [63], ACCENT))),
    # Swung feels: the off-beat notes land late (see Swing in the design doc).
    ("swung-hip-hop", "Swung Hip Hop", 3, 90, 1, hits(
        (K, [0, 7, 10]), (S, [4, 12], ACCENT), (S, [15], GHOST), (H, E8), (H2, [3, 11])),
        {"amount": 62, "unit": "sixteenth"}),
    ("blues-shuffle", "Blues Shuffle", 3, 104, 1, hits(
        (K, BEATS), (S, [4, 12], ACCENT), (H, BEATS, ACCENT), (H, OFF8)),
        {"amount": 66, "unit": "eighth"}),
    ("jazz-ride", "Jazz Ride", 4, 140, 1, hits(
        (RIDE, [0, 8]), (RIDE, [4, 12], ACCENT), (RIDE, [6, 14]), (H, [4, 12])),
        {"amount": 66, "unit": "eighth"}),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    seen = set()
    for entry in SONGS:
        slug, name, difficulty, bpm, bars, hs = entry[:6]
        swing = entry[6] if len(entry) > 6 else None
        uniq = {}
        for h in hs:
            uniq[(h["pad"], h["step"])] = h
        hs = sorted(uniq.values(), key=lambda h: (h["step"], h["pad"]))
        assert all(0 <= h["step"] < bars * 16 for h in hs), slug
        song = {
            "id": "seed-" + slug,
            "name": name,
            "author": "Claude",
            "difficulty": difficulty,
            "bpm": bpm,
            **({"bars": bars} if bars > 1 else {}),
            **({"swing": swing} if swing else {}),
            "kitId": "default",
            "createdAt": "2026-09-16T00:00:00.000Z",
            "updatedAt": "2026-09-16T00:00:00.000Z",
        }
        head = json.dumps(song, indent=2, ensure_ascii=False)[:-2]
        body = ",\n".join("    " + json.dumps(h, separators=(", ", ": ")) for h in hs)
        path = os.path.join(OUT, slug + ".json")
        with open(path, "w", encoding="utf-8") as f:
            f.write(head + ',\n  "hits": [\n' + body + "\n  ]\n}\n")
        seen.add(slug + ".json")
        print(f"{name:32s} d{difficulty} {bpm:3d} bpm {bars} bar {len(hs):2d} hits" + (f"  swing {swing['amount']}% {swing['unit']}" if swing else ""))
    for f in os.listdir(OUT):
        if f.endswith(".json") and f not in seen:
            print("stale:", f)


if __name__ == "__main__":
    main()
