// Regenerates src/sounds/manifest.json from the files in public/sounds.
// Run after adding or removing bundled samples: npm run sounds
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'sounds');
const out = join(root, 'src', 'sounds', 'manifest.json');

const FAMILY_LABELS = {
  bd: 'Bass Drum',
  drum: 'Drum',
  sn: 'Snare',
  hat: 'Hi-Hat',
  ride: 'Ride',
  perc: 'Percussion',
  tabla: 'Tabla',
  elec: 'Electronic',
  glitch: 'Glitch',
  misc: 'Misc',
};
const ORDER = Object.keys(FAMILY_LABELS);

const humanize = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const sounds = readdirSync(dir)
  .filter((f) => /\.(flac|wav|mp3|ogg)$/i.test(f))
  .map((file) => {
    const name = file.replace(/\.[^.]+$/, '');
    const [prefix, ...rest] = name.split('_');
    const family = FAMILY_LABELS[prefix] ? prefix : 'misc';
    const label = humanize(FAMILY_LABELS[prefix] ? rest.join('_') : name);
    return { file, family, label };
  })
  .sort((a, b) => ORDER.indexOf(a.family) - ORDER.indexOf(b.family) || a.label.localeCompare(b.label));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ families: FAMILY_LABELS, sounds }, null, 2) + '\n');
console.log('wrote', out, '-', sounds.length, 'sounds');
