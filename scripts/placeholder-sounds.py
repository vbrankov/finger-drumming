"""Generate crude placeholder drum WAVs into public/sounds/.

Dev-only. Real samples with the same file names replace these outright.
Run: python scripts/placeholder-sounds.py
"""
import math
import os
import random
import struct
import wave

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "sounds")


def write(name, samples):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32000)) for s in samples))
    print("wrote", path)


def env(t, decay):
    return math.exp(-t * decay)


def tone(freq, dur, decay, pitch_drop=0.0):
    out = []
    for i in range(int(SR * dur)):
        t = i / SR
        f = freq * (1 + pitch_drop * env(t, 40))
        out.append(math.sin(2 * math.pi * f * t) * env(t, decay))
    return out


def noise(dur, decay, seed=1, lowpass=0.0):
    rnd = random.Random(seed)
    out, prev = [], 0.0
    for i in range(int(SR * dur)):
        t = i / SR
        n = rnd.uniform(-1, 1)
        prev = prev * lowpass + n * (1 - lowpass)
        out.append(prev * env(t, decay))
    return out


def mix(*parts):
    n = max(len(p) for p in parts)
    return [sum(p[i] if i < len(p) else 0 for p in parts) / len(parts) * 1.6 for i in range(n)]


write("kick.wav", tone(55, 0.4, 8, pitch_drop=2.5))
write("kick2.wav", tone(70, 0.3, 12, pitch_drop=1.5))
write("snare.wav", mix(tone(190, 0.25, 20), noise(0.25, 18, seed=2)))
write("snare2.wav", mix(tone(220, 0.2, 25), noise(0.2, 25, seed=3)))
write("hat-closed.wav", noise(0.08, 60, seed=4))
write("hat-open.wav", noise(0.4, 8, seed=5))
write("clap.wav", noise(0.2, 22, seed=6, lowpass=0.3))
write("rim.wav", mix(tone(800, 0.06, 80), noise(0.04, 120, seed=7)))
write("tom-hi.wav", tone(200, 0.35, 9, pitch_drop=0.8))
write("tom-mid.wav", tone(150, 0.4, 8, pitch_drop=0.8))
write("tom-lo.wav", tone(110, 0.45, 7, pitch_drop=0.8))
write("ride.wav", mix(tone(1200, 0.8, 4), noise(0.8, 4, seed=8, lowpass=0.6)))
write("crash.wav", noise(1.2, 3, seed=9, lowpass=0.2))
write("perc1.wav", tone(500, 0.15, 30, pitch_drop=0.5))
write("perc2.wav", tone(350, 0.15, 30, pitch_drop=0.5))
write("fx.wav", tone(900, 0.5, 6, pitch_drop=-0.6))
