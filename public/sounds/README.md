# Bundled samples

Every file here is from the Sonic Pi project's sample collection
(https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples). Per its
README they are sourced from freesound.org and released under Creative Commons
0 (public domain): http://creativecommons.org/publicdomain/zero/1.0/

`drum_sidestick.wav` is not from Sonic Pi (the set has no recorded
cross-stick). It is "acoustic side stick.wav" by KEVOY on freesound.org,
https://freesound.org/people/KEVOY/sounds/82280/ , Creative Commons 0
(public domain), trimmed to 0.3 s and converted to mono 16-bit 44.1 kHz.

File names are otherwise Sonic Pi's own, converted from FLAC to 16-bit WAV so every
browser decodes them (FLAC decoding proved unreliable in some browsers). The
percussive families are included
(bd, drum, sn, hat, ride, perc, tabla, elec, glitch, misc); loops, ambient
textures and pitched instruments are not.

`src/sounds/manifest.json` lists them for the kit editor's picker; regenerate
it with `npm run sounds` after adding or removing files.
