# Finger Drumming

**Live: https://vbrankov.github.io/finger-drumming/**

Practice tool for a 4×4 pad controller (or the on-screen pads / keyboard):
build patterns in a step grid, then play them while the app grades every hit
in milliseconds. Everything runs in the browser; songs, kits and scores stay
on your device. Share a song or kit with a link. Design and decisions:
[DESIGN.md](DESIGN.md).

## Run

```bash
npm install
npm run dev
```

Open in Chrome or Edge (Web MIDI). Allow MIDI access when prompted.

First time: **Settings → MIDI** to map your controller's pads (click a pad, hit
it), then **Calibration** to measure your latency. Without calibration every
hit will read 20–40 ms late.

## Layout

```
src/model/     song types, timing rules, grading  (pure, unit-tested)
src/engine/    Web Audio, scheduler, MIDI, sample storage, calibration
src/screens/   Songs · SongEditor · Practice · Kits · KitEditor · Settings
src/songs/     seed songs (JSON) copied into localStorage on first run
src/kits/      default kit definition
public/sounds/ bundled CC0 samples (see the README there) used by the default kit
```

## Tests

```bash
npm test
```

## License

Code: [MIT](LICENSE). Bundled drum samples: CC0, from the
[Sonic Pi](https://github.com/sonic-pi-net/sonic-pi) collection — see
[public/sounds/README.md](public/sounds/README.md).
