# Bundled samples

Every file here is from the Sonic Pi project's sample collection
(https://github.com/sonic-pi-net/sonic-pi/tree/dev/etc/samples). Per its
README they are sourced from freesound.org and released under Creative Commons
0 (public domain): http://creativecommons.org/publicdomain/zero/1.0/

`drum_sidestick.wav` is not from Sonic Pi: it is derived here from
`drum_snare_hard` and `drum_tom_hi_hard` (their attacks with a fast decay and
a short tick), so it inherits their CC0 status. The set has no recorded
cross-stick.

File names are otherwise Sonic Pi's own, converted from FLAC to 16-bit WAV so every
browser decodes them (FLAC decoding proved unreliable in some browsers). The
percussive families are included
(bd, drum, sn, hat, ride, perc, tabla, elec, glitch, misc); loops, ambient
textures and pitched instruments are not.

`src/sounds/manifest.json` lists them for the kit editor's picker; regenerate
it with `npm run sounds` after adding or removing files.
