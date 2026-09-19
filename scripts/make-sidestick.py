"""Derive public/sounds/drum_sidestick.wav from the CC0 snare and tom samples.

The Sonic Pi set has no cross-stick. A cross-stick is the stick hitting rim
and head together: the snare's crack without its sustain, a woody knock, and
a short tick. Re-run after changing the recipe:  python scripts/make-sidestick.py
"""
import os
import wave

import numpy as np

HERE = os.path.dirname(__file__)
SOUNDS = os.path.join(HERE, "..", "public", "sounds")


def read(name):
    w = wave.open(os.path.join(SOUNDS, name))
    sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
    d = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    w.close()
    if ch > 1:
        d = d.reshape(-1, ch).mean(axis=1)
    return d, sr


def onset(d):
    i = np.where(np.abs(d) > 0.1 * np.abs(d).max())[0]
    return int(i[0]) if len(i) else 0


snare, sr = read("drum_snare_hard.wav")
tom, _ = read("drum_tom_hi_hard.wav")
n = int(sr * 0.25)
s = snare[onset(snare):][:n]
t = tom[onset(tom):][:n]
s = np.pad(s, (0, n - len(s)))
t = np.pad(t, (0, n - len(t)))
tt = np.arange(n) / sr

crack = s * np.exp(-tt / 0.018)  # attack and a hint of wires, no sustain
knock = t * np.exp(-tt / 0.010) * 0.6  # woody body of the stick on the rim
tick = np.sin(2 * np.pi * 2600 * tt) * np.exp(-tt / 0.004) * 0.5  # rim contact
out = crack + knock + tick

# one-pole high-pass at 250 Hz: drop the snare's low thump
y = x1 = 0.0
a = np.exp(-2 * np.pi * 250 / sr)
hp = np.zeros_like(out)
for i, x in enumerate(out):
    y = a * (y + x - x1)
    x1 = x
    hp[i] = y
out = hp / (np.abs(hp).max() + 1e-9) * 0.9

idx = np.where(np.abs(out) > 10 ** (-50 / 20))[0]
out = out[: int(idx[-1]) + int(sr * 0.01)]
fade = np.linspace(1, 0, int(sr * 0.005))
out[-len(fade) :] *= fade

w = wave.open(os.path.join(SOUNDS, "drum_sidestick.wav"), "wb")
w.setnchannels(1)
w.setsampwidth(2)
w.setframerate(sr)
w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
w.close()
print("wrote drum_sidestick.wav", round(len(out) / sr, 3), "s")
